// @ts-nocheck
import React from 'react';
import { Mic2, Drum, Music, Piano } from 'lucide-react';
import BassIcon from '../../assets/icons/BassIcon.jsx';
import GuitarIcon from '../../assets/icons/GuitarIcon.jsx';
import VolumeSlider from './VolumeSlider.jsx';
import { useRemixContext } from '../../context/RemixContext';
import { useRemixStore } from '../../store/useRemixStore';

const allTracks = [
  { id: 'vocals', label: 'Vocals', icon: Mic2 },
  { id: 'drums', label: 'Drums', icon: Drum },
  {
    id: 'bass',
    label: 'Bass',
    icon: () => <BassIcon className='w-7 h-7 sm:w-8 sm:h-8' />
  },
  {
    id: 'guitar',
    label: 'Guitar',
    icon: () => <GuitarIcon className='w-7 h-7 sm:w-8 sm:h-8' />
  },
  { id: 'piano', label: 'Piano', icon: Piano },
  { id: 'other', label: 'Other', icon: Music }
];

const MixerControls = () => {
  const { stems, handleVolumeChange, handleVolumeCommit } = useRemixContext();
  const volumes = useRemixStore(state => state.volumes);
  
  // filter tracks
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
