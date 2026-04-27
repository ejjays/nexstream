const assert = require('assert');

// 1. Mock ioredis completely to silence errors
const EventEmitter = require('node:events');
class MockRedis extends EventEmitter {
    constructor() { super(); }
    subscribe() { return Promise.resolve(); }
    publish() { return Promise.resolve(); }
    on() { return this; }
}
require('module').prototype.require = (original => function(name) {
    if (name === 'ioredis') return MockRedis;
    return original.apply(this, arguments);
})(require('module').prototype.require);

// 2. Setup Collector
const sse = require('../src/utils/sse.util');
const capturedEvents = [];
sse.sendEvent = (id, data) => {
    capturedEvents.push({ id, ...data });
};

// 3. Mock logic
const extractors = require('../src/services/extractors');
extractors.getInfo = async (url, options) => {
    if (options && options.onProgress) {
        options.onProgress('fetching_info', 15, 'Scanning Test...', 'TEST_DETAILS');
    }
    return { id: 'test', formats: [{ format_id: '1' }], title: 'Test' };
};

const validation = require('../src/utils/validation.util');
validation.isSupportedUrl = () => true;

const { getVideoInfo } = require('../src/services/ytdlp/info');

async function test() {
    console.log('--- STARTING SSE MANUAL REGRESSION ---');
    // Using a URL that triggers the "fast path" or specific JS logic
    const url = 'https://vt.tiktok.com/ZS123456/'; 
    
    try {
        await getVideoInfo(url, [], false, null, 'reg-123');
        
        console.log('Captured statuses:', capturedEvents.map(e => e.subStatus));
        
        assert(capturedEvents.some(e => e.subStatus === 'Expanding short-links...'), 'Missing short-link expansion log');
        assert(capturedEvents.some(e => e.subStatus === 'Scanning Test...'), 'Missing extractor-level progress');
        
        console.log('✅ SSE REGRESSION PASSED');
        process.exit(0);
    } catch (e) {
        console.error('❌ SSE REGRESSION FAILED:', e.message);
        process.exit(1);
    }
}

test();
