const { spawn } = require('child_process');

async function resolveSpotifyToYoutube(videoURL, cookieArgs = []) {
    if (!videoURL.includes('spotify.com')) return videoURL;

    try {
        console.log('[Spotify] Scoping metadata for: ' + videoURL);
        let title = '';
        let artist = '';
        
        // Strategy 0: Official oEmbed API
        try {
            const oembedUrl = `https://open.spotify.com/oembed?url=${videoURL}`;
            const curlProcess = spawn('curl', ['-sL', '-A', 'Mozilla/5.0', oembedUrl]);
            let oembedData = '';
            await new Promise((resolve) => {
                curlProcess.stdout.on('data', (data) => oembedData += data.toString());
                curlProcess.on('close', resolve);
            });
            
            if (oembedData.trim()) {
                const json = JSON.parse(oembedData);
                title = json.title || '';
                artist = json.author_name || '';
            }
        } catch (e) {
            console.warn('[Spotify] oEmbed API failed.');
        }

        // Strategy 1: HTML Scraper with JSON-LD detection
        const curlProcess = spawn('curl', [
            '-sL',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            videoURL
        ]);
        
        let html = '';
        await new Promise((resolve) => {
            curlProcess.stdout.on('data', (data) => html += data.toString());
            curlProcess.on('close', resolve);
        });

        // 1a. Look for JSON-LD (The most accurate metadata block)
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
        if (jsonLdMatch && jsonLdMatch[1]) {
            try {
                const data = JSON.parse(jsonLdMatch[1]);
                if (data.name) title = data.name;
                if (data.author && data.author[0]) artist = data.author[0].name;
                else if (data.description && data.description.includes('artist')) {
                    const m = data.description.match(/artist\s+([^,.]+)/i);
                    if (m) artist = m[1];
                }
            } catch (e) {}
        }

        // 1b. Fallback to Open Graph tags
        if (!title) {
            const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
            if (ogTitle) title = ogTitle[1];
        }
        if (!artist) {
            const ogDesc = html.match(/property="og:description" content="([^"]+)"/i);
            if (ogDesc && ogDesc[1]) {
                const parts = ogDesc[1].split(' · ');
                const found = parts.find(p => !p.toLowerCase().includes(title.toLowerCase()) && !/^\d{4}$/.test(p.trim()) && !p.toLowerCase().includes('song'));
                if (found) artist = found.replace(/artist/i, '').replace(/song by /i, '').trim();
            }
        }

        if (!title || title === 'Web Player') {
            const trackId = videoURL.split('/track/')[1]?.split('?')[0];
            if (trackId) return await searchOnYoutube(`spotify ${trackId}`, cookieArgs);
            return videoURL;
        }

        const cleanTitle = title.replace('Spotify – ', '').replace(' | Spotify', '').trim();
        const searchQuery = `${cleanTitle} ${artist}`.trim();
        
        console.log(`[Spotify] Resolved: "${cleanTitle}" by "${artist || 'Unknown'}"`);
        return await searchOnYoutube(searchQuery, cookieArgs);
        
    } catch (err) {
        console.error('[Spotify] Global resolution failed:', err);
    }
    return videoURL;
}

async function searchOnYoutube(query, cookieArgs) {
    const cleanQuery = query
        .replace(/song and lyrics by/i, '')
        .replace(/on Spotify/g, '')
        .replace(/official video/gi, '')
        .replace(/official audio/gi, '')
        .replace(/lyrics/gi, '')
        .replace(/-/g, ' ')
        .trim();

    console.log(`[Spotify] YouTube Search: "${cleanQuery}"`);

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'deno',
        '--js-runtimes', 'node',
        `ytsearch1:${cleanQuery} music`
    ]);
    
    let youtubeId = '';
    await new Promise((resolve) => {
        searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
        searchProcess.on('close', resolve);
    });

    if (youtubeId.trim()) {
        const finalUrl = `https://www.youtube.com/watch?v=${youtubeId.trim().split('\n')[0]}`;
        console.log(`[Spotify] Converted: ${finalUrl}`);
        return finalUrl;
    }
    return null;
}

module.exports = { resolveSpotifyToYoutube };