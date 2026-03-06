import React from 'react';
import { Mic2, Drum, Guitar, Music, Piano, MoreVertical } from 'lucide-react';

const allTracks = [
  { id: 'vocals', label: 'Vocals', icon: Mic2 },
  { id: 'drums', label: 'Drums', icon: Drum },
  { id: 'bass', label: 'Bass', icon: Guitar },
  { id: 'guitar', label: 'Guitar', icon: Guitar },
  { id: 'piano', label: 'Piano', icon: Piano },
  { id: 'other', label: 'Other', icon: Music }
];

const MixerControls = ({ stems, volumes, handleVolumeChange }) => {
  const activeTracks = stems ? allTracks.filter(t => stems[t.id]) : [];

  return (
    <div className='w-full max-w-2xl flex flex-col justify-center space-y-4 sm:space-y-8 mt-2 sm:mt-4 px-2 sm:px-0 shrink-0'>
      {activeTracks.map(track => (
        <div key={track.id} className='flex items-center gap-3 sm:gap-6'>
          <track.icon
            size={20}
            className='text-white shrink-0 sm:w-7 sm:h-7'
            strokeWidth={1.2}
          />
          <div className='flex-1 relative flex items-center'>
            <input
              type='range'
              min='0'
              max='1'
              step='0.01'
              value={volumes[track.id]}
              onChange={e => handleVolumeChange(track.id, e.target.value)}
              className='w-full h-[2px] sm:h-[3px] bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none remix-slider'
              style={{
                background: `linear-gradient(to right, #22d3ee ${
                  volumes[track.id] * 100
                }%, #27272a ${volumes[track.id] * 100}%)`
              }}
            />
          </div>
          <button className='text-zinc-600 hover:text-zinc-300 transition-colors'>
            <MoreVertical size={18} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default MixerControls;
