import { useState, useEffect, useRef, useCallback } from 'react';
import { PitchDetector } from 'pitchy';

const NOTE_STRINGS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B'
];

export const useTuner = () => {
  const [pitch, setPitch] = useState(0);
  const [note, setNote] = useState('-');
  const [cents, setCents] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micRef = useRef(null);
  const animationFrameRef = useRef(null);

  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micRef.current) {
      micRef.current.mediaStream.getTracks().forEach(track => track.stop());
      micRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
      audioCtxRef.current = null;
    }

    setIsRecording(false);
    setPitch(0);
    setNote('-');
    setCents(0);
  }, []);

  const start = async () => {
    try {
      setError('');
      setIsLoadingModel(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyserRef.current = analyser;

      const mic = ctx.createMediaStreamSource(stream);
      mic.connect(analyser);
      micRef.current = mic;

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const input = new Float32Array(detector.inputLength);

      let lastNoteTime = 0;
      setIsLoadingModel(false);
      setIsRecording(true);

      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);

      const updatePitch = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getFloatTimeDomainData(input);

        let rms = 0;
        for (let i = 0; i < input.length; i++) {
          rms += input[i] * input[i];
        }
        rms = Math.sqrt(rms / input.length);

        if (rms > 0.01) {
          const [currentPitch, currentClarity] = detector.findPitch(
            input,
            ctx.sampleRate
          );

          if (
            currentClarity > 0.8 &&
            currentPitch > 30 &&
            currentPitch < 1500
          ) {
            setPitch(currentPitch);

            const noteNum = 12 * (Math.log(currentPitch / 440) / Math.log(2));
            const roundedNoteNum = Math.round(noteNum);
            const centsOff = Math.round((noteNum - roundedNoteNum) * 100);

            let midiNote = roundedNoteNum + 69;
            while (midiNote < 0) midiNote += 12;
            const noteName = NOTE_STRINGS[midiNote % 12];

            setNote(noteName);
            setCents(centsOff);
            lastNoteTime = performance.now();
          }
        } else {
          if (performance.now() - lastNoteTime > 1500) {
            setNote(prev => (prev !== '-' ? '-' : prev));
            setCents(prev => (prev !== 0 ? 0 : prev));
          }
        }

        animationFrameRef.current = requestAnimationFrame(updatePitch);
      };

      animationFrameRef.current = requestAnimationFrame(updatePitch);
    } catch (err) {
      console.error(err);
      setError('Microphone access denied or unavailable.');
      setIsRecording(false);
      setIsLoadingModel(false);
    }
  };

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    pitch,
    note,
    cents,
    isRecording,
    isLoadingModel,
    error,
    start,
    stop
  };
};
