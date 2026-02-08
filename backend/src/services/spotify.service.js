const { spawn, exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const { getData, getDetails } = require('spotify-url-info')(fetch);
const { COMMON_ARGS, CACHE_DIR, getVideoInfo } = require('./ytdlp.service');
const cheerio = require('cheerio');
const axios = require('axios');

// 2026 Standard Initialization
const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
    : null;

const aiCache = new Map();
const resolutionCache = new Map(); // Spotify URL -> YouTube URL mapping
resolutionCache.clear(); // FORCE CLEAR FOR FEATURE UPDATE
const RESOLUTION_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours

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
        
        // High-Res Cover Art (og:image is usually high quality on Spotify)
        const ogImage = $('meta[property="og:image"]').attr('content');
        
        return {
            cover: ogImage
        };
    } catch (e) {
        console.warn('[Spotify Scraper] Page fetch failed:', e.message);
        return null;
    }
}

async function fetchPreviewUrlManually(videoURL) {
    try {
        const trackId = videoURL.split('track/')[1]?.split('?')[0];
        if (!trackId) return null;

        const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
        const { data } = await axios.get(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const $ = cheerio.load(data);
        const scriptContent = $('script[id="resource"]').html();
        
        if (scriptContent) {
            const json = JSON.parse(decodeURIComponent(scriptContent));
            if (json.preview_url) return json.preview_url;
        }

        // Regex Fallback for legacy embeds
        const match = data.match(/"preview_url":"(https:[^"]+)"/);
        if (match && match[1]) {
            return match[1].replace(/\\u002f/g, '/');
        }
    } catch (err) {
        console.warn('[Spotify Scraper] Manual fetch failed:', err.message);
    }
    return null;
}

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
            const preview = searchData.data[0].preview; // Deezer always provides a 30s preview
            const detailRes = await fetch(`https://api.deezer.com/track/${trackId}`);
            const detailData = await detailRes.json();
            return { 
                isrc: detailData.isrc || null,
                preview: preview || null
            };
        }
    } catch (err) {
        // Silently fail for parallel flow
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
        // Silently fail for parallel flow
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

    // STRATEGY 1: Groq (Llama 3.3 70B) - Ultra Fast Primary
    if (process.env.GROQ_API_KEY) {
        try {
            console.log('[AI] Attempting Groq (Llama 3.3)...');
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: promptText }],
                    response_format: { type: 'json_object' }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const parsed = JSON.parse(data.choices[0].message.content);
                console.log(`[AI] Groq successful. Query: "${parsed.query}" | Confidence: ${parsed.confidence}%`);
                aiCache.set(cacheKey, parsed);
                return parsed;
            } else {
                console.warn(`[AI] Groq failed: ${response.status} ${response.statusText}`);
            }
        } catch (err) {
            console.warn('[AI] Groq error:', err.message);
        }
    }

    // STRATEGY 2: Gemini - Reliable Fallback
    if (client) {
        console.log('[AI] Falling back to Gemini...');
        let modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
        
        if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
            modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
        } else {
            isGemini3Blocked = false; 
        }
        
        for (const modelName of modelsToTry) {
            try {
                const response = await client.models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: [{ text: promptText }] }]
                });

                const responseText = response.text || (typeof response.text === 'function' ? response.text() : '');
                if (!responseText) throw new Error('Empty AI response');

                const text = responseText.trim().replace(/```json|```/g, '');
                const parsed = JSON.parse(text);
                
                console.log(`[AI] Gemini (${modelName}) successful. Query: "${parsed.query}" | Confidence: ${parsed.confidence}%`);
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

        return {
            targetUrl: youtubeLink,
            title: entity?.title,
            artist: entity?.artistName,
            thumbnailUrl: entity?.thumbnailUrl
        };
    } catch (err) {
        return null;
    }
}

async function fetchPreviewUrlManually(videoURL) {
    try {
        const trackId = videoURL.split('track/')[1]?.split('?')[0];
        if (!trackId) return null;

        const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
        const res = await fetch(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = await res.text();
        
        // Use regex to find the preview_url in the embedded JSON
        const match = html.match(/"preview_url":"(https:[^"]+)"/);
        if (match && match[1]) {
            return match[1].replace(/\\u002f/g, '/');
        }
    } catch (err) {
        console.warn('[Spotify Scraper] Manual fetch failed:', err.message);
    }
    return null;
}

async function fetchSpotifyPageData(videoURL) {
    try {
        const { data } = await axios.get(videoURL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        
        // og:image is usually 640x640
        let cover = $('meta[property="og:image"]').attr('content');
        
        // Fallback to twitter:image
        if (!cover) cover = $('meta[name="twitter:image"]').attr('content');
        
        // If it's a mosaic (playlist), try to get the first real track cover if possible
        // but for tracks this is perfect.

        return { cover };
    } catch (e) {
        console.warn('[Spotify Scraper] Page fetch failed:', e.message);
        return null;
    }
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    // Check Resolution Cache (Global Spotify -> YouTube Mapping)
    if (resolutionCache.has(videoURL)) {
        const cached = resolutionCache.get(videoURL);
        if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
            console.log(`[Spotify Cache] Skipping search, returning: ${cached.data.targetUrl}`);
            onProgress('fetching_info', 90, { subStatus: 'Mapping found in cache.' });
            return cached.data;
        }
    }

    try {
        onProgress('fetching_info', 10, { subStatus: 'Accessing Spotify Metadata...' });
        
        let details = null;
        try {
            details = await getData(videoURL);
        } catch (e) {
            console.warn('[Spotify] Primary fetch failed, trying fallbacks...');
        }

        if (!details) {
            try {
                details = await getDetails(videoURL);
            } catch (e) {
                console.warn('[Spotify] Secondary fallback failed.');
            }
        }

        if (!details || !details.title && !details.name) {
             try {
                const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(videoURL)}`);
                const oembedData = await oembedRes.json();
                if (oembedData) {
                    details = {
                        name: oembedData.title,
                        artists: [{ name: 'Unknown Artist' }],
                        coverArt: { sources: [{ url: oembedData.thumbnail_url }] }
                    };
                }
             } catch (e) {
                 console.warn('[Spotify] OEmbed fallback failed.');
             }
        }

        if (!details) throw new Error('Spotify metadata fetch failed');

        // Robust Preview URL extraction
        let previewUrl = details.preview_url || 
                           details.audio_preview_url || 
                           details.preview?.audio_url || 
                           (details.tracks && details.tracks[0]?.preview_url) ||
                           null;

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
            previewUrl: previewUrl
        };

        // PARALLEL STRATEGY: Fire Odesli, ISRC, and Scrapers simultaneously
        onProgress('fetching_info', 15, { subStatus: 'Searching Global Music Databases...' });

        const [odesliResult, backupIsrcData, highResCover, scraperPreview] = await Promise.all([
            fetchFromOdesli(videoURL),
            !metadata.isrc ? fetchIsrcFromDeezer(metadata.title, metadata.artist) : Promise.resolve(null),
            fetchSpotifyPageData(videoURL),
            !metadata.previewUrl ? fetchPreviewUrlManually(videoURL) : Promise.resolve(null)
        ]);

        // Update with Scraper results
        if (scraperPreview) metadata.previewUrl = scraperPreview;
        if (highResCover && highResCover.cover) metadata.imageUrl = highResCover.cover;
        
                if (backupIsrcData) {
                    console.log(`[Spotify] Data found via Deezer: ISRC=${backupIsrcData.isrc} | Preview=${backupIsrcData.preview ? 'Yes' : 'No'}`);
                    if (backupIsrcData.isrc) metadata.isrc = backupIsrcData.isrc;
                    if (backupIsrcData.preview && !metadata.previewUrl) {
                        metadata.previewUrl = backupIsrcData.preview;
                    }
                }
        
                // AUTHORITY TIER 1: ISRC Search (The Digital Fingerprint)
                // If we have a verified ISRC, this is the most accurate way to find the official track.
                if (metadata.isrc) {
                    onProgress('fetching_info', 25, { subStatus: `Scanning Digital Fingerprint: ${metadata.isrc}` });
                    const isrcUrl = await searchOnYoutube(`"${metadata.isrc}"`, cookieArgs, metadata.duration);
                    
                    if (isrcUrl) {
                        console.log(`[Spotify] Verified ISRC match found: ${isrcUrl}`);
                        const finalData = { 
                            ...metadata, 
                            targetUrl: isrcUrl,
                            // Keep the high-res cover we scraped
                            imageUrl: metadata.imageUrl
                        };
                        resolutionCache.set(videoURL, { data: finalData, timestamp: Date.now() });
                        return finalData;
                    }
                    console.log('[Spotify] ISRC search returned no direct match, falling back to Odesli/Metadata...');
                }
                
                // TIER 2: Odesli Verification
                if (odesliResult) {
                    console.log(`[Spotify] Match found via Odesli: ${odesliResult.targetUrl}`);
                    onProgress('fetching_info', 35, { subStatus: 'Verifying Database Match...' });
                    
                    try {
                        const ytInfo = await getVideoInfo(odesliResult.targetUrl, cookieArgs);
                        const ytDurationMs = (ytInfo.duration || 0) * 1000;
                        const diff = Math.abs(metadata.duration - ytDurationMs);
                        
                        // For Odesli, we are a bit stricter since it can be fooled by covers
                        if (metadata.duration === 0 || diff < 10000) { // 10s tolerance
                            const finalData = {
                                ...metadata,
                                targetUrl: odesliResult.targetUrl,
                                imageUrl: metadata.imageUrl || odesliResult.thumbnailUrl
                            };
                            resolutionCache.set(videoURL, { data: finalData, timestamp: Date.now() });
                            return finalData;
                        }
                    } catch (verErr) {
                        console.warn(`[Spotify] Odesli verify failed: ${verErr.message}`);
                    }
                }
        
                // TIER 3: AI Search (Optimized results)
                onProgress('fetching_info', 55, { subStatus: 'Optimizing Search results...' });        const aiPromise = refineSearchWithAI(metadata);
        const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, '').trim();
        const cleanSearchPromise = searchOnYoutube(`${metadata.title} ${cleanArtist}`, cookieArgs, metadata.duration);
        
        const [aiResult, cleanUrl] = await Promise.all([aiPromise, cleanSearchPromise]);
        
        let finalUrl = cleanUrl || (aiResult?.query ? await searchOnYoutube(aiResult.query, cookieArgs, metadata.duration) : null);

        if (!finalUrl) {
            onProgress('fetching_info', 85, { subStatus: 'Deep scan (Last Resort)...' });
            finalUrl = await searchOnYoutube(`${metadata.title} ${metadata.artist} audio`, cookieArgs, metadata.duration);
        }
        
        if (!finalUrl) throw new Error('Could not find matching video.');

        const finalData = {
            ...metadata,
            targetUrl: finalUrl,
            isrc: metadata.isrc || ''
        };
        resolutionCache.set(videoURL, { data: finalData, timestamp: Date.now() });
        return finalData;
        
    } catch (err) {
        console.error('[Spotify] Resolution failed:', err.message);
        throw err;
    }
}

async function searchOnYoutube(query, cookieArgs, targetDurationMs = 0) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    const clientArg = 'youtube:player_client=web_safari,android_vr,tv';

    const baseArgs = [
        ...cookieArgs,
        '--get-id',
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--cache-dir', CACHE_DIR,
    ];

    const searchWithFilter = async (filter = true) => {
        const args = [...baseArgs];
        if (filter && targetDurationMs > 0) {
            const minDur = Math.round(targetDurationMs / 1000) - 30; 
            const maxDur = Math.round(targetDurationMs / 1000) + 30;
            args.push('--match-filter', `duration > ${minDur} & duration < ${maxDur}`);
        }
        args.push(`ytsearch1:${cleanQuery}`);

        const searchProcess = spawn('yt-dlp', args);
        let youtubeId = '';
        await new Promise((resolve) => {
            searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
            searchProcess.on('close', resolve);
        });
        return youtubeId.trim().split('\n')[0];
    };

    console.log(`[YouTube Search] Executing: ${cleanQuery}`);
    let id = await searchWithFilter(true);
    
    // Fallback: If filtered search failed, try without duration filter
    if (!id && targetDurationMs > 0) {
        console.log(`[YouTube Search] No match within duration range, trying broad search...`);
        id = await searchWithFilter(false);
    }

    if (id) {
        console.log(`[YouTube Search] Match Found: ${id}`);
        return `https://www.youtube.com/watch?v=${id}`;
    }
    
    return null;
}

module.exports = { resolveSpotifyToYoutube, fetchIsrcFromDeezer };