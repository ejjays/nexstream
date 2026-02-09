const { spawn, exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getData, getDetails } = require('spotify-url-info')(fetch);
const { COMMON_ARGS, CACHE_DIR, getVideoInfo, cacheVideoInfo, acquireLock, releaseLock } = require('./ytdlp.service');
const cheerio = require('cheerio');
const axios = require('axios');

// 2026 Standard Initialization
const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
    : null;

const aiCache = new Map();
const resolutionCache = new Map(); // Spotify URL -> YouTube URL mapping
resolutionCache.clear(); // FORCE CLEAR FOR FEATURE UPDATE
const RESOLUTION_EXPIRY = 15 * 1000; // 15 seconds (temporary)

// Circuit Breaker for Quota Limits
let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchSpotifyPageData(videoURL) {
    try {
        const { data } = await axios.get(videoURL, {
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
        const trackId = videoURL.split('track/')[1]?.split('?')[0];
        if (!trackId) return null;

        const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
        console.log(`[Spotify] Attempting manual preview fetch: ${embedUrl}`);
        const { data } = await axios.get(embedUrl, {
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

async function fetchIsrcFromDeezer(title, artist) {
    try {
        let query = `artist:"${artist}" track:"${title}"`;
        let searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
        let res = await fetch(searchUrl);
        let searchData = await res.json();

        // Fallback 1: General query (Title + Artist)
        if (!searchData.data || searchData.data.length === 0) {
             query = `${title} ${artist}`;
             searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
             res = await fetch(searchUrl);
             searchData = await res.json();
        }

        // Fallback 2: Clean title (remove parentheses/brackets)
        if (!searchData.data || searchData.data.length === 0) {
            const cleanTitle = title.replace(/\s*[(\[].*?[)\]]/g, '').trim();
            if (cleanTitle !== title) {
                console.log(`[Spotify] Deezer fallback: Searching for clean title "${cleanTitle}"`);
                query = `${cleanTitle} ${artist}`;
                searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}`;
                res = await fetch(searchUrl);
                searchData = await res.json();
            }
        }

        // Fallback 3: Broadest Search (Just Title, then filter by artist similarity)
        if (!searchData.data || searchData.data.length === 0) {
            const cleanTitle = title.replace(/\s*[(\[].*?[)\]]/g, '').trim();
            console.log(`[Spotify] Deezer fallback: Broad search for "${cleanTitle}"`);
            searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(cleanTitle)}`;
            res = await fetch(searchUrl);
            searchData = await res.json();
            
            // If we found something, check if the artist matches roughly
            if (searchData.data && searchData.data.length > 0) {
                const best = searchData.data.find(t => 
                    t.artist.name.toLowerCase().includes(artist.toLowerCase()) || 
                    artist.toLowerCase().includes(t.artist.name.toLowerCase())
                );
                if (best) searchData.data = [best];
                else searchData.data = []; // No match
            }
        }

        if (searchData.data && searchData.data.length > 0) {
            const trackId = searchData.data[0].id;
            const preview = searchData.data[0].preview;
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

    if (process.env.GROQ_API_KEY) {
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
                const parsed = JSON.parse(data.choices[0].message.content);
                console.log(`[Spotify] AI Query (Groq): ${parsed.query}`);
                aiCache.set(cacheKey, parsed);
                return parsed;
            }
        } catch (err) {}
    }

    if (client) {
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
                const parsed = JSON.parse(text);
                console.log(`[Spotify] AI Query (${modelName}): ${parsed.query}`);
                aiCache.set(cacheKey, parsed);
                return parsed;
            } catch (error) {
                if (error.message.includes('429') && modelName.includes('gemini-3')) {
                    isGemini3Blocked = true; gemini3BlockTime = Date.now();
                }
            }
        }
    }
    return { query: null, confidence: 0 };
}

async function fetchFromOdesli(spotifyUrl) {
    try {
        const url = `https://api.odesli.co/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
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
 * ELITE PRIORITY RACE CONTROLLER
 * Ensures that high-accuracy results (ISRC) win even if they are slightly slower.
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
            if (reason) console.log(`[Spotify Race] Final Decision: ${reason}`);
            resolve(match);
        };

        candidates.forEach(c => {
            c.promise.then(result => {
                if (isSettled) return;
                finishedCount++;

                if (!result) {
                    if (finishedCount === candidates.length) settle(bestMatch, 'All candidates finished');
                    return;
                }
                
                const isGoodMatch = (targetDurationMs === 0) || (result.diff < 15000);
                const isPerfectMatch = (targetDurationMs > 0) && (result.diff < 2000);

                if (!isGoodMatch) {
                    if (finishedCount === candidates.length) settle(bestMatch, 'All candidates finished (no good match)');
                    return;
                }

                const match = { ...result, type: c.type, priority: c.priority };

                // LEVEL 0 (ISRC): Instant Winner
                if (match.priority === 0) {
                    settle(match, `Strategy ${c.type} (P0) WON instantly.`);
                } 
                // BETTER PRIORITY or FIRST MATCH:
                else if (!bestMatch || match.priority < bestMatch.priority || (match.priority === bestMatch.priority && match.diff < bestMatch.diff)) {
                    bestMatch = match;
                    
                    // If we found a P2 (AI/Clean), we wait for P1 (Odesli) or P0 (ISRC)
                    // If it's a perfect match, we don't need to wait as long
                    const waitTime = isPerfectMatch ? 1000 : (match.priority === 2 ? 2500 : 1500);
                    
                    console.log(`[Spotify Race] Strategy ${c.type} (P${c.priority}) ${isPerfectMatch ? 'PERFECT' : 'good'} match. Waiting ${waitTime}ms...`);
                    
                    if (graceTimer) clearTimeout(graceTimer);
                    graceTimer = setTimeout(() => {
                        settle(bestMatch, `Grace window expired. Settling for P${bestMatch.priority} (${bestMatch.type})`);
                    }, waitTime);
                }

                if (finishedCount === candidates.length) {
                    settle(bestMatch, 'All candidates finished (End of loop)');
                }
            }).catch(err => {
                if (isSettled) return;
                finishedCount++;
                console.error(`[Spotify Race] Strategy ${c.type} errored:`, err.message);
                if (finishedCount === candidates.length) settle(bestMatch, 'All candidates finished (Error fallback)');
            });
        });
    });
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    // STRICT VALIDATION: Only allow direct track links
    if (!videoURL.includes('/track/')) {
        throw new Error('Only direct Spotify track links are supported. Artist, Album, and Playlist links are not supported.');
    }

    if (resolutionCache.has(videoURL)) {
        const cached = resolutionCache.get(videoURL);
        if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
            onProgress('fetching_info', 90, { subStatus: 'Mapping found in cache.' });
            return cached.data;
        }
    }

    try {
        onProgress('fetching_info', 10, { 
            subStatus: 'Accessing Spotify Metadata...',
            details: `QUERYING_RESOURCE: ${videoURL.split('track/')[1]?.split('?')[0]}`
        });
        let details = null;
        try { details = await getData(videoURL); } catch (e) {}
        if (!details) try { details = await getDetails(videoURL); } catch (e) {}
        if (!details) {
            try {
                const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(videoURL)}`);
                const oembedData = await oembedRes.json();
                if (oembedData) details = { name: oembedData.title, artists: [{ name: 'Unknown Artist' }] };
            } catch (e) {}
        }
        if (!details) throw new Error('Spotify metadata fetch failed');

        const metadata = {
            title: details.name || details.preview?.title || details.title || 'Unknown Title',
            artist: (details.artists && details.artists[0]?.name) || details.preview?.artist || details.artist || 'Unknown Artist',
            album: (details.album && details.album.name) || details.preview?.album || details.album || '',
            imageUrl: (details.visualIdentity?.image && details.visualIdentity.image[details.visualIdentity.image.length - 1]?.url) || 
                      (details.coverArt?.sources && details.coverArt.sources[details.coverArt.sources.length - 1]?.url) || 
                      details.preview?.image || details.image || details.thumbnail_url || '',
            duration: details.duration_ms || details.duration || details.preview?.duration_ms || 0,
            year: (typeof details.releaseDate === 'string' && details.releaseDate.split('-')[0]) || (typeof details.release_date === 'string' && details.release_date.split('-')[0]) || 'Unknown',
            isrc: details.external_ids?.isrc || details.isrc || details.preview?.isrc || '',
            previewUrl: details.preview_url || details.audio_preview_url || details.preview?.audio_url || (details.tracks && details.tracks[0]?.preview_url) || null
        };

        onProgress('fetching_info', 20, { 
            subStatus: 'Resolving Streams (Independent Trigger)...',
            details: `METADATA_EXTRACTED: "${metadata.title}" BY "${metadata.artist}"`
        });

        const candidates = [];

        // 1. Odesli Strategy (P1)
        const odesliPromise = fetchFromOdesli(videoURL).then(res => {
            if (!res) return null;
            onProgress('fetching_info', 30, { details: 'STRATEGY_Odesli: CONTACTING_API_GATEWAY...' });
            return getVideoInfo(res.targetUrl, cookieArgs)
                .then(info => {
                    onProgress('fetching_info', 35, { details: 'STRATEGY_Odesli: RESOURCE_MAPPED_SUCCESSFULLY.' });
                    return { url: res.targetUrl, info, diff: Math.abs((info.duration * 1000) - metadata.duration) };
                })
                .catch(() => null);
        });
        candidates.push({ type: 'Odesli', priority: 1, promise: odesliPromise });

        // 2. ISRC Strategy (P0)
        const deezerPromise = !metadata.isrc || !metadata.previewUrl ? fetchIsrcFromDeezer(metadata.title, metadata.artist) : Promise.resolve(null);
        const itunesPromise = !metadata.isrc ? fetchIsrcFromItunes(metadata.title, metadata.artist) : Promise.resolve(null);
        
        const isrcPromise = Promise.all([deezerPromise, itunesPromise]).then(([d, i]) => {
            const isrc = metadata.isrc || (d && d.isrc) || (i && i.isrc);
            
            if (isrc) {
                onProgress('fetching_info', 40, { details: `ISRC_IDENTIFIED: ${isrc}` });
            }

            // SIDE EFFECTS: Update shared metadata object as soon as we find info
            if (!metadata.previewUrl) {
                if (d && d.preview) {
                    console.log(`[Spotify] Found backup preview via Deezer: ${d.preview}`);
                    metadata.previewUrl = d.preview;
                } else if (i && i.preview) {
                    console.log(`[Spotify] Found backup preview via iTunes: ${i.preview}`);
                    metadata.previewUrl = i.preview;
                }
            }
            if (isrc) metadata.isrc = isrc;

            if (!isrc) return null;
            onProgress('fetching_info', 45, { details: 'STRATEGY_ISRC: INITIATING_DEEP_SCAN...' });
            return searchOnYoutube(`"${isrc}"`, cookieArgs, metadata.duration);
        });
        candidates.push({ type: 'ISRC', priority: 0, promise: isrcPromise });

        // 3. AI / Clean Search (P2)
        const aiPromise = refineSearchWithAI(metadata).then(ai => {
            if (ai.query) {
                onProgress('fetching_info', 50, { details: 'STRATEGY_AI: OPTIMIZING_SEARCH_QUERY...' });
                return searchOnYoutube(ai.query, cookieArgs, metadata.duration);
            }
            return null;
        });
        candidates.push({ type: 'AI', priority: 2, promise: aiPromise });

        const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, '').trim();
        // Prevent searching for "Unknown Artist" if we already know it might be garbage
        if (cleanArtist && cleanArtist.toLowerCase() !== 'unknown artist') {
            const cleanPromise = searchOnYoutube(`${metadata.title} ${cleanArtist}`, cookieArgs, metadata.duration).then(res => {
                if (res) onProgress('fetching_info', 55, { details: 'STRATEGY_Clean: MATCH_IDENTIFIED.' });
                return res;
            });
            candidates.push({ type: 'Clean', priority: 2, promise: cleanPromise });
        } else {
             console.warn('[Spotify] Skipping Clean Search due to potentially invalid artist name.');
        }

        // Start non-critical side lookups in parallel
        const sideTasks = [
            fetchSpotifyPageData(videoURL).then(res => { if (res && res.cover) metadata.imageUrl = res.cover; }),
            !metadata.previewUrl ? fetchPreviewUrlManually(videoURL).then(res => { 
                if (res && !metadata.previewUrl) {
                    console.log(`[Spotify] Found backup preview via Scraper: ${res}`);
                    metadata.previewUrl = res; 
                }
            }) : Promise.resolve()
        ];

        let bestMatch = await priorityRace(candidates, metadata.duration);

        if (!bestMatch) {
            onProgress('fetching_info', 85, { subStatus: 'Deep scan...' });
            bestMatch = await searchOnYoutube(`${metadata.title} ${metadata.artist} audio`, cookieArgs, metadata.duration);
        }

        // CRITICAL: Wait for ALL side tasks (including Deezer preview lookup) to settle before returning
        await Promise.allSettled([...sideTasks, isrcPromise]);

        if (!bestMatch || !bestMatch.url) throw new Error('No match found.');

        const finalData = { 
            ...metadata, 
            targetUrl: bestMatch.url,
            // Re-assign explicitly to ensure latest value is captured after parallel tasks
            previewUrl: metadata.previewUrl 
        };
        resolutionCache.set(videoURL, { data: finalData, timestamp: Date.now() });
        return finalData;

    } catch (err) {
        console.error('[Spotify] Resolution failed:', err.message);
        throw err;
    }
}

module.exports = { resolveSpotifyToYoutube, fetchIsrcFromDeezer };