import React, { useMemo, useEffect, useState } from 'react';

const FIXED_BPM = 70;
const SECONDS_PER_BEAT = 60 / FIXED_BPM;

const ChordDisplay = ({ chords, beats, currentTime, gridShift, beatFlash }) => {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const gridMap = {};
    for (const c of chords) {
      const idx = Math.round(c.time / SECONDS_PER_BEAT) - gridShift;
      if (idx < 0) continue;
      const centerTime = (idx + gridShift) * SECONDS_PER_BEAT;
      const dist = Math.abs(c.time - centerTime);

      if (!gridMap[idx]) {
        gridMap[idx] = { ...c, dist };
      } else {
        const currentIsPassing = gridMap[idx].is_passing;
        const newIsPassing = c.is_passing;

        if (!newIsPassing && currentIsPassing) {
          gridMap[idx] = { ...c, dist };
        } else if (
          dist < gridMap[idx].dist &&
          newIsPassing === currentIsPassing
        ) {
          gridMap[idx] = { ...c, dist };
        }
      }
    }

    return Array.from({ length: fixedGridLength }).map((_, idx) => ({
      index: idx,
      chord: gridMap[idx] ? gridMap[idx].chord : null,
      isPassing: gridMap[idx] ? gridMap[idx].is_passing || false : false
    }));
  }, [chords, fixedGridLength, gridShift]);

  const boxLayouts = useMemo(() => {
    const isSmall = windowWidth < 640;
    const baseWidth = isSmall ? 60 : 70;
    const gap = 6;

    let currentX = 0;
    return visualBeatMap.map(item => {
      const chordLen = item.chord?.length || 0;

      let width = baseWidth;
      if (chordLen > 8) width = baseWidth * 1.8;
      else if (chordLen > 6) width = baseWidth * 1.6;
      else if (chordLen > 4) width = baseWidth * 1.4;
      else if (chordLen > 3) width = baseWidth * 1.2;

      if (item.isPassing) {
        width = baseWidth * 0.85;
      }

      const layout = { x: currentX, width };
      currentX += width + gap;
      return layout;
    });
  }, [visualBeatMap, windowWidth]);

  const activeScrollIdx = useMemo(() => {
    if (currentFixedBeatIdx < 0) return 0;

    let lastChordIdx = 0;
    let idx = currentFixedBeatIdx;
    while (idx >= 0) {
      if (visualBeatMap[idx] && visualBeatMap[idx].chord) {
        lastChordIdx = idx;
        break;
      }
      idx--;
    }

    const maxWalk = windowWidth < 640 ? 3 : 5;
    if (currentFixedBeatIdx - lastChordIdx > maxWalk) {
      return currentFixedBeatIdx - maxWalk;
    }
    return lastChordIdx;
  }, [currentFixedBeatIdx, visualBeatMap, windowWidth]);

  const scrollOffset = useMemo(() => {
    if (!boxLayouts[activeScrollIdx]) return 0;
    const isSmall = windowWidth < 640;
    const currentBox = boxLayouts[activeScrollIdx];

    const anchorOffset = (isSmall ? 56 : 64) * 2;
    const target = currentBox.x - anchorOffset;
    return -target;
  }, [activeScrollIdx, boxLayouts, windowWidth]);

  if (!beats || beats.length === 0) return null;

  return (
    <div className='w-full flex flex-col items-center'>
      <div className='w-full max-w-5xl relative overflow-hidden'>
        <div
          className='w-full flex items-center border-y border-white/5 bg-zinc-900/10 py-2 sm:py-4 px-4'
          style={{
            maskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 15%, black 85%, transparent)'
          }}
        >
          <div
            className='flex gap-1.5 pr-[90%] will-change-transform'
            style={{
              transform: `translateX(${scrollOffset}px)`,
              transitionProperty: 'transform',
              transitionDuration: '300ms',
              transitionTimingFunction: 'ease-out'
            }}
          >
            {visualBeatMap.map((item, idx) => {
              const isActive = idx === currentFixedBeatIdx;
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
              let textStyle = 'text-zinc-300 font-medium'; // passing chords : light gray

              if (item.chord && !isPassing) {
                textStyle = 'text-cyan-400 font-bold tracking-wide'; // root chords : bold
                boxStyle = 'bg-zinc-800/90 border border-white/10 z-15';
              }

              if (isActive) {
                if (isPassing) {
                  boxStyle =
                    'bg-zinc-700 z-20 border border-zinc-400 shadow-[0_0_15px_rgba(161,161,170,0.3)] scale-105';
                  textStyle = 'text-white font-bold';
                } else {
                  boxStyle =
                    'bg-cyan-400 z-30 border border-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.6)] scale-110';
                  textStyle = 'text-white font-black';
                }
              }

              return (
                <div
                  key={idx}
                  className={`h-14 sm:h-16 relative flex items-center justify-center rounded-sm shrink-0 transition-all duration-75 ${boxStyle}`}
                  style={{ width: `${layout.width}px` }}
                >
                  {item.chord && (
                    <span
                      className={`tracking-tighter pointer-events-none text-center px-1 leading-none ${textStyle}`}
                      style={{
                        fontSize: `${finalFontSize}px`,
                        width: '100%',
                        whiteSpace: 'nowrap',
                        textShadow: isActive
                          ? 'none'
                          : '0 1px 3px rgba(0,0,0,0.8)'
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

      <div className='mt-2 flex items-center gap-2'>
        <div
          className={`w-1.5 h-1.5 rounded-full transition-all duration-100 ${
            beatFlash
              ? 'bg-cyan-400 scale-150 shadow-[0_0_10px_#22d3ee]'
              : 'bg-zinc-800'
          }`}
        />
        <span className='text-[8px] font-bold text-zinc-600 uppercase tracking-[0.2em]'>
          Moises Precision Grid
        </span>
      </div>
    </div>
  );
};

export default ChordDisplay;
