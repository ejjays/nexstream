const { spawn } = require('child_process');

async function resolveSpotifyToYoutube(videoURL, cookieArgs = []) {
    if (!videoURL.includes('spotify.com')) return videoURL;

    try {
        console.log('[Spotify] Scoping metadata for: ' + videoURL);
        
        // Strategy 0: Official oEmbed API (Fastest and 100% accurate)
        // This is usually not blocked as it's meant for public consumption
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
                if (json.title) {
                    let title = json.title;
                    let artist = json.author_name || '';
                    
                    // If artist is missing but title looks like "Artist - Song", split it
                    if (!artist && title.includes(' - ')) {
                        const parts = title.split(' - ');
                        artist = parts[0];
                        title = parts[1];
                    }

                    // Fallback artist if still empty (search often works better with some context)
                    const searchQuery = `${title} ${artist}`.trim();
                    console.log(`[Spotify] API Match: "${title}" by "${artist || 'Unknown Artist'}"`);
                    return await searchOnYoutube(searchQuery, cookieArgs);
                }
            }
        } catch (e) {
            console.warn('[Spotify] oEmbed API failed, falling back to scraper.');
        }

        // Strategy 1: Scraper fallback (Previous logic but improved headers)
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

        let searchQuery = '';
        const ogTitle = html.match(/property="og:title" content="([^"]+)"/i);
        const ogDesc = html.match(/property="og:description" content="([^"]+)"/i);
        
        if (ogTitle && ogTitle[1]) {
            searchQuery = ogTitle[1];
            if (ogDesc && ogDesc[1]) {
                // description often has "Artist · Song · Year" or "Artist · Song"
                const artistPart = ogDesc[1].split('·')[0].replace(/song by /i, '').trim();
                if (artistPart && !searchQuery.toLowerCase().includes(artistPart.toLowerCase())) {
                    searchQuery = `${searchQuery} ${artistPart}`;
                }
            }
        } else {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                searchQuery = titleMatch[1].replace(' | Spotify', '').replace('Spotify – ', '').trim();
            }
        }

        if (!searchQuery || searchQuery === 'Spotify – Web Player' || searchQuery === 'Page not found') {
            console.warn('[Spotify] Metadata extraction failed. Last resort: Searching with URL.');
            searchQuery = videoURL;
        }

        console.log(`[Spotify] Scraper query: "${searchQuery}"`);
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
        .replace(/\(.*\)/g, '') // Remove parentheses (often contains "Official Video")
        .replace(/\[.*\]/g, '') // Remove brackets
        .replace(/-/g, ' ')
        .trim();

    console.log(`[Spotify] Cleaned Search Query: "${cleanQuery}"`);

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'deno',
        '--js-runtimes', 'node',
        `ytsearch1:${cleanQuery} audio` // Added 'audio' to help find music tracks
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
