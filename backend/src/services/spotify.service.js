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
        // Step 1: Strict Search
        let query = `artist:"${artist}" track:"${title}"`;
        let searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
        let res = await fetch(searchUrl);
        let searchData = await res.json();

        // Step 2: Loose Search
        if (!searchData.data || searchData.data.length === 0) {
             query = `${title} ${artist}`;
             searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
             res = await fetch(searchUrl);
             searchData = await res.json();
        }

        // Step 3: Clean Artist Search
        if (!searchData.data || searchData.data.length === 0) {
            const cleanArtist = artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, '').trim();
            if (cleanArtist !== artist) {
                query = `artist:"${cleanArtist}" track:"${title}"`;
                searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
                res = await fetch(searchUrl);
                searchData = await res.json();
            }
        }

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

async function fetchIsrcFromItunes(title, artist) {
    try {
        const query = `${title} ${artist}`;
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=song`;
        const res = await fetch(searchUrl);
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            const match = data.results[0];
            return match.isrc || null;
        }
    } catch (err) {
        console.error('[iTunes] ISRC fetch failed:', err.message);
    }
    return null;
}

async function refineSearchWithAI(metadata) {
    if (!client) return { query: null, confidence: 0 };
    
    const { title, artist, album, year, isrc, duration } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

    let modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    
    if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
        modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    } else {
        isGemini3Blocked = false; 
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
            // Try to get ISRC from multiple places in the detail response
            isrc: details.isrc || details.preview.isrc || (details.external_ids ? details.external_ids.isrc : '')
        };

        if (metadata.isrc) {
            console.log(`[Spotify] ISRC found in metadata: ${metadata.isrc}`);
        } else {
            console.log(`[Spotify] No ISRC in metadata, attempting external lookup...`);
        }

        // STRATEGY 1: ISRC Resolution (Best Accuracy)
        if (!metadata.isrc) {
            onProgress('fetching_isrc', 15);
            console.log(`[Spotify] Querying external ISRC for "${metadata.title}" by "${metadata.artist}"...`);
            let foundIsrc = await fetchIsrcFromDeezer(metadata.title, metadata.artist);
            
            if (!foundIsrc) {
                 foundIsrc = await fetchIsrcFromItunes(metadata.title, metadata.artist);
            }

            if (foundIsrc) {
                console.log(`[Spotify] External ISRC found: ${foundIsrc}`);
                metadata.isrc = foundIsrc;
            } else {
                console.log(`[Spotify] External ISRC lookup FAILED for "${metadata.title}"`);
            }
        }

        if (metadata.isrc) {
            onProgress('searching_youtube_isrc', 30);
            console.log(`[Spotify] Searching YouTube with ISRC: ${metadata.isrc}`);
            const isrcUrl = await searchOnYoutube(`"${metadata.isrc}"`, cookieArgs, 0);
            if (isrcUrl) {
                return { ...metadata, targetUrl: isrcUrl };
            }
            console.warn(`[Spotify] ISRC search returned no results, falling back to text search...`);
        }

        // STRATEGY 2: AI + Text Search
        onProgress('ai_matching', 40);
        const aiPromise = refineSearchWithAI(metadata);
        
        const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, '').trim();
        // Improve search query to be more specific to licensed content
        const rawQuery = `"${metadata.title}" ${cleanArtist} official audio topic`;
        const rawSearchPromise = searchOnYoutube(rawQuery, cookieArgs, metadata.duration);

        const [aiResult, rawUrl] = await Promise.all([aiPromise, rawSearchPromise]);
        
        onProgress('searching_youtube', 50);
        
        let finalUrl = null;
        if (aiResult && aiResult.query) {
            finalUrl = await searchOnYoutube(aiResult.query, cookieArgs, metadata.duration);
        }

        finalUrl = finalUrl || rawUrl;
        if (!finalUrl) {
            // Last resort: standard search without quotes
            finalUrl = await searchOnYoutube(`${metadata.title} ${metadata.artist} audio`, cookieArgs, metadata.duration);
        }
        
        if (!finalUrl) throw new Error('Could not find matching video.');

        return {
            ...metadata,
            targetUrl: finalUrl,
            isrc: metadata.isrc || (aiResult ? aiResult.found_isrc : '')
        };
        
    } catch (err) {
        console.error('[Spotify] Resolution failed:', err.message);
        throw err;
    }
}

async function searchOnYoutube(query, cookieArgs, targetDurationMs = 0) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    
    // Increase tolerance to 20 seconds for better matching with official videos
    const matchFilter = targetDurationMs > 0 
        ? `--match-filter "duration > ${Math.round(targetDurationMs / 1000) - 20} & duration < ${Math.round(targetDurationMs / 1000) + 20}"`
        : "";

    const args = [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--no-check-certificates',
        '--socket-timeout', '30',
        '--retries', '5',
        `ytsearch1:${cleanQuery}`
    ];

    // Insert match filter if we have a duration
    if (matchFilter) {
        args.splice(args.length - 1, 0, '--match-filter', `duration > ${Math.round(targetDurationMs / 1000) - 20} & duration < ${Math.round(targetDurationMs / 1000) + 20}`);
    }

    const searchProcess = spawn('yt-dlp', args);
    
    let youtubeId = '';
    let errorLog = '';

    await new Promise((resolve) => {
        searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
        searchProcess.stderr.on('data', (data) => errorLog += data.toString());
        searchProcess.on('close', resolve);
    });

    if (youtubeId.trim()) {
        return `https://www.youtube.com/watch?v=${youtubeId.trim().split('\n')[0]}`;
    }
    
    if (errorLog) console.warn(`[yt-dlp Search Error] ${errorLog}`);
    return null;
}

module.exports = { resolveSpotifyToYoutube, fetchIsrcFromDeezer };