import { createRequire } from 'module';
createRequire(import.meta.url);
import { Module } from 'module';

// mock native modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function (name, ...args) {
  if (name.includes('libsql') || name === '@libsql/client') {
    try {
      return originalRequire.apply(this, [name, ...args]);
    } catch (_ERROR) {
      console.debug('[env] bypass error:', _ERROR);
      // ignore native error
      return {
        createClient: () => ({
          execute: () => Promise.resolve({ rows: [] }),
          batch: () => Promise.resolve([]),
          close: () => {},
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

// load main app
await import('../dist/backend/src/app.js');
