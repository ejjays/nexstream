// 1. Mock BullMQ and Redis BEFORE anything else
const EventEmitter = require('events');

// mock redis
class MockRedis extends EventEmitter {
  constructor() { 
    super(); 
    this.options = {};
    // BullMQ check
    this.info = () => Promise.resolve('redis_version:7.0.0');
  }
  on(e, cb) { if (e === 'connect' || e === 'ready') setTimeout(cb, 0); return this; }
  subscribe() { return Promise.resolve(); }
  publish() { return Promise.resolve(); }
  defineCommand() {}
  quit() { return Promise.resolve(); }
}

// Mock BullMQ to prevent workers/queues from starting
const mockBullMQ = {
  Queue: class { add() { return Promise.resolve(); } on() { return this; } },
  Worker: class { on() { return this; } close() { return Promise.resolve(); } },
  QueueEvents: class { on() { return this; } }
};

require('module').prototype.require = (function(originalRequire) {
  return function(name, ...args) {
    if (name === 'ioredis') return MockRedis;
    if (name === 'bullmq') return mockBullMQ;
    return originalRequire.apply(this, [name, ...args]);
  };
})(require('module').prototype.require);

// 2. load extractor
const extractor = require('../src/services/extractors/spotify');

async function testSpotify() {
  // test different track
  const url = 'https://open.spotify.com/track/27qy698yvAn6uc9S7S1Uf0'; // Blinding Lights
  console.log('Testing Spotify Extractor (Isolated) for:', url);
  
  const timeout = setTimeout(() => {
    console.error('\nTest timed out');
    process.exit(1);
  }, 30000);

  try {
    const info = await extractor.getInfo(url, {
      onProgress: (status, progress, extra) => {
        console.log(`[Progress] ${status}: ${progress}%`, extra?.subStatus || '');
      }
    });

    console.log('\n--- Result ---');
    console.log('Title:', info.title);
    console.log('Artist:', info.artist);
    console.log('Target YouTube:', info.target_url);
    
    if (info.formats && info.formats.length > 0) {
      console.log('SUCCESS: Found', info.formats.length, 'formats');
    } else {
      console.log('FAILURE: No formats found.');
    }
  } catch (error) {
    console.error('\nERROR:', error.message);
  } finally {
    clearTimeout(timeout);
    process.exit(0);
  }
}

testSpotify();
