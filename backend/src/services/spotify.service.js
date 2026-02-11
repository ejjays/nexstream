const { spawn, exec } = require('node:child_process');
const { GoogleGenAI } = require('@google/genai');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client/http');
const { getData, getDetails } = require('spotify-url-info')(fetch);
const { COMMON_ARGS, CACHE_DIR, getVideoInfo, cacheVideoInfo, acquireLock, releaseLock } = require('./ytdlp.service');
const cheerio = require('cheerio');
const axios = require('axios');
const { isValidSpotifyUrl, extractTrackId } = require('../utils/validation.util');

// --- DB INITIALIZATION ---
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const db = (TURSO_URL && TURSO_TOKEN) ? createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
}) : null;

if (db) {
    (async () => {
        try {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS spotify_mappings (
                    url TEXT PRIMARY KEY,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    imageUrl TEXT,
                    duration INTEGER,
                    isrc TEXT,
                    previewUrl TEXT,
                    youtubeUrl TEXT,
                    formats TEXT, -- JSON String
                    audioFormats TEXT, -- JSON String
                    audioFeatures TEXT, -- JSON String
                    year TEXT,
                    timestamp INTEGER
                )
            `);
            console.log('[Turso] Database initialized.');
        } catch (err) {
            console.error('[Turso] Database bootstrap failed:', err.message);
        }
    })();
} else {
    console.warn('[Turso] Database connection skipped: Missing URL or Token.');
}

async function saveToBrain(spotifyUrl, data) {
    if (!db) return;
    try {
        const cleanUrl = spotifyUrl.split('?')[0];

        const args = [
            cleanUrl,
            data.title || 'Unknown Title',
            data.artist || 'Unknown Artist',
            data.album || '',
            data.imageUrl || null,
            data.duration || 0,
            data.isrc || null,
            data.previewUrl || null,
            data.targetUrl || data.youtubeUrl || null,
            JSON.stringify(data.formats || []),
            JSON.stringify(data.audioFormats || []),
            JSON.stringify(data.audioFeatures || null),
            data.year || 'Unknown',
            Date.now()
        ];

        await db.execute({
            sql: `INSERT OR REPLACE INTO spotify_mappings 
                  (url, title, artist, album, imageUrl, duration, isrc, previewUrl, youtubeUrl, formats, audioFormats, audioFeatures, year, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: args
        });
        console.log(`[Turso] Mapped: "${data.title}"`);
    } catch (err) {
        console.warn('[Turso] Failed to save to database:', err.message);
    }
}

const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
    : null;

const SOUNDCHARTS_APP_ID = process.env.SOUNDCHARTS_APP_ID;
const SOUNDCHARTS_API_KEY = process.env.SOUNDCHARTS_API_KEY;

const aiCache = new Map();
const soundchartsMetadataCache = new Map(); // Spotify ID -> Soundcharts Data

async function fetchFromSoundcharts(spotifyUrl) {
    try {
        const trackId = extractTrackId(spotifyUrl);
        if (!trackId) return null;

        // Check internal metadata cache
        if (soundchartsMetadataCache.has(trackId)) {
            const cached = soundchartsMetadataCache.get(trackId);
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) return cached.data;
        }

        const baseUrl = 'https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify';
        const response = await fetch(`${baseUrl}/${trackId}`, {
            headers: { 'x-app-id': SOUNDCHARTS_APP_ID, 'x-api-key': SOUNDCHARTS_API_KEY }
        });

        if (!response.ok) {
            console.warn(`[Soundcharts] API responded with status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (!data || !data.object) return null;

        const obj = data.object;
        const result = {
            title: obj.name,
            artist: obj.artists?.[0]?.name || 'Unknown Artist',
            album: obj.labels?.[0]?.name || '', // Using label as fallback for album if not direct
            imageUrl: obj.imageUrl,
            duration: (obj.duration || 0) * 1000, // Soundcharts is in seconds
            isrc: obj.isrc?.value || '',
            audioFeatures: obj.audio || null,
            year: obj.releaseDate ? obj.releaseDate.split('-')[0] : 'Unknown',
            source: 'soundcharts'
        };

        // Save to long-term metadata cache
        soundchartsMetadataCache.set(trackId, { data: result, timestamp: Date.now() });
        return result;
    } catch (err) {
        console.warn(`[Soundcharts] Error: ${err.message}`);
        return null;
    }
}

async function fetchFromScrapers(videoURL) {
    const trackId = extractTrackId(videoURL);
    if (!trackId) return null;
    
    const safeUrl = `https://open.spotify.com/track/${trackId}`;
    
    try {
        let details = null;
        try { details = await getData(safeUrl); } catch (e) {}
        if (!details) try { details = await getDetails(safeUrl); } catch (e) {}
        if (!details) {
            try {
                const oembedBase = 'https://open.spotify.com/oembed';
                const oembedUrl = `${oembedBase}?url=${encodeURIComponent(safeUrl)}`;
                const oembedRes = await fetch(oembedUrl);
                const oembedData = await oembedRes.json();
                if (oembedData) details = { name: oembedData.title, artists: [{ name: 'Unknown Artist' }] };
            } catch (e) {}
        }
        if (!details) return null;

        return {
            title: details.name || details.preview?.title || details.title || 'Unknown Title',
            artist: (details.artists && details.artists[0]?.name) || details.preview?.artist || details.artist || 'Unknown Artist',
            album: (details.album && details.album.name) || details.preview?.album || details.album || '',
            imageUrl: (details.visualIdentity?.image && details.visualIdentity.image[details.visualIdentity.image.length - 1]?.url) || 
                      (details.coverArt?.sources && details.coverArt.sources[details.coverArt.sources.length - 1]?.url) || 
                      details.preview?.image || details.image || details.thumbnail_url || '',
            duration: details.duration_ms || details.duration || details.preview?.duration_ms || 0,
            year: (typeof details.releaseDate === 'string' && details.releaseDate.split('-')[0]) || (typeof details.release_date === 'string' && details.release_date.split('-')[0]) || 'Unknown',
            isrc: details.external_ids?.isrc || details.isrc || details.preview?.isrc || '',
            previewUrl: details.preview_url || details.audio_preview_url || details.preview?.audio_url || (details.tracks && details.tracks[0]?.preview_url) || null,
            source: 'scrapers'
        };
    } catch (err) {
        console.warn(`[Scrapers] Error: ${err.message}`);
        return null;
    }
}

const resolutionCache = new Map(); // Spotify URL -> YouTube URL mapping
resolutionCache.clear(); // FORCE CLEAR FOR FEATURE UPDATE
const RESOLUTION_EXPIRY = 15 * 1000; // 15 seconds (temporary)

// Circuit Breaker for Quota Limits
let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchSpotifyPageData(videoURL) {
    const trackId = extractTrackId(videoURL);
    if (!trackId) return null;

    const safeUrl = `https://open.spotify.com/track/${trackId}`;
    try {
        const { data } = await axios.get(safeUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const ogImage = $('meta[property="og:image"]').attr('content');
        return { cover: ogImage };
    } catch (e) {
        return null;
    }
}

async function fetchPreviewUrlManually(videoURL) {
    try {
        const trackId = extractTrackId(videoURL);
        if (!trackId) return null;

        const embedBase = 'https://open.spotify.com/embed/track';
        const { data } = await axios.get(`${embedBase}/${trackId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const $ = cheerio.load(data);
        const scriptContent = $('script[id="resource"]').html();
        if (scriptContent) {
            const json = JSON.parse(decodeURIComponent(scriptContent));
            if (json.preview_url) {
                console.log('[Spotify] Found preview in script resource');
                return json.preview_url;
            }
        }
        const match = data.match(/"preview_url":"(https:[^"]+)"/);
        if (match && match[1]) {
            console.log('[Spotify] Found preview via regex');
            return match[1].replace(/\\u002f/g, '/');
        }
        console.log('[Spotify] No preview found in embed data');
    } catch (err) {
        console.warn(`[Spotify] Manual preview fetch failed: ${err.message}`);
    }
    return null;
}

async function searchDeezer(query) {
    const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl);
    return res.json();
}

async function fetchIsrcFromDeezer(title, artist) {
    try {
        let searchData = await searchDeezer(`artist:"${artist}" track:"${title}"`);

        // Fallback 1: General query (Title + Artist)
        if (!searchData.data || searchData.data.length === 0) {
             searchData = await searchDeezer(`${title} ${artist}`);
        }

        const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();

        // Fallback 2: Clean title (remove parentheses/brackets)
        if ((!searchData.data || searchData.data.length === 0) && cleanTitle !== title) {
            console.log(`[Spotify] Deezer fallback: Searching for clean title "${cleanTitle}"`);
            searchData = await searchDeezer(`${cleanTitle} ${artist}`);
        }

        // Fallback 3: Broadest Search (Just Title, then filter by artist similarity)
        if (!searchData.data || searchData.data.length === 0) {
            console.log(`[Spotify] Deezer fallback: Broad search for "${cleanTitle}"`);
            searchData = await searchDeezer(cleanTitle);
            
            // If we found something, check if the artist matches roughly
            if (searchData.data && searchData.data.length > 0) {
                const best = searchData.data.find(t => 
                    t.artist.name.toLowerCase().includes(artist.toLowerCase()) || 
                    artist.toLowerCase().includes(t.artist.name.toLowerCase())
                );
                searchData.data = best ? [best] : []; 
            }
        }

        if (searchData.data && searchData.data.length > 0) {
            const trackId = searchData.data[0].id;
            const preview = searchData.data[0].preview;
            
            // Reconstruct safely
            const detailRes = await fetch(`https://api.deezer.com/track/${trackId}`);
            const detailData = await detailRes.json();
            return { isrc: detailData.isrc || null, preview: preview || null };
        }
    } catch (err) {
        console.warn(`[Spotify] Deezer lookup error: ${err.message}`);
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
            return { 
                isrc: data.results[0].isrc || null,
                preview: data.results[0].previewUrl || null 
            };
        }
    } catch (err) {}
    return null;
}

async function queryGroq(promptText) {
    if (!process.env.GROQ_API_KEY) return null;
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: promptText }],
                response_format: { type: 'json_object' }
            })
        });
        if (response.ok) {
            const data = await response.json();
            return JSON.parse(data.choices[0].message.content);
        }
    } catch (err) {}
    return null;
}

async function queryGemini(promptText) {
    if (!client) return null;
    let modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
        modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    } else { isGemini3Blocked = false; }
    
    for (const modelName of modelsToTry) {
        try {
            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: promptText }] }]
            });
            const responseText = response.text || (typeof response.text === 'function' ? response.text() : '');
            if (!responseText) continue;
            const text = responseText.trim().replace(/```json|```/g, '');
            return JSON.parse(text);
        } catch (error) {
            if (error.message.includes('429') && modelName.includes('gemini-3')) {
                isGemini3Blocked = true; gemini3BlockTime = Date.now();
            }
        }
    }
    return null;
}

async function refineSearchWithAI(metadata) {
    const { title, artist, album, year, isrc, duration } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    if (aiCache.has(cacheKey)) return aiCache.get(cacheKey);

    const promptText = `Act as a Professional Music Query Architect.
        DATA: Title: "${title}", Artist: "${artist}", Album: "${album}", Year: "${year}", VERIFIED_ISRC: "${isrc || 'NONE'}", Duration: ${Math.round(duration / 1000)}s
        
        TASK:
        1. Create a high-precision YouTube search query.
        2. If VERIFIED_ISRC is provided, include it in the query.
        3. If VERIFIED_ISRC is "NONE", DO NOT invent one. Instead, use Artist, Title, and Album.
        4. Append professional keywords like "Topic", "Official Audio", or "Auto-generated by YouTube" to prioritize official label uploads over music videos with intros.
        5. Aim to find the STUDIO version that matches the duration exactly.

        RETURN JSON ONLY: {"query": "Artist Title [ISRC] Topic", "confidence": 100}`;

    let result = await queryGroq(promptText);
    if (result) {
        console.log(`[Spotify] AI Query (Groq): ${result.query}`);
    } else {
        result = await queryGemini(promptText);
        if (result) console.log(`[Spotify] AI Query (Gemini): ${result.query}`);
    }

    if (result) {
        aiCache.set(cacheKey, result);
        return result;
    }
    
    return { query: null, confidence: 0 };
}

async function fetchFromOdesli(spotifyUrl) {
    if (!isValidSpotifyUrl(spotifyUrl)) return null;
    try {
        const baseUrl = 'https://api.odesli.co/v1-alpha.1/links';
        const url = `${baseUrl}?url=${encodeURIComponent(spotifyUrl)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const youtubeLink = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;
        if (!youtubeLink) return null;
        const entityId = data.linksByPlatform?.youtube?.entityUniqueId || data.linksByPlatform?.youtubeMusic?.entityUniqueId;
        const entity = data.entitiesByUniqueId[entityId];
        return { targetUrl: youtubeLink, title: entity?.title, artist: entity?.artistName, thumbnailUrl: entity?.thumbnailUrl };
    } catch (err) { return null; }
}

async function searchOnYoutube(query, cookieArgs, targetDurationMs = 0) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
    
    const args = [
        ...cookieArgs,
        '--dump-json',
        '--no-playlist',
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--cache-dir', CACHE_DIR,
        `ytsearch1:${cleanQuery}`
    ];

    console.log(`[YouTube Search] Starting: ${cleanQuery}`);

    await acquireLock();
    return new Promise((resolve) => {
        const searchProcess = spawn('yt-dlp', args);
        let output = '';
        let errorOutput = '';
        searchProcess.stdout.on('data', (data) => output += data.toString());
        searchProcess.stderr.on('data', (data) => errorOutput += data.toString());
        searchProcess.on('close', (code) => {
            releaseLock();
            if (code !== 0) {
                console.error(`[YouTube Search] FAILED with code ${code}. Error: ${errorOutput.split('\n')[0]}`);
                return resolve(null);
            }
            if (!output) {
                console.warn(`[YouTube Search] No output for query: ${cleanQuery}`);
                return resolve(null);
            }
            try {
                const info = JSON.parse(output);
                cacheVideoInfo(info.webpage_url, info, cookieArgs);
                const diff = targetDurationMs > 0 ? Math.abs((info.duration * 1000) - targetDurationMs) : 0;
                console.log(`[YouTube Search] SUCCESS: Found "${info.title}" | Duration Diff: ${Math.round(diff/1000)}s`);
                resolve({ url: info.webpage_url, info: info, diff: diff });
            } catch (e) { 
                console.error(`[YouTube Search] JSON parse failed for "${cleanQuery}"`);
                resolve(null); 
            }
        });
    });
}

/**
 * Handles concurrent search resolution with priority weighting.
 */
async function priorityRace(candidates, targetDurationMs) {
    return new Promise((resolve) => {
        let bestMatch = null;
        let graceTimer = null;
        let finishedCount = 0;
        let isSettled = false;

        const settle = (match, reason = '') => {
            if (isSettled) return;
            isSettled = true;
            if (graceTimer) clearTimeout(graceTimer);
            if (reason) console.log(`[Spotify Race] Settle: ${reason}`);
            resolve(match);
        };

        candidates.forEach(c => {
            c.promise.then(result => {
                if (isSettled) return;
                finishedCount++;

                if (!result) {
                    if (finishedCount === candidates.length) settle(bestMatch, 'All finished');
                    return;
                }
                
                const isGoodMatch = (targetDurationMs === 0) || (result.diff < 15000);
                const isPerfectMatch = (targetDurationMs > 0) && (result.diff < 2000);

                if (!isGoodMatch) {
                    if (finishedCount === candidates.length) settle(bestMatch, 'All finished');
                    return;
                }

                const match = { ...result, type: c.type, priority: c.priority };

                if (match.priority === 0) {
                    settle(match, `${c.type} (P0) match`);
                } 
                else if (!bestMatch || match.priority < bestMatch.priority || (match.priority === bestMatch.priority && match.diff < bestMatch.diff)) {
                    bestMatch = match;
                    const waitTime = isPerfectMatch ? 2500 : (match.priority === 2 ? 3000 : 1500);
                    
                    console.log(`[Spotify Race] ${c.type} (P${c.priority}) match. Waiting ${waitTime}ms...`);
                    
                    if (graceTimer) clearTimeout(graceTimer);
                    graceTimer = setTimeout(() => {
                        settle(bestMatch, 'Grace expired');
                    }, waitTime);
                }

                if (finishedCount === candidates.length) {
                    settle(bestMatch, 'All finished');
                }
            }).catch(err => {
                if (isSettled) return;
                finishedCount++;
                console.error(`[Spotify Race] ${c.type} error:`, err.message);
                if (finishedCount === candidates.length) settle(bestMatch, 'Error fallback');
            });
        });
    });
}

async function checkBrainCache(cleanUrl, onProgress) {
    if (!db) return null;
    try {
        const result = await db.execute({
            sql: "SELECT * FROM spotify_mappings WHERE url = ?",
            args: [cleanUrl]
        });

        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0];
            const brainData = {
                ...row,
                formats: JSON.parse(row.formats || '[]'),
                audioFormats: JSON.parse(row.audioFormats || '[]'),
                audioFeatures: JSON.parse(row.audioFeatures || 'null'),
                targetUrl: row.youtubeUrl,
                fromBrain: true
            };

            if (brainData.formats && brainData.formats.length > 0) {
                console.log(`[Turso] Cache hit: "${brainData.title}"`);
                onProgress('fetching_info', 95, { 
                    subStatus: 'Found in cache...',
                    details: `ISRC: ${brainData.isrc || 'IDENTIFIED'}` 
                });

                // --- SUPER JIT PREVIEW REFRESH ---
                try {
                    let fresh = await fetchPreviewUrlManually(cleanUrl);
                    if (!fresh) {
                        const dData = await fetchIsrcFromDeezer(brainData.title, brainData.artist);
                        fresh = dData?.preview;
                    }
                    if (!fresh) {
                        const iData = await fetchIsrcFromItunes(brainData.title, brainData.artist);
                        fresh = iData?.preview;
                    }
                    if (fresh) {
                        console.log(`[Brain] 🔄 JIT Refresh: Playback link updated.`);
                        brainData.previewUrl = fresh;
                    }
                } catch (e) {
                    console.warn(`[Brain] JIT Refresh failed:`, e.message);
                }
                return brainData;
            }
        }
    } catch (err) {
        console.warn('[Turso] Lookup failed:', err.message);
    }
    return null;
}

async function fetchInitialMetadata(videoURL, onProgress) {
    onProgress('fetching_info', 10, { 
        subStatus: 'Fetching metadata...',
        details: `Source: Soundcharts & Scrapers`
    });

    const soundchartsPromise = fetchFromSoundcharts(videoURL);
    const scrapersPromise = fetchFromScrapers(videoURL);

    // Race for the first responder to hydrate UI fast
    const firstMetadata = await Promise.any([
        soundchartsPromise.then(res => res || Promise.reject(new Error('No Soundcharts'))),
        scrapersPromise.then(res => res || Promise.reject(new Error('No Scrapers')))
    ]).catch(() => null);

    if (!firstMetadata) throw new Error('Metadata fetch failed');

    onProgress('fetching_info', 20, { 
        subStatus: 'Metadata locked.',
        details: `Title: "${firstMetadata.title}"`
    });

    return { metadata: { ...firstMetadata }, soundchartsPromise };
}

async function resolveSideTasks(videoURL, metadata) {
    const tasks = [
        fetchSpotifyPageData(videoURL).then(res => { if (res?.cover) metadata.imageUrl = res.cover; }),
        !metadata.previewUrl ? fetchPreviewUrlManually(videoURL).then(res => { 
            if (res) metadata.previewUrl = res; 
        }) : Promise.resolve()
    ];
    await Promise.allSettled(tasks);
}

function checkIsrcMatchSwitch(bestMatch, isrcMatch, threshold = 2000) {
    if (!isrcMatch) return bestMatch;
    const currentIsIsrc = bestMatch?.type === 'ISRC' || bestMatch?.type === 'Soundcharts';
    if (!currentIsIsrc && isrcMatch.diff <= threshold) {
        return { ...isrcMatch, type: 'ISRC', priority: 0 };
    }
    return bestMatch;
}

async function runPriorityRace(videoURL, metadata, cookieArgs, onProgress) {
    const candidates = [];

    // 1. Odesli Candidate
    const odesliPromise = fetchFromOdesli(videoURL).then(async (res) => {
        if (!res) return null;
        onProgress('fetching_info', 30, { details: 'Checking Odesli...' });
        const info = await getVideoInfo(res.targetUrl, cookieArgs);
        onProgress('fetching_info', 35, { details: 'Odesli match found.' });
        return { url: res.targetUrl, info, diff: Math.abs((info.duration * 1000) - metadata.duration) };
    }).catch(() => null);
    candidates.push({ type: 'Odesli', priority: 1, promise: odesliPromise });

    // 2. ISRC Candidate
    const isrcPromise = (async () => {
        const dDataPromise = !metadata.isrc || !metadata.previewUrl ? fetchIsrcFromDeezer(metadata.title, metadata.artist) : Promise.resolve(null);
        const iDataPromise = !metadata.isrc ? fetchIsrcFromItunes(metadata.title, metadata.artist) : Promise.resolve(null);
        const [dData, iData] = await Promise.all([dDataPromise, iDataPromise]);

        const isrc = metadata.isrc || dData?.isrc || iData?.isrc;
        if (isrc) {
            onProgress('fetching_info', 40, { details: `ISRC: ${isrc}` });
            metadata.isrc = isrc;
        }

        metadata.previewUrl = metadata.previewUrl || dData?.preview || iData?.preview || null;
        if (!isrc) return null;

        onProgress('fetching_info', 45, { details: 'Running ISRC scan...' });
        return searchOnYoutube(`"${isrc}"`, cookieArgs, metadata.duration);
    })();
    candidates.push({ type: 'ISRC', priority: 0, promise: isrcPromise });

    // 3. AI Search Candidate
    const aiPromise = refineSearchWithAI(metadata).then(ai => {
        if (!ai?.query) return null;
        onProgress('fetching_info', 50, { details: 'Running AI search...' });
        return searchOnYoutube(ai.query, cookieArgs, metadata.duration);
    });
    candidates.push({ type: 'AI', priority: 2, promise: aiPromise });

    // 4. Clean Search Candidate
    const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, '').trim();
    if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist') {
        const cleanPromise = searchOnYoutube(`${metadata.title} ${cleanArtist}`, cookieArgs, metadata.duration).then(res => {
            if (res) onProgress('fetching_info', 55, { details: 'Clean search match.' });
            return res;
        });
        candidates.push({ type: 'Clean', priority: 2, promise: cleanPromise });
    }

    let bestMatch = await priorityRace(candidates, metadata.duration);
    
    // Resolve side tasks and check for ISRC switching
    const [isrcResult] = await Promise.all([
        isrcPromise,
        resolveSideTasks(videoURL, metadata)
    ]);

    return checkIsrcMatchSwitch(bestMatch, isrcResult);
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };
    if (!videoURL.includes('/track/')) throw new Error('Only direct Spotify track links supported.');

    const cleanUrl = videoURL.split('?')[0];
    const cachedBrainData = await checkBrainCache(cleanUrl, onProgress);
    if (cachedBrainData) return cachedBrainData;

    if (resolutionCache.has(videoURL)) {
        const cached = resolutionCache.get(videoURL);
        if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
            onProgress('fetching_info', 90, { subStatus: 'Found in local cache.' });
            return cached.data;
        }
    }

    try {
        const { metadata } = await fetchInitialMetadata(videoURL, onProgress);
        let bestMatch = await runPriorityRace(videoURL, metadata, cookieArgs, onProgress);

        if (!bestMatch) {
            onProgress('fetching_info', 85, { subStatus: 'Deep scan...' });
            bestMatch = await searchOnYoutube(`${metadata.title} ${metadata.artist} audio`, cookieArgs, metadata.duration);
        }

        if (!bestMatch?.url) throw new Error('No match found.');

        const finalData = { 
            ...metadata, 
            targetUrl: bestMatch.url,
            isIsrcMatch: !!(bestMatch.type === 'ISRC' || bestMatch.type === 'Soundcharts'),
            previewUrl: metadata.previewUrl 
        };

        resolutionCache.set(videoURL, { data: finalData, timestamp: Date.now() });
        return finalData;
    } catch (err) {
        console.error('[Spotify] Resolution error:', err.message);
        throw err;
    }
}

module.exports = { resolveSpotifyToYoutube, fetchIsrcFromDeezer, saveToBrain };