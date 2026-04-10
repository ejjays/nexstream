const axios = require('axios');
const fs = require('fs');

async function testPerformance() {
    const youtubeUrl = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';
    const baseUrl = 'http://127.0.0.1:5000';
    
    console.log('--- Speed Performance Test ---');
    
    try {
        console.log('1. Resolving merge URL...');
        const streamRes = await axios.get(`${baseUrl}/stream-urls?url=${encodeURIComponent(youtubeUrl)}&id=test-perf&formatId=299`);
        
        const convertUrl = streamRes.data.videoUrl;
        console.log('2. Downloading from:', convertUrl);

        const start = Date.now();
        const response = await axios({
            method: 'get',
            url: convertUrl,
            responseType: 'stream'
        });

        let totalBytes = 0;
        let lastLoggedBytes = 0;
        let lastLogTime = Date.now();

        response.data.on('data', (chunk) => {
            totalBytes += chunk.length;
            const now = Date.now();
            const elapsedSinceLog = (now - lastLogTime) / 1000;

            if (elapsedSinceLog >= 3) {
                const bytesInPeriod = totalBytes - lastLoggedBytes;
                const speedMBps = (bytesInPeriod / (1024 * 1024)) / elapsedSinceLog;
                console.log(`[${Math.round((now - start) / 1000)}s] Total: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB | Speed: ${speedMBps.toFixed(2)} MB/s`);
                
                lastLoggedBytes = totalBytes;
                lastLogTime = now;
            }
        });

        response.data.on('end', () => {
            const totalElapsed = (Date.now() - start) / 1000;
            const avgSpeed = (totalBytes / (1024 * 1024)) / totalElapsed;
            console.log(`\n--- TEST COMPLETE ---`);
            console.log(`Total Size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
            console.log(`Total Time: ${totalElapsed.toFixed(2)}s`);
            console.log(`Average Speed: ${avgSpeed.toFixed(2)} MB/s`);
            process.exit(0);
        });

        response.data.on('error', (err) => {
            console.error('Stream Error:', err.message);
            process.exit(1);
        });

    } catch (err) {
        console.error('Test Failed:', err.message);
        process.exit(1);
    }
}

testPerformance();
