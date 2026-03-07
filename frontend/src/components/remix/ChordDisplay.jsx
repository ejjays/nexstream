import React, { useMemo } from 'react';

const ChordDisplay = ({ chords, beats, currentTime, currentBeatIdx, gridShift, beatFlash }) => {
  // 1. PRE-CALCULATE CHORD MAP (Strict index-based mapping with GRID SHIFT)
  const beatMap = useMemo(() => {
    if (!beats || !chords || beats.length === 0) return [];

    return beats.map((beatTime, idx) => {
      // THE FIX: Nudge the detection time by the gridShift (in beats)
      // We look at the chord that WAS intended for (current index + shift)
      const shiftedIdx = idx + gridShift;
      const safeIdx = Math.max(0, Math.min(beats.length - 1, shiftedIdx));
      const targetTime = beats[safeIdx] + 0.02; 
      
      const activeChord = chords.findLast(c => c.time <= targetTime);
      
      // Detection for 'isNew' label using the same shifted logic
      const prevShiftedIdx = (idx - 1) + gridShift;
      const prevSafeIdx = Math.max(0, Math.min(beats.length - 1, prevShiftedIdx));
      const prevTargetTime = idx > 0 ? beats[prevSafeIdx] + 0.02 : -1;
      const prevChord = idx > 0 ? chords.findLast(c => c.time <= prevTargetTime) : null;
      
      const isNew = idx === 0 || (activeChord && (!prevChord || activeChord.time !== prevChord.time));

      return {
        chord: activeChord ? activeChord.chord : '',
        isNew: isNew,
        index: idx
      };
    });
  }, [beats, chords, gridShift]);

  // 2. FIND ANCHOR (Strictly based on where we are walking)
  const currentSectionStartIdx = useMemo(() => {
    if (currentBeatIdx === -1) return 0;
    for (let i = currentBeatIdx; i >= 0; i--) {
      if (beatMap[i]?.isNew) return i;
    }
    return 0;
  }, [currentBeatIdx, beatMap]);

  // 3. HARD-LOCKED SCROLL OFFSET
  const scrollOffset = useMemo(() => {
    if (currentBeatIdx === -1) return 0;
    
    const beatWidth = 64 + 6; // w-16 (64px) + gap-1.5 (6px)
    const anchorOffset = beatWidth * 2; 
    
    const beatsSinceSectionStart = currentBeatIdx - currentSectionStartIdx;
    const pageNumber = Math.floor(beatsSinceSectionStart / 8);
    const jumpOffset = pageNumber * 8 * beatWidth;
    
    const target = (currentSectionStartIdx * beatWidth) + jumpOffset - anchorOffset;
    return -Math.max(0, target);
  }, [currentSectionStartIdx, currentBeatIdx]);

  if (!beats || beats.length === 0) return null;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-5xl relative overflow-hidden">
        <div 
          className="w-full flex items-center border-y border-white/5 bg-zinc-900/10 py-2 sm:py-4 px-4"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)'
          }}
        >
          <div 
            className="flex gap-1.5 pr-[90%] will-change-transform transition-transform duration-500"
            style={{ 
              transform: `translateX(${scrollOffset}px)`,
              transitionTimingFunction: 'cubic-bezier(0.2, 0, 0.1, 1)'
            }}
          >
            {beatMap.map((item, idx) => {
              const isActive = idx === currentBeatIdx;
              
              return (
                <div
                  key={idx}
                  className={`
                    w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-sm shrink-0 transition-colors duration-75
                    ${isActive 
                      ? 'bg-cyan-400 z-10 border border-white/20' 
                      : 'bg-zinc-800/60 border border-white/10'}
                  `}
                >
                  <span className={`font-black tracking-tighter text-xl sm:text-2xl transition-colors duration-75 ${isActive ? 'text-white' : 'text-cyan-400 opacity-90'}`}>
                    {item.isNew ? item.chord : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-100 ${beatFlash ? 'bg-cyan-400 scale-150 shadow-[0_0_10px_#22d3ee]' : 'bg-zinc-800'}`} />
        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Moises Precision Grid</span>
      </div>
    </div>
  );
};

export default ChordDisplay;
