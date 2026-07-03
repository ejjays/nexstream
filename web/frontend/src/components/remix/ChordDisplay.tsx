import React, { useMemo, useEffect, useState } from 'react';
import { useRemixStore } from '../../store/useRemixStore';

const FIXED_BPM = 70;
const SECONDS_PER_BEAT = 60 / FIXED_BPM;

interface Chord {
  time: number;
  chord: string;
  is_passing?: boolean;
}

interface ChordDisplayProps {
  chords: Chord[];
  beats: number[];
  gridShift: number;
}

const ChordDisplay = ({ chords, beats, gridShift }: ChordDisplayProps) => {
  const currentTime = useRemixStore((state) => state.currentTime);
  const beatFlash = useRemixStore((state) => state.beatFlash);
  const isPlaying = useRemixStore((state) => state.isPlaying);

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [manualOffset, setManualOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const dragStartX = React.useRef(0);
  const dragStartOffset = React.useRef(0);
  const currentManualOffset = React.useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    // skipcq: JS-0045
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      setManualOffset(0);
      currentManualOffset.current = 0;
      setIsDragging(false);
    }
  }, [isPlaying]);

  const maxTime = useMemo(() => {
    let max = 0;
    if (beats && beats.length > 0) max = Math.max(max, beats[beats.length - 1]);
    if (chords && chords.length > 0)
      max = Math.max(max, chords[chords.length - 1].time);
    return max + 20;
  }, [beats, chords]);

  const fixedGridLength = useMemo(
    () => Math.ceil(maxTime / SECONDS_PER_BEAT) + 32,
    [maxTime]
  );

  const currentFixedBeatIdx = useMemo(() => {
    const rawIdx = Math.round(Math.max(0, currentTime) / SECONDS_PER_BEAT);
    return rawIdx - gridShift;
  }, [currentTime, gridShift]);

  const visualBeatMap = useMemo(() => {
    if (!chords) return [];
    const gridMap: Record<number, (typeof chords)[number] & { dist: number }> =
      {};
    for (const chordItem of chords) {
      const idx = Math.round(chordItem.time / SECONDS_PER_BEAT) - gridShift;
      if (idx < 0) continue;
      const centerTime = (idx + gridShift) * SECONDS_PER_BEAT;
      const dist = Math.abs(chordItem.time - centerTime);

      if (!gridMap[idx]) {
        gridMap[idx] = { ...chordItem, dist };
      } else {
        const currentIsPassing = gridMap[idx].is_passing;
        const newIsPassing = chordItem.is_passing;

        if (!newIsPassing && currentIsPassing) {
          gridMap[idx] = { ...chordItem, dist };
        } else if (
          dist < gridMap[idx].dist &&
          newIsPassing === currentIsPassing
        ) {
          gridMap[idx] = { ...chordItem, dist };
        }
      }
    }

    const placeholderCount = 8;
    const placeholders = Array.from({ length: placeholderCount }).map(
      (_, idx) => ({
        index: -placeholderCount + idx,
        chord: null,
        isPassing: false,
      })
    );

    const chordBoxes = Array.from({ length: fixedGridLength }).map(
      (_, idx) => ({
        index: idx,
        chord: gridMap[idx] ? gridMap[idx].chord : null,
        isPassing: gridMap[idx] ? gridMap[idx].is_passing || false : false,
      })
    );

    return [...placeholders, ...chordBoxes];
  }, [chords, fixedGridLength, gridShift]);

  const boxLayouts = useMemo(() => {
    const isSmall = windowWidth < 640;
    const baseWidth = isSmall ? 60 : 70;
    const gap = 6;

    let currentX = 0;

    // visualBeatMap already includes placeholders, map directly
    const layouts = visualBeatMap.map((item) => {
      const chordLen = item.chord?.length || 0;

      let width = baseWidth;
      if (chordLen > 8) width = baseWidth * 2.5;
      else if (chordLen > 6) width = baseWidth * 2.0;
      else if (chordLen > 4) width = baseWidth * 1.7;
      else if (chordLen > 3) width = baseWidth * 1.4;

      if (item.isPassing) {
        width = Math.max(width * 0.8, baseWidth * 0.85);
      }

      const layout = { x: currentX, width };
      currentX += width + gap;
      return layout;
    });

    return layouts;
  }, [visualBeatMap, windowWidth]);

  const activeScrollIdx = useMemo(() => {
    const placeholderCount = 8;
    const adjustedBeatIdx = currentFixedBeatIdx + placeholderCount;

    if (adjustedBeatIdx < 0) return 0;

    let lastChordIdx = 0;
    let idx = adjustedBeatIdx;
    while (idx >= placeholderCount) {
      if (visualBeatMap[idx]?.chord) {
        lastChordIdx = idx;
        break;
      }
      idx--;
    }

    const maxWalk = windowWidth < 640 ? 3 : 5;
    if (adjustedBeatIdx - lastChordIdx > maxWalk) {
      return adjustedBeatIdx - maxWalk;
    }
    return lastChordIdx;
  }, [currentFixedBeatIdx, visualBeatMap, windowWidth]);

  const scrollOffset = useMemo(() => {
    if (!boxLayouts[activeScrollIdx]) return 0;
    const isSmall = windowWidth < 640;
    const currentBox = boxLayouts[activeScrollIdx];

    const anchorOffset = (isSmall ? 56 : 64) * 2;
    const target = currentBox.x - anchorOffset;
    const baseOffset = -target + (isPlaying ? 0 : manualOffset);

    // stop at first chord
    const placeholderCount = 8;
    const firstRealChordBox = boxLayouts[placeholderCount];
    const maxLeftScroll = firstRealChordBox
      ? -(firstRealChordBox.x - anchorOffset)
      : anchorOffset;

    return Math.min(baseOffset, maxLeftScroll);
  }, [activeScrollIdx, boxLayouts, windowWidth, isPlaying, manualOffset]);

  // render visible boxes only
  const visibleRange = useMemo(() => {
    const isSmall = windowWidth < 640;
    const viewportWidth = isSmall ? windowWidth : Math.min(windowWidth, 1024);
    const overscan = 5;

    let startIdx = 0;
    let endIdx = visualBeatMap.length;

    // first visible box
    for (let i = 0; i < boxLayouts.length; i++) {
      if (boxLayouts[i].x + boxLayouts[i].width + scrollOffset > 0) {
        startIdx = Math.max(0, i - overscan);
        break;
      }
    }

    // last visible box
    for (let i = startIdx; i < boxLayouts.length; i++) {
      if (boxLayouts[i].x + scrollOffset > viewportWidth) {
        endIdx = Math.min(boxLayouts.length, i + overscan);
        break;
      }
    }

    return { startIdx, endIdx };
  }, [boxLayouts, scrollOffset, windowWidth, visualBeatMap.length]);

  if (!beats || beats.length === 0) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPlaying) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartOffset.current = manualOffset;
    if (scrollRef.current) {
      scrollRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || isPlaying) return;
    e.preventDefault();
    const clientX = e.clientX;
    const deltaX = clientX - dragStartX.current;
    let newOffset = dragStartOffset.current + deltaX;

    // stop at first chord
    const isSmall = windowWidth < 640;
    const anchorOffset = (isSmall ? 56 : 64) * 2;
    const placeholderCount = 8;
    const firstRealChordBox = boxLayouts[placeholderCount];

    if (firstRealChordBox) {
      const currentAutoScroll = boxLayouts[activeScrollIdx]
        ? -(boxLayouts[activeScrollIdx].x - anchorOffset)
        : 0;
      const maxAutoScroll = -(firstRealChordBox.x - anchorOffset);
      const maxManualOffset = maxAutoScroll - currentAutoScroll;
      newOffset = Math.min(newOffset, maxManualOffset);
    }

    currentManualOffset.current = newOffset;

    // direct DOM for 60fps
    if (innerRef.current && firstRealChordBox) {
      const currentAutoScroll = boxLayouts[activeScrollIdx]
        ? -(boxLayouts[activeScrollIdx].x - anchorOffset)
        : 0;
      const maxAutoScroll = -(firstRealChordBox.x - anchorOffset);
      const totalOffset = Math.min(
        currentAutoScroll + newOffset,
        maxAutoScroll
      );
      innerRef.current.style.transform = `translateX(${totalOffset}px) translateZ(0)`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging && scrollRef.current) {
      scrollRef.current.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    setManualOffset(currentManualOffset.current);
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-5xl relative overflow-hidden">
        <div
          ref={scrollRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`w-full flex items-center border-y border-white/5 bg-zinc-900/10 py-2 sm:py-4 px-4 select-none ${!isPlaying ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{
            touchAction: isPlaying ? 'auto' : 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            maskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          }}
        >
          <div
            ref={innerRef}
            className="flex gap-1.5 pr-[90%] will-change-transform relative"
            style={{
              transform: `translateX(${scrollOffset}px) translateZ(0)`,
              transitionProperty: isDragging ? 'none' : 'transform',
              transitionDuration: isDragging ? '0ms' : '150ms',
              transitionTimingFunction: 'ease-out',
              minHeight: '64px',
              width: boxLayouts[boxLayouts.length - 1]
                ? `${boxLayouts[boxLayouts.length - 1].x + boxLayouts[boxLayouts.length - 1].width}px`
                : '100%',
            }}
          >
            {visualBeatMap
              .slice(visibleRange.startIdx, visibleRange.endIdx)
              .map((item, sliceIdx) => {
                const idx = visibleRange.startIdx + sliceIdx;
                const placeholderCount = 8;
                const isActive = idx === currentFixedBeatIdx + placeholderCount;
                const isSmall = windowWidth < 640;
                const chordLen = item.chord?.length || 0;
                const layout = boxLayouts[idx];
                const isPassing = item.isPassing;

                let fontSize = isSmall ? 22 : 26;
                if (chordLen > 8) fontSize *= 0.6;
                else if (chordLen > 6) fontSize *= 0.75;
                else if (chordLen > 4) fontSize *= 0.85;

                const finalFontSize = Math.max(fontSize, 10);

                let boxStyle = 'bg-zinc-800/90 border border-white/5 z-10';
                let textStyle = 'text-zinc-300 font-medium transition-none'; // neutral text

                if (item.chord && !isPassing) {
                  textStyle =
                    'text-cyan-400 font-bold tracking-wide transition-none'; // bold text
                  boxStyle = 'bg-zinc-800/90 border border-white/10 z-10';
                }

                if (isActive) {
                  if (isPassing) {
                    boxStyle =
                      'bg-zinc-700 z-20 border border-zinc-400 shadow-[0_0_10px_rgba(161,161,170,0.3)]';
                    textStyle = 'text-white font-bold transition-none';
                  } else {
                    boxStyle =
                      'bg-cyan-400 z-30 border border-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.6)]';
                    textStyle = 'text-white font-black transition-none';
                  }
                }

                return (
                  <div
                    key={idx}
                    className={`h-14 sm:h-16 flex items-center justify-center rounded-sm shrink-0 transition-all duration-0 px-2 absolute overflow-hidden ${boxStyle}`}
                    style={{
                      width: `${layout.width}px`,
                      left: `${layout.x}px`,
                    }}
                  >
                    {item.chord && (
                      <span
                        className={`tracking-tighter pointer-events-none text-center leading-none ${textStyle}`}
                        style={{
                          fontSize: `${finalFontSize}px`,
                          width: '100%',
                          whiteSpace: 'nowrap',
                          textShadow: isActive
                            ? 'none'
                            : '0 1px 3px rgba(0,0,0,0.8)',
                        }}
                      >
                        {item.chord}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          className={`w-1.5 h-1.5 rounded-full transition-all duration-100 ${
            beatFlash
              ? 'bg-cyan-400 scale-150 shadow-[0_0_10px_#22d3ee]'
              : 'bg-zinc-800'
          }`}
        />
        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-[0.2em]">
          Chords Precision Grid
        </span>
      </div>
    </div>
  );
};

export default ChordDisplay;
