import { describe, it, expect, vi } from 'vitest';
import { FSM } from '../../src/utils/media/fsm.util.js';

describe('Media FSM', () => {
  it('should initialize in idle state', () => {
    const fsm = new FSM();
    expect(fsm.getState()).toBe('idle');
  });

  it('should allow valid transitions', async () => {
    const fsm = new FSM();
    fsm.addTransition('idle', 'fetching');

    await fsm.transition('fetching');
    expect(fsm.getState()).toBe('fetching');
  });

  it('should execute action on transition', async () => {
    const fsm = new FSM();
    const action = vi.fn();
    fsm.addTransition('idle', 'fetching', action);

    await fsm.transition('fetching');
    expect(action).toHaveBeenCalled();
    expect(fsm.getState()).toBe('fetching');
  });

  it('should not change state on invalid transition', async () => {
    const fsm = new FSM();
    fsm.addTransition('idle', 'fetching');

    await fsm.transition('processing');
    expect(fsm.getState()).toBe('idle');
  });
});
