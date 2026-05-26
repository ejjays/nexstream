import { Module, createRequire } from 'module';

createRequire(import.meta.url);

// mock native modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function (name, ...args) {
  if (name.includes('libsql') || name === '@libsql/client') {
    try {
      return originalRequire.apply(this, [name, ...args]);
    } catch (err) {
      // bypass native noise
      const msg = err instanceof Error ? err.message : String(err);
      console.debug('[System] LibSQL unavailable:', msg);
      return {
        createClient: () => ({
          execute: () => Promise.resolve({ rows: [] }),
          batch: () => Promise.resolve([]),
          close: () => {
            /* no-op */
          },
        }),
      };
    }
  }
  if (name === '@ffmpeg-installer/ffmpeg') {
    return { path: 'ffmpeg', version: 'system', url: 'https://ffmpeg.org/' };
  }
  return originalRequire.apply(this, [name, ...args]);
};

console.log('[env] termux bypass active');

// load main app (skip during test runs — vitest sets process.env.VITEST in workers,
// but NODE_OPTIONS runs this shim before vitest boots, so detect via argv instead)
const isTestRun = process.argv.some((arg) => arg.includes('vitest'));

if (!isTestRun) {
  await import('../dist/backend/src/app.js');
}
