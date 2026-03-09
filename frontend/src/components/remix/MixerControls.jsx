import React from 'react';
import { Mic2, Drum, Guitar, Music, Piano } from 'lucide-react';
import VolumeSlider from './VolumeSlider.jsx';

const allTracks = [
  { id: 'vocals', label: 'Vocals', icon: Mic2 },
  { id: 'drums', label: 'Drums', icon: Drum },
  { id: 'bass', label: 'Bass', icon: Guitar },
  { id: 'guitar', label: 'Guitar', icon: Guitar },
  { id: 'piano', label: 'Piano', icon: Piano },
  { id: 'other', label: 'Other', icon: Music }
];

const MixerControls = ({ stems, volumes, handleVolumeChange, handleVolumeCommit }) => {
  const activeTracks = stems ? allTracks.filter(t => stems[t.id]) : [];

  return (
    <div className='w-full max-w-2xl flex flex-col justify-center gap-[2.5vh] sm:gap-6 mt-1 sm:mt-2 px-2 sm:px-0'>
      {activeTracks.map(track => (
        <VolumeSlider
          key={track.id}
          track={track}
          initialVolume={volumes[track.id]}
          onVolumeChange={handleVolumeChange}
          onVolumeCommit={handleVolumeCommit}
        />
      ))}
    </div>
  );
};

export default MixerControls;
