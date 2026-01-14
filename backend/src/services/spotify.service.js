const { spawn, exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getDetails } = require('spotify-url-info')(fetch);

// Initialize New Gemini AI Client correctly
const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
    : null;

// Simple in-memory cache to save Gemini quota
const aiCache = new Map();

async function refineSearchWithAI(metadata) {
    if (!client) return { query: null, confidence: 0 };
    
    const { title, artist, album, year, isrc, duration } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    
    if (aiCache.has(cacheKey)) {
        console.log(`[AI] Using Cache for: ${title}`);
        return aiCache.get(cacheKey);
    }

    const modelsToTry = ["gemini-3-flash-preview", "gemini-3-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    
    for (const modelName of modelsToTry) {
        try {
            const promptText = `Act as a high-end music archivist. I need to find the 100% correct YouTube video for this Spotify track.
                
                DATA PROVIDED:
                - Title: "${title}"
                - Artist: "${artist}"
                - Album: "${album}"
                - Release Year: "${year}"
                - ISRC Provided: "${isrc || 'N/A'}"
                - Duration: ${Math.round(duration / 1000)} seconds
                
                TASK:
                1. Search your memory for the official ISRC.
                2. Create a YouTube search query. If you have an ISRC, use the format: "isrc:XXXXX". 
                3. If no ISRC, create a high-precision keyword query for the licensed "Topic" audio.
                4. Return ONLY a JSON object: {"query": "...", "confidence": 100, "found_isrc": "..."}`;

            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: promptText }] }]
            });

            const responseText = response.text || (typeof response.text === 'function' ? response.text() : '');
            if (!responseText) throw new Error('Empty AI response');

            const text = responseText.trim().replace(/```json|```/g, '');
            const parsed = JSON.parse(text);
            
            console.log(`[AI] Model: ${modelName} | Confidence: ${parsed.confidence}% | ISRC: ${parsed.found_isrc || 'N/A'}`);
            
            aiCache.set(cacheKey, parsed);
            return parsed;
        } catch (error) {
            console.warn(`[AI] Model ${modelName} failed: ${error.message}`);
        }
    }
    return { query: null, confidence: 0 };
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = []) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    try {
        console.log('[Spotify] Deep-scanning metadata: ' + videoURL);
        const details = await getDetails(videoURL);
        
        if (!details || !details.preview) throw new Error('Could not fetch Spotify details');

        const metadata = {
            title: details.preview.title,
            artist: details.preview.artist,
            album: details.preview.album || '',
            imageUrl: details.preview.image || '',
            duration: details.duration_ms || 0,
            year: details.release_date ? details.release_date.split('-')[0] : 'Unknown',
            isrc: details.isrc || details.preview.isrc || ''
        };

        const aiResult = await refineSearchWithAI(metadata);
        
        // 1. Try AI Query (usually ISRC based)
        let finalUrl = aiResult.query ? await searchOnYoutube(aiResult.query, cookieArgs) : null;
        
        // 2. If AI Search failed, try Smart Fallback
        if (!finalUrl) {
            const fallbackQuery = `${metadata.title} ${metadata.artist} official studio audio topic`;
            console.log(`[Spotify] AI Search failed, trying Smart Fallback: "${fallbackQuery}"`);
            finalUrl = await searchOnYoutube(fallbackQuery, cookieArgs);
        }

        if (!finalUrl) throw new Error('Could not find a matching YouTube video for this song.');

        return {
            targetUrl: finalUrl,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            imageUrl: metadata.imageUrl,
            isrc: metadata.isrc,
            year: metadata.year
        };
        
    } catch (err) {
        console.error('[Spotify] Resolution failed:', err.message);
        throw err; // Propagate error so we don't try to download Spotify URL
    }
}

async function searchOnYoutube(query, cookieArgs) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    console.log(`[Spotify] YouTube Search: "${cleanQuery}"`);

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'node',
        `ytsearch1:${cleanQuery}`
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