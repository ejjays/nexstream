const { getVideoInfo } = require('./backend/src/services/ytdlp.service');
const { spawn } = require('child_process');

const TEST_URL = 'https://www.youtube.com/watch?v=uBGF2DrXLMM'; // Sukdulang Biyaya (WebM/Opus)

(async () => {
    console.log('🚀 STARTING BENCHMARK 🚀\n');

    // --- TEST 1: METADATA FETCH ---
    console.log('--- Phase 1: Metadata Fetch (Simulating "Analyzing") ---\n');
    const startMeta = Date.now();
    let info;
    try {
        info = await getVideoInfo(TEST_URL);
    } catch (e) {
        console.error('Meta failed:', e);
        process.exit(1);
    }
    const endMeta = Date.now();
    console.log(`✅ Metadata fetched in: ${((endMeta - startMeta) / 1000).toFixed(2)}s`);

    // --- TEST 2: STREAM STARTUP (FFmpeg MP3 Transcode Experiment) ---
    console.log('\n--- Phase 2: FFmpeg MP3 Transcode (Experiment) ---');
    const startStream = Date.now();
    
    // Extract Audio URL from the info we just got
    const audioFormat = info.formats.find(f => f.format_id === '251') || 
                        info.formats.filter(f => f.acodec !== 'none').sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
    
    if (!audioFormat) { console.error('No audio URL found'); process.exit(1); }
    
    console.log(`[Test] Piping URL: ${audioFormat.url.substring(0, 50)}...`);
    
    const ffmpeg = spawn('ffmpeg', [
        '-i', audioFormat.url,
        '-c:a', 'libmp3lame',
        '-q:a', '2', // High Quality VBR
        '-f', 'mp3',
        'pipe:1'
    ]);

    // Measure time until the first chunk of data arrives
    ffmpeg.stdout.on('data', (chunk) => {
        const endStream = Date.now();
        console.log(`🎉 FIRST BYTE RECEIVED!`);
        console.log(`⏱️  Stream Startup Latency: ${((endStream - startStream) / 1000).toFixed(2)}s`);
        
        ffmpeg.kill(); // Stop
        process.exit(0);
    });

    ffmpeg.stderr.on('data', (d) => {
        // console.log(`[FFmpeg] ${d.toString()}`); 
    });

})();