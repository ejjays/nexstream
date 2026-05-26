import { describe, it, expect, vi } from 'vitest';
import { handleSseMessage } from '../src/hooks/useSSE';

/**
 * verifies progress bar monotonicity.
 * prevents bar from rewinding when server re-emits
 * early sequences during hydration or reconnect.
 */

interface RecordedState {
  targetProgress: number;
  desktopLogs: string[];
}

function dispatchProgress(progress: number, prevTarget = 0): RecordedState {
  const state: RecordedState = {
    targetProgress: prevTarget,
    desktopLogs: [],
  };

  const setTargetProgress = vi.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      state.targetProgress = (updater as (prev: number) => number)(
        state.targetProgress
      );
    } else {
      state.targetProgress = updater as number;
    }
  });

  handleSseMessage({ progress, status: 'initializing' }, '', {
    setStatus: vi.fn(),
    setVideoData: vi.fn(),
    setIsPickerOpen: vi.fn(),
    setPendingSubStatuses: vi.fn(),
    setDesktopLogs: vi.fn(),
    setTargetProgress,
    setProgress: vi.fn(),
    setSubStatus: vi.fn(),
    getTS: () => '[0:01]',
  });

  return state;
}

describe('progress monotonic guard — never rewinds', () => {
  it('accepts a forward jump (0 → 50)', () => {
    // forward jump
    const state = dispatchProgress(50, 0);
    expect(state.targetProgress).toBe(50);
  });

  it('REFUSES a backward jump (50 → 3) — the regression case', () => {
    // ignore backward jump
    const state = dispatchProgress(3, 50);
    expect(state.targetProgress).toBe(50);
  });
  it('REFUSES a small backward delta (45 → 24)', () => {
    const state = dispatchProgress(24, 45);
    expect(state.targetProgress).toBe(45);
  });

  it('REFUSES same value (no-op)', () => {
    const state = dispatchProgress(50, 50);
    expect(state.targetProgress).toBe(50);
  });

  it('always accepts 100 even if current is higher (terminal state)', () => {
    const state = dispatchProgress(100, 95);
    expect(state.targetProgress).toBe(100);
  });

  it('ignores tiny forward deltas (<1) to prevent jitter', () => {
    const state = dispatchProgress(50.4, 50);
    expect(state.targetProgress).toBe(50);
  });

  it('accepts forward deltas >=1', () => {
    const state = dispatchProgress(51, 50);
    expect(state.targetProgress).toBe(51);
  });

  it('handles a complete server replay sequence without going backwards', () => {
    // test replay sequence
    const state: RecordedState = { targetProgress: 0, desktopLogs: [] };
    const setTargetProgress = vi.fn((updater: unknown) => {
      if (typeof updater === 'function') {
        state.targetProgress = (updater as (prev: number) => number)(
          state.targetProgress
        );
      } else {
        state.targetProgress = updater as number;
      }
    });

    const dispatch = (p: number) =>
      handleSseMessage({ progress: p, status: 'initializing' }, '', {
        setStatus: vi.fn(),
        setVideoData: vi.fn(),
        setIsPickerOpen: vi.fn(),
        setPendingSubStatuses: vi.fn(),
        setDesktopLogs: vi.fn(),
        setTargetProgress,
        setProgress: vi.fn(),
        setSubStatus: vi.fn(),
        getTS: () => '[0:01]',
      });

    [3, 8, 12, 12, 20, 45, 24, 50].forEach(dispatch);
    expect(state.targetProgress).toBe(50);

    // ignore hydration replay
    [3, 8, 12, 12, 15].forEach(dispatch);
    expect(state.targetProgress).toBe(50);

    // accept final completion
    dispatch(100);
    expect(state.targetProgress).toBe(100);
  });
});
