import * as facebook from '../../src/services/extractors/facebook.js';
import { VideoInfo, Format } from '../../types/index.js';
import { spawn } from 'node:child_process';
import { getQuantumStream } from '../../src/utils/proxy.util.js';
import { USER_AGENT } from '../../src/services/ytdlp/config.js';

async function repro() {
    const url = 'https://www.facebook.com/share/r/1CrQWTkPZi/';
    console.log(`[Repro] Target URL: ${url}`);
    
    try {
        const info = await facebook.getInfo(url) as VideoInfo;
        if (!info) throw new Error('Info extraction failed');
        
        // find HD format
        const targetFormat = info.formats.find(f => f.format_id.includes('hd_targeted_1920')) || info.formats[0];
        console.log(`[Repro] Selected Video Format: ${targetFormat.format_id}`);
        console.log(`[Repro] Audio URL present: ${!!targetFormat.audio_url}`);

        if (!targetFormat.audio_url) throw new Error('No audio URL found for muxing');

        console.log('[Repro] Initializing Streams...');
        
        const videoStream = await facebook.getStream(info, { formatId: targetFormat.format_id });
        const audioStream = await getQuantumStream(targetFormat.audio_url, {
            'User-Agent': USER_AGENT,
            'Referer': 'https://www.facebook.com/',
            'Range': 'bytes=0-',
            'Origin': 'https://www.facebook.com'
        });

        console.log('[Repro] Spawning FFmpeg...');
        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-i', 'pipe:3',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-shortest',
            '-f', 'null', // output to null for testing
            '-'
        ], {
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        });

        let bytesOut = 0;
        ffmpeg.stderr.on('data', d => {
            const msg = d.toString();
            if (msg.includes('Error') || msg.includes('fail')) console.log('[FFmpeg Stderr]', msg.trim());
        });

        videoStream.pipe(ffmpeg.stdin);
        audioStream.pipe(ffmpeg.stdio[3] as any);

        videoStream.on('error', e => console.error('[Video Stream Error]', e.message));
        audioStream.on('error', e => console.error('[Audio Stream Error]', e.message));
        ffmpeg.stdin.on('error', e => console.error('[FFmpeg Stdin Error]', e.message));
        (ffmpeg.stdio[3] as any).on('error', e => console.error('[FFmpeg Pipe3 Error]', e.message));

        ffmpeg.on('close', (code) => {
            console.log(`[Repro] FFmpeg exited with code ${code}`);
            process.exit(code || 0);
        });

        // timeout cleanup
        setTimeout(() => {
            console.log('[Repro] Test complete (10s), cleaning up...');
            ffmpeg.kill('SIGKILL');
            process.exit(0);
        }, 10000);

    } catch (e) {
        console.error('[Repro] Fatal Error:', e);
        process.exit(1);
    }
}

repro();
