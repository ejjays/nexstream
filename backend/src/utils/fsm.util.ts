// media states
export type MediaState = 
  | 'PENDING' 
  | 'METADATA_EXTRACTING' 
  | 'DOWNLOADING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED';

// transition rules
const VALID_TRANSITIONS: Record<MediaState, MediaState[]> = {
  'PENDING': ['METADATA_EXTRACTING', 'FAILED'],
  'METADATA_EXTRACTING': ['DOWNLOADING', 'FAILED'],
  'DOWNLOADING': ['PROCESSING', 'FAILED'],
  'PROCESSING': ['COMPLETED', 'FAILED'],
  'COMPLETED': ['PENDING'], // allow re-queue
  'FAILED': ['PENDING']     // allow retry
};

// state manager
export class MediaStateMachine {
  private currentState: MediaState;
  private jobId: string;

  constructor(jobId: string, initialState: MediaState = 'PENDING') {
    this.jobId = jobId;
    this.currentState = initialState;
  }

  // transition state
  transition(to: MediaState, reason?: string): void {
    const allowed = VALID_TRANSITIONS[this.currentState];
    
    if (!allowed.includes(to)) {
      throw new Error(`[FSM ERROR] Illegal transition for Job ${this.jobId}: ${this.currentState} -> ${to}`);
    }

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[FSM] [${timestamp}] Job ${this.jobId}: ${this.currentState} -> ${to}${reason ? ` (${reason})` : ''}`);
    
    this.currentState = to;
  }

  get state(): MediaState {
    return this.currentState;
  }

  is(state: MediaState): boolean {
    return this.currentState === state;
  }

  // check terminal
  isTerminal(): boolean {
    return this.currentState === 'COMPLETED' || this.currentState === 'FAILED';
  }
}
