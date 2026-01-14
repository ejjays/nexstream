const { spawn } = require('child_process');

async function resolveSpotifyToYoutube(videoURL, cookieArgs = []) {
    if (!videoURL.includes('spotify.com')) return videoURL;

    try {
        console.log('[Spotify] Scoping metadata for: ' + videoURL);
        
        const curlProcess = spawn('curl', ['-sL', videoURL]);
        let html = '';
        await new Promise((resolve) => {
            curlProcess.stdout.on('data', (data) => html += data.toString());
            curlProcess.on('close', resolve);
        });

        const titleMatch = html.match(/<title>([^<]+)\| Spotify<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            const searchQuery = titleMatch[1].trim()
                .replace(/song and lyrics by/i, '')
                .replace(/-/g, ' ')
                .trim();

            const searchProcess = spawn('yt-dlp', [
                ...cookieArgs,
                '--get-id',
                '--ignore-config',
                '--js-runtimes', 'deno,node',
                `ytsearch1:${searchQuery}`
            ]);
            
            let youtubeId = '';
            await new Promise((resolve) => {
                searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
                searchProcess.on('close', resolve);
            });

            if (youtubeId.trim()) {
                const finalUrl = `https://www.youtube.com/watch?v=${youtubeId.trim().split('\n')[0]}`;
                console.log(`[Spotify] Converted to YouTube URL: ${finalUrl}`);
                return finalUrl;
            }
        }
    } catch (err) {
        console.error('[Spotify] Stealth resolution failed:', err);
    }
    return videoURL;
}

module.exports = { resolveSpotifyToYoutube };
