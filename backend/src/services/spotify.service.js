const { spawn, exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getDetails } = require('spotify-url-info')(fetch);

// 2026 Standard Initialization
const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI(process.env.GEMINI_API_KEY) // Direct key init as of 2026
    : null;

const aiCache = new Map();

async function refineSearchWithAI(metadata) {
    if (!client) return { query: null, confidence: 0 };
    
    const { title, artist, album, year, isrc, duration } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

    // Latest 2026 Model Roadmap
    const modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    
    for (const modelName of modelsToTry) {
        try {
            const promptText = `Act as a high-end music archivist.
                DATA: Title: "${title}", Artist: "${artist}", Album: "${album}", Year: "${year}", ISRC: "${isrc || 'N/A'}", Duration: ${Math.round(duration / 1000)}s
                TASK:
                1. Identify the official ISRC if missing.
                2. Create a YouTube query that finds the LICENSED studio audio.
                3. Append the word "Topic" to the query to target official YouTube Music channels.
                4. Do NOT use "isrc:" prefix. Just include the code in the string.
                RETURN JSON ONLY: {"query": "Artist Title ISRC Topic", "confidence": 100, "found_isrc": "..."}`;

            // Correct 2026 @google/genai SDK Call Structure
            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: promptText }] }]
            });

            // Modern SDK Response Structure
            const responseText = response.text || (typeof response.text === 'function' ? response.text() : '');
            if (!responseText) throw new Error('Empty AI response');

            const text = responseText.trim().replace(/```json|```/g, '');
            const parsed = JSON.parse(text);
            
            console.log(`[AI] Model: ${modelName} | Confidence: ${parsed.confidence}% | ISRC: ${parsed.found_isrc || 'N/A'}`);
            
            aiCache.set(cacheKey, parsed);
            return parsed;
        } catch (error) {
            console.warn(`[AI] ${modelName} failed: ${error.message}`);
        }
    }
    return { query: null, confidence: 0 };
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    try {
        onProgress('getting_metadata', 12);
        const details = await getDetails(videoURL);
        if (!details || !details.preview) throw new Error('Spotify metadata fetch failed');

        const metadata = {
            title: details.preview.title,
            artist: details.preview.artist,
            album: details.preview.album || '',
            imageUrl: details.preview.image || '',
            duration: details.duration_ms || 0,
            year: details.release_date ? details.release_date.split('-')[0] : 'Unknown',
            isrc: details.isrc || details.preview.isrc || ''
        };

        onProgress('ai_matching', 18);
        const aiResult = await refineSearchWithAI(metadata);
        
        let finalUrl = null;
        if (aiResult.query) {
            onProgress('searching_youtube', 22);
            finalUrl = await searchOnYoutube(aiResult.query, cookieArgs, metadata.duration);
        }
        
        if (!finalUrl) {
            onProgress('searching_youtube', 22);
            const fallbackQuery = `${metadata.title} ${metadata.artist} official studio audio topic`;
            finalUrl = await searchOnYoutube(fallbackQuery, cookieArgs, metadata.duration);
        }

        if (!finalUrl) throw new Error('Could not find matching video on YouTube.');

        return {
            targetUrl: finalUrl,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            imageUrl: metadata.imageUrl,
            isrc: metadata.isrc || aiResult.found_isrc,
            year: metadata.year,
            duration: metadata.duration
        };
        
    } catch (err) {
        console.error('[Spotify] Resolution failed:', err.message);
        throw err;
    }
}

async function searchOnYoutube(query, cookieArgs, targetDurationMs = 0) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    console.log(`[Spotify] YouTube Search: "${cleanQuery}"`);

    const matchFilter = targetDurationMs > 0 
        ? `--match-filter "duration > ${Math.round(targetDurationMs / 1000) - 15} & duration < ${Math.round(targetDurationMs / 1000) + 15}"`
        : "";

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'node',
        ...matchFilter.split(' '),
        `ytsearch1:${cleanQuery}`
    ].filter(arg => arg !== ""));
    
    let youtubeId = '';
    await new Promise((resolve) => {
        searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
        searchProcess.on('close', resolve);
    });

    if (youtubeId.trim()) {
        return `https://www.youtube.com/watch?v=${youtubeId.trim().split('\n')[0]}`;
    }
    return null;
}

module.exports = { resolveSpotifyToYoutube };