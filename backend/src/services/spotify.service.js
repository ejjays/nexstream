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

        // Strategy 1: HTML Scraper (Crucial for Artist name)
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

        // 1a. Try to find artist in og:description or title tag
        if (!artist) {
            const ogDesc = html.match(/property="og:description" content="([^"]+)"/i);
            const titleTag = html.match(/<title>([^<]+)<\/title>/i);
            
            if (ogDesc && ogDesc[1]) {
                // Description usually: "Song · Artist · Year"
                const parts = ogDesc[1].split(' · ');
                if (parts.length > 1) {
                    const potentialArtist = parts[0].replace(/song by /i, '').replace(/album by /i, '').trim();
                    if (potentialArtist.toLowerCase() !== title.toLowerCase()) artist = potentialArtist;
                }
            }
            
            // 1b. If still no artist, try to find it in the page title
            if (!artist && titleTag && titleTag[1]) {
                const parts = titleTag[1].split(' | ')[0].split(' - ');
                if (parts.length > 1) {
                    artist = parts[0].replace('Spotify – ', '').trim();
                }
            }
        }

        if (!title) {
            const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
            if (ogTitle) title = ogTitle[1];
        }

        // Clean up title
        if (title) title = title.replace(' | Spotify', '').replace('Spotify – ', '').trim();

        if (!title || title === 'Web Player') {
            // Last resort: Search YouTube directly for the Spotify ID
            const trackId = videoURL.split('/track/')[1]?.split('?')[0];
            if (trackId) {
                console.warn('[Spotify] Extraction failed. Searching by ID.');
                return await searchOnYoutube(`spotify ${trackId}`, cookieArgs);
            }
            return videoURL;
        }

        const searchQuery = `${title} ${artist}`.trim();
        console.log(`[Spotify] Resolved: "${title}" by "${artist || 'Unknown'}"`);
        return await searchOnYoutube(searchQuery, cookieArgs);
        
    } catch (err) {
        console.error('[Spotify] Global resolution failed:', err);
    }
    return videoURL;
}

async function searchOnYoutube(query, cookieArgs) {
    // Cleaner query logic - don't remove important (brackets) or (parentheses) for Spotify songs
    // only remove very specific video garbage
    const cleanQuery = query
        .replace(/song and lyrics by/i, '')
        .replace(/on Spotify/g, '')
        .replace(/official video/gi, '')
        .replace(/official audio/gi, '')
        .replace(/lyrics/gi, '')
        .replace(/-/g, ' ')
        .trim();

    console.log(`[Spotify] Search Query: "${cleanQuery}"`);

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'deno',
        '--js-runtimes', 'node',
        `ytsearch1:${cleanQuery} music` // Use 'music' instead of 'audio' for better relevance
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
    return null;
}

module.exports = { resolveSpotifyToYoutube };
