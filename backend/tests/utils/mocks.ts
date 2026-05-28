import { vi } from 'vitest';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

type MockOverrides = Partial<ChildProcess> & {
  exitCode?: number | null;
  stderr?: unknown;
};

export function createMockChildProcess(overrides?: MockOverrides): ChildProcess {
  const mockProcess = new EventEmitter() as unknown as Record<string, unknown>;

  mockProcess.stdout = new PassThrough();
  mockProcess.stderr = new PassThrough();
  mockProcess.stdin = new PassThrough();
  mockProcess.kill = vi.fn();
  mockProcess.pid = 12345;
  mockProcess.connected = true;
  mockProcess.killed = false;
  mockProcess.exitCode = null;
  mockProcess.signalCode = null;
  mockProcess.spawnargs = [];
  mockProcess.spawnfile = '';

  // pull exit/stderr config out so they don't clobber the live streams
  const exitCode =
    overrides && 'exitCode' in overrides ? overrides.exitCode : undefined;
  const stderrText =
    overrides && typeof overrides.stderr === 'string'
      ? (overrides.stderr as string)
      : undefined;

  if (overrides) {
    const { exitCode: _ec, stderr: _se, ...rest } = overrides as Record<
      string,
      unknown
    >;
    Object.assign(mockProcess, rest);
  }

  if (exitCode !== undefined) {
    mockProcess.exitCode = exitCode;
  }

  // emit configured stderr + close on next tick so consumers can register listeners
  setImmediate(() => {
    if (stderrText) {
      (mockProcess.stderr as PassThrough).write(stderrText);
    }
    (mockProcess.stderr as PassThrough).end();
    if (exitCode !== undefined && exitCode !== null) {
      (mockProcess as unknown as EventEmitter).emit('close', exitCode);
      (mockProcess as unknown as EventEmitter).emit('exit', exitCode);
    }
  });

  return mockProcess as unknown as ChildProcess;
}
