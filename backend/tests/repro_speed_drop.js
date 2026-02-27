const axios = require('axios');

async function measureSpeed() {
    // Use a long song to see speed over time
    const youtubeUrl = 'https://youtu.be/nTbA7qrEsP0';
    const baseUrl = 'http://127.0.0.1:5000';
    
    console.log('--- Parallel Turbo v2 Speed Test ---');
    
    try {
        console.log('1. Resolving stream URLs...');
        const streamRes = await axios.get(`${baseUrl}/stream-urls?url=${encodeURIComponent(youtubeUrl)}&id=test-speed`);
        
        const proxyUrl = streamRes.data.audioUrl;
        if (!proxyUrl) throw new Error('Failed to get audioUrl');
        
        console.log('2. Starting download...');
        const start = Date.now();
        const response = await axios({
            method: 'get',
            url: proxyUrl,
            responseType: 'stream'
        });

        let totalBytes = 0;
        let lastBytes = 0;
        let lastTime = Date.now();

        response.data.on('data', (chunk) => {
            totalBytes += chunk.length;
        });

        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            const bytesSinceLast = totalBytes - lastBytes;
            const speedMB = (bytesSinceLast / (1024 * 1024)) / elapsed;
            const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

            console.log(`[${Math.round((now - start) / 1000)}s] Speed: ${speedMB.toFixed(2)} MB/s | Total Received: ${totalMB} MB`);

            lastBytes = totalBytes;
            lastTime = now;
            
            // Limit test to 10 seconds to save bandwidth
            if ((now - start) > 10000) {
                console.log('--- Test Complete (10s sample) ---');
                clearInterval(timer);
                process.exit(0);
            }
        }, 1000);

    } catch (err) {
        console.error('Test Failed:', err.message);
        process.exit(1);
    }
}

measureSpeed();
