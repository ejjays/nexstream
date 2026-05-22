import { describe, it, expect } from 'vitest';
import { MediaStateMachine } from '../src/utils/fsm.util.js';

describe('MediaStateMachine (FSM)', () => {
  
  it('should initialize in PENDING state', () => {
    const fsm = new MediaStateMachine('test-123');
    expect(fsm.state).toBe('PENDING');
  });

  it('should allow valid transitions', () => {
    const fsm = new MediaStateMachine('test-123');
    
    fsm.transition('METADATA_EXTRACTING');
    expect(fsm.state).toBe('METADATA_EXTRACTING');
    
    fsm.transition('DOWNLOADING');
    expect(fsm.state).toBe('DOWNLOADING');
    
    fsm.transition('PROCESSING');
    expect(fsm.state).toBe('PROCESSING');
    
    fsm.transition('COMPLETED');
    expect(fsm.state).toBe('COMPLETED');
  });

  it('should block illegal transitions (e.g., PENDING -> COMPLETED)', () => {
    const fsm = new MediaStateMachine('test-123');
    
    expect(() => {
      fsm.transition('COMPLETED');
    }).toThrow(/Illegal transition/);
  });

  it('should block illegal jumps (e.g., DOWNLOADING -> METADATA_EXTRACTING)', () => {
    const fsm = new MediaStateMachine('test-123');
    fsm.transition('METADATA_EXTRACTING');
    fsm.transition('DOWNLOADING');
    
    expect(() => {
      fsm.transition('METADATA_EXTRACTING');
    }).toThrow(/Illegal transition/);
  });

  it('should allow failing from any active state', () => {
    const fsm = new MediaStateMachine('test-fail');
    fsm.transition('METADATA_EXTRACTING');
    fsm.transition('FAILED');
    expect(fsm.state).toBe('FAILED');
  });

  it('should allow retrying from FAILED state', () => {
    const fsm = new MediaStateMachine('test-retry');
    fsm.transition('FAILED');
    fsm.transition('PENDING');
    expect(fsm.state).toBe('PENDING');
  });

  it('should identify terminal states', () => {
    const fsm = new MediaStateMachine('test-term');
    expect(fsm.isTerminal()).toBe(false);
    
    fsm.transition('FAILED');
    expect(fsm.isTerminal()).toBe(true);
    
    fsm.transition('PENDING');
    fsm.transition('METADATA_EXTRACTING');
    fsm.transition('DOWNLOADING');
    fsm.transition('PROCESSING');
    fsm.transition('COMPLETED');
    expect(fsm.isTerminal()).toBe(true);
  });
});
