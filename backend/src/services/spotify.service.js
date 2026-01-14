const { spawn, exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getDetails } = require('spotify-url-info')(fetch);

// 2026 Standard Initialization
const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
    : null;

const aiCache = new Map();

// Circuit Breaker for Quota Limits
let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchIsrcFromDeezer(title, artist) {
    try {
        const query = `artist:"${artist}" track:"${title}"`;
        const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl);
        const searchData = await res.json();

        if (searchData.data && searchData.data.length > 0) {
            const trackId = searchData.data[0].id;
            const detailRes = await fetch(`https://api.deezer.com/track/${trackId}`);
            const detailData = await detailRes.json();
            return detailData.isrc || null;
        }
    } catch (err) {
        console.error('[Deezer] ISRC fetch failed:', err.message);
    }
    return null;
}

async function refineSearchWithAI(metadata) {
    if (!client) return { query: null, confidence: 0 };
    
    const { title, artist, album, year, isrc, duration } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

    // Smart Model Selection based on Circuit Breaker
    let modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    
    if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
        modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    } else {
        isGemini3Blocked = false; // Reset if time passed
    }
    
    for (const modelName of modelsToTry) {
        try {
            const promptText = `Act as a high-end music archivist.
                DATA: Title: "${title}", Artist: "${artist}", Album: "${album}", Year: "${year}", ISRC: "${isrc || 'N/A'}", Duration: ${Math.round(duration / 1000)}s
                TASK:
                1. Identify the official ISRC if missing.
                2. Create a YouTube query that finds the LICENSED studio audio.
                3. Append the word "Topic" to the query.
                RETURN JSON ONLY: {"query": "Artist Title ISRC Topic", "confidence": 100, "found_isrc": "..."}`;

            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: promptText }] }]
            });

            const responseText = response.text || (typeof response.text === 'function' ? response.text() : '');
            if (!responseText) throw new Error('Empty AI response');

            const text = responseText.trim().replace(/```json|```/g, '');
            const parsed = JSON.parse(text);
            
            aiCache.set(cacheKey, parsed);
            return parsed;
        } catch (error) {
            if (error.message.includes('429') && modelName.includes('gemini-3')) {
                isGemini3Blocked = true;
                gemini3BlockTime = Date.now();
                console.warn('[AI] Gemini 3 quota hit. Switching to lite models.');
            }
        }
    }
    return { query: null, confidence: 0 };
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    try {
        onProgress('getting_metadata', 10);
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

        // STRATEGY 1: Try Deezer ISRC (The "Gold Standard" Method)
        if (!metadata.isrc) {
            onProgress('fetching_isrc', 15);
            const deezerIsrc = await fetchIsrcFromDeezer(metadata.title, metadata.artist);
            if (deezerIsrc) {
                console.log(`[Spotify] Found ISRC via Deezer: ${deezerIsrc}`);
                metadata.isrc = deezerIsrc;
            }
        }

        // If we have an ISRC, try to find the exact match on YouTube first
        if (metadata.isrc) {
            onProgress('searching_youtube_isrc', 30);
            console.log(`[Spotify] Searching YouTube with ISRC: "${metadata.isrc}"`);
            
            // Pass 0 as duration to disable filtering - we trust the ISRC match
            const isrcUrl = await searchOnYoutube(`"${metadata.isrc}"`, cookieArgs, 0);
            
            if (isrcUrl) {
                console.log('[Spotify] ISRC match found!');
                return {
                    targetUrl: isrcUrl,
                    title: metadata.title,
                    artist: metadata.artist,
                    album: metadata.album,
                    imageUrl: metadata.imageUrl,
                    isrc: metadata.isrc,
                    year: metadata.year,
                    duration: metadata.duration
                };
            }
            console.warn('[Spotify] ISRC search yielded no results. Falling back to text search...');
        }

        // STRATEGY 2 (Fallback): AI Refinement + Raw Text Search
        onProgress('ai_matching', 40);
        const aiPromise = refineSearchWithAI(metadata);
        
        // Start a raw search immediately as a "Backup/Speed" option
        const rawQuery = `${metadata.title} ${metadata.artist} official studio audio topic`;
        const rawSearchPromise = searchOnYoutube(rawQuery, cookieArgs, metadata.duration);

        // We wait for both, but we prioritize the AI if it's fast enough
        const [aiResult, rawUrl] = await Promise.all([aiPromise, rawSearchPromise]);
        
        onProgress('searching_youtube', 50);
        
        // If AI found something better/specific (like ISRC), use it
        let finalUrl = null;
        if (aiResult && aiResult.query) {
            console.log(`[AI] Checking refined query accuracy...`);
            finalUrl = await searchOnYoutube(aiResult.query, cookieArgs, metadata.duration);
        }

        // Ultimate Fallback to the raw search we already did
        finalUrl = finalUrl || rawUrl;

        if (!finalUrl) throw new Error('Could not find matching video.');

        return {
            targetUrl: finalUrl,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            imageUrl: metadata.imageUrl,
            isrc: metadata.isrc || (aiResult ? aiResult.found_isrc : ''),
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
    
    // Duration Filter (±15s)
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
