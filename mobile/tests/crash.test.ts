import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  wrap: (component: unknown) => component,
}));

import { toError, reportError, crashReportingEnabled } from '../src/lib/crash';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toError', () => {
  it('passes Error instances through unchanged', () => {
    const original = new Error('boom');
    expect(toError(original)).toBe(original);
  });

  it('wraps strings into an Error', () => {
    expect(toError('nope').message).toBe('nope');
  });

  it('serializes objects into the message', () => {
    expect(toError({ code: 42 }).message).toContain('42');
  });

  it('never throws on null or undefined', () => {
    expect(toError(null)).toBeInstanceOf(Error);
    expect(toError(undefined)).toBeInstanceOf(Error);
  });
});

describe('reportError (no DSN configured)', () => {
  it('is disabled without a DSN', () => {
    expect(crashReportingEnabled()).toBe(false);
  });

  it('falls back to console.error and does not throw', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => reportError(new Error('local'))).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });
});
