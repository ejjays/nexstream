import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMetronome } from '../src/hooks/useMetronome';
import { useRemixEngine } from '../src/hooks/useRemixEngine';
import { useRemixStore } from '../src/store/useRemixStore';

const mockResume = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockDecodeAudioData = vi.fn().mockResolvedValue({});

class MockAudioContext {
  state = 'suspended';
  resume = mockResume;
  close = mockClose;
  decodeAudioData = mockDecodeAudioData;
}

(window as any).AudioContext = MockAudioContext;
(window as any).webkitAudioContext = MockAudioContext;

global.fetch = vi.fn().mockResolvedValue({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
});

if (typeof window.HTMLAudioElement === 'undefined') {
  Object.defineProperty(window, 'HTMLAudioElement', {
    value: class HTMLAudioElement {
      src = '';
      volume = 1;
      currentTime = 0;
      duration = 0;
      paused = true;
      readyState = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      load = vi.fn();
      removeAttribute = vi.fn();
    }
  });
}

describe('Audio Autoplay Policy Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resume AudioContext correctly on user gesture', async () => {
    const { result } = renderHook(() => useMetronome());

    await act(async () => {
      await result.current.resumeAudioContext();
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
  });
  
  it('should force AudioContext resumption when enabling metronome', async () => {
    const { result } = renderHook(() => useMetronome());

    await act(async () => {
      await result.current.setIsMetronome(true);
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(result.current.isMetronome).toBe(true);
  });
});

describe('useRemixEngine', () => {
  beforeEach(() => {
    useRemixStore.getState().resetStore();
    vi.clearAllMocks();
  });

  it('should set isReady to true immediately to prevent mobile autoplay deadlock', () => {
    const mockPlayTick = vi.fn();
    const { result } = renderHook(() => useRemixEngine([], false, mockPlayTick, 0));

    expect(useRemixStore.getState().isReady).toBe(false);

    const testSources = {
      vocals: 'http://localhost:5000/vocals.wav',
      drums: 'http://localhost:5000/drums.wav'
    };

    act(() => {
      result.current.loadAudioSources(testSources);
    });

    // handle mobile autoplay
    expect(useRemixStore.getState().isReady).toBe(true);
  });
});
