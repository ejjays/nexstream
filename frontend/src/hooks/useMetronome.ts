import { useState, useEffect, useRef } from 'react';
import drumstickWav from '../assets/sounds/drumstick.wav';
import woodblockWav from '../assets/sounds/woodblock.wav';
import tickWav from '../assets/sounds/tick.wav';

export interface MetronomeHook {
  isMetronome: boolean;
  setIsMetronome: (val: boolean) => void;
  metroSound: string;
  setMetroSound: (sound: string) => void;
  metroVolume: number;
  setMetroVolume: (vol: number) => void;
  showMetroSheet: boolean;
  setShowMetroSheet: (show: boolean) => void;
  playTick: (isDownbeat: boolean) => void;
}

export const useMetronome = (): MetronomeHook => {
  const [isMetronome, setIsMetronome] = useState(false);
  const [metroSound, setMetroSound] = useState('stick');
  const [metroVolume, setMetroVolume] = useState(0.8);
  const [showMetroSheet, setShowMetroSheet] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const metroBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const metroSoundRef = useRef('stick');
  const metroVolumeRef = useRef(0.8);

  useEffect(() => {
    metroSoundRef.current = metroSound;
    metroVolumeRef.current = metroVolume;
  }, [metroSound, metroVolume]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const loadSound = async (name: string, url: string) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        metroBuffersRef.current[name] = audioBuffer;
      } catch (err) {
        console.error(`Failed to load metronome sound: ${name}`, err);
      }
    };

    loadSound('stick', drumstickWav);
    loadSound('woodblock', woodblockWav);
    loadSound('digital', tickWav);

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, []);

  const playTick = (isDownbeat: boolean) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') return;
    const ctx = audioCtxRef.current;
    const soundType = metroSoundRef.current;
    const bufferName = soundType === 'stick' ? 'stick' : soundType === 'woodblock' ? 'woodblock' : 'digital';
    const buffer = metroBuffersRef.current[bufferName];

    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    if (isDownbeat) {
      source.playbackRate.value = 1.2;
      gain.gain.value = metroVolumeRef.current;
    } else {
      source.playbackRate.value = 1.0;
      gain.gain.value = metroVolumeRef.current * 0.6;
    }

    source.start(ctx.currentTime);
  };

  const handleSetIsMetronome = (val: boolean) => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setIsMetronome(val);
  };

  return {
    isMetronome,
    setIsMetronome: handleSetIsMetronome,
    metroSound,
    setMetroSound,
    metroVolume,
    setMetroVolume,
    showMetroSheet,
    setShowMetroSheet,
    playTick
  };
};
