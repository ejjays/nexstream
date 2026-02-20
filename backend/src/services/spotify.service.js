const {
    spawn
} = require("node:child_process");
const {
    GoogleGenAI
} = require("@google/genai");
const fetch = require("isomorphic-unfetch");
const {
    createClient
} = require("@libsql/client/http");
const {
    getData,
    getDetails
} = require("spotify-url-info")(fetch);
const {
    COMMON_ARGS,
    CACHE_DIR,
    getVideoInfo,
    cacheVideoInfo,
    acquireLock,
    releaseLock
} = require("./ytdlp.service");
const cheerio = require("cheerio");
const axios = require("axios");
const {
    isValidSpotifyUrl,
    extractTrackId
} = require("../utils/validation.util");

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const db = (TURSO_URL && TURSO_TOKEN) ? createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
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
                    formats TEXT,
                    audioFormats TEXT,
                    audioFeatures TEXT,
                    year TEXT,
                    timestamp INTEGER
                )
            `);
            console.log("[Turso] Database initialized.");
        } catch (err) {
            console.error("[Turso] Database bootstrap failed:", err.message);
        }
    })();
}

async function saveToBrain(spotifyUrl, data) {
    if (!db) {
        return;
    }
    try {
        const cleanUrl = spotifyUrl.split("?")[0];
        const args = [
            cleanUrl,
            data.title || "Unknown Title",
            data.artist || "Unknown Artist",
            data.album || "",
            data.imageUrl || data.cover || data.thumbnail || null,
            data.duration || 0,
            data.isrc || null,
            data.previewUrl || null,
            data.targetUrl || data.youtubeUrl || null,
            JSON.stringify(data.formats || []),
            JSON.stringify(data.audioFormats || []),
            JSON.stringify(data.audioFeatures || null),
            data.year || "Unknown",
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
        console.warn("[Turso] Failed to save to database:", err.message);
    }
}

const client = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE" ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
}) : null;

const SOUNDCHARTS_APP_ID = process.env.SOUNDCHARTS_APP_ID;
const SOUNDCHARTS_API_KEY = process.env.SOUNDCHARTS_API_KEY;

const aiCache = new Map();
const soundchartsMetadataCache = new Map();

async function fetchFromSoundcharts(spotifyUrl) {
    try {
        const trackId = extractTrackId(spotifyUrl);
        if (!trackId) {
            return null;
        }

        if (soundchartsMetadataCache.has(trackId)) {
            const cached = soundchartsMetadataCache.get(trackId);
            if (Date.now() - cached.timestamp < 86400000) {
                return cached.data;
            }
        }

        const safeId = trackId.replace(/[^a-zA-Z0-9]/g, "");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(
            `https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/${safeId}`,
            {
                headers: {
                    "x-app-id": SOUNDCHARTS_APP_ID,
                    "x-api-key": SOUNDCHARTS_API_KEY
                },

                signal: controller.signal
            }
        );
        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        if (!data?.object) {
            return null;
        }

        const obj = data.object;
        const result = {
            title: obj.name,
            artist: obj.artists?.[0]?.name || "Unknown Artist",
            album: obj.labels?.[0]?.name || "",
            imageUrl: obj.imageUrl,
            duration: (obj.duration || 0) * 1000,
            isrc: obj.isrc?.value || "",
            audioFeatures: obj.audio || null,
            year: obj.releaseDate ? obj.releaseDate.split("-")[0] : "Unknown",
            previewUrl: obj.previewUrl || obj.audioPreviewUrl || obj.spotify?.previewUrl || obj.preview_url || null,
            source: "soundcharts"
        };

        soundchartsMetadataCache.set(trackId, {
            data: result,
            timestamp: Date.now()
        });
        return result;
    } catch (err) {
        return null;
    }
}

async function fetchFromScrapers(videoURL) {
    const trackId = extractTrackId(videoURL);
    if (!trackId) {
        return null;
    }
    const safeUrl = `https://open.spotify.com/track/${trackId}`;

    try {
        let details = null;
        try {
            details = await getData(safeUrl);
        } catch (e) {}
        if (!details) {
            try {
                details = await getDetails(safeUrl);
            } catch (e) {}
        }
        if (!details) {
            try {
                const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(safeUrl)}`);
                const oembedData = await oembedRes.json();
                if (oembedData) {
                    details = {
                        name: oembedData.title,

                        artists: [{
                            name: "Unknown Artist"
                        }]
                    };
                }
            } catch (e) {}
        }
        if (!details) {
            return null;
        }

        return {
            title: details.name || details.preview?.title || details.title || "Unknown Title",
            artist: (details.artists && details.artists[0]?.name) || details.preview?.artist || details.artist || "Unknown Artist",
            album: (details.album && details.album.name) || details.preview?.album || details.album || "",
            imageUrl: (details.visualIdentity?.image && details.visualIdentity.image[details.visualIdentity.image.length - 1]?.url) || (details.coverArt?.sources && details.coverArt.sources[details.coverArt.sources.length - 1]?.url) || details.preview?.image || details.image || details.thumbnail_url || "",
            duration: details.duration_ms || details.duration || details.preview?.duration_ms || 0,
            year: (typeof details.releaseDate === "string" && details.releaseDate.split("-")[0]) || (typeof details.release_date === "string" && details.release_date.split("-")[0]) || "Unknown",
            isrc: details.external_ids?.isrc || details.isrc || details.preview?.isrc || "",
            previewUrl: details.preview_url || details.audio_preview_url || details.preview?.audio_url || (details.tracks && details.tracks[0]?.preview_url) || null,
            source: "scrapers"
        };
    } catch (err) {
        return null;
    }
}

const resolutionCache = new Map();
const RESOLUTION_EXPIRY = 15000;

let isGemini3Blocked = false;
let gemini3BlockTime = 0;
const BLOCK_DURATION = 3600000;

async function fetchSpotifyPageData(videoURL) {
    const trackId = extractTrackId(videoURL);
    if (!trackId) {
        return null;
    }
    try {
        const {
            data
        } = await axios.get(`https://open.spotify.com/track/${trackId}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const $ = cheerio.load(data);
        return {
            cover: $("meta[property=\"og:image\"]").attr("content")
        };
    } catch (e) {
        return null;
    }
}

async function fetchPreviewUrlManually(videoURL) {
    try {
        const trackId = extractTrackId(videoURL);
        if (!trackId) {
            return null;
        }
        const {
            data
        } = await axios.get(
            `https://open.spotify.com/embed/track/${trackId.replace(/[^a-zA-Z0-9]/g, "")}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            }
        );
        const $ = cheerio.load(data);
        const scriptContent = $("script[id=\"resource\"]").html();
        if (scriptContent) {
            const json = JSON.parse(decodeURIComponent(scriptContent));
            if (json.preview_url) {
                return json.preview_url;
            }
        }
        const match = data.match(/"preview_url":"(https:[^"]+)"/);
        return match?.[1]?.replace(/\\/g, "/") || null;
    } catch (err) {
        return null;
    }
}

async function searchDeezer(query) {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
    return res.json();
}

async function fetchIsrcFromDeezer(title, artist, isrc = null, targetDurationMs = 0) {
    try {
        if (isrc) {
            const res = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
            const data = await res.json();
            if (data && !data.error && data.preview) {
                return {
                    isrc: data.isrc || isrc,
                    preview: data.preview
                };
            }
        }
        let searchData = await searchDeezer(`artist:"${artist}" track:"${title}"`);
        if (!searchData.data?.length) {
            searchData = await searchDeezer(`${title} ${artist}`);
        }
        const cleanTitle = title.replace(/\s*[\[(].*?[\)\]]/g, "").trim();
        if (!searchData.data?.length && cleanTitle !== title) {
            searchData = await searchDeezer(`${cleanTitle} ${artist}`);
        }
        if (searchData.data?.length) {
            const best = searchData.data.find(t => {
                const artistMatch = t.artist.name.toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(t.artist.name.toLowerCase());
                const durationMatch = targetDurationMs > 0 ? Math.abs((t.duration * 1000) - targetDurationMs) < 5000 : true;
                return artistMatch && durationMatch;
            }) || searchData.data[0];
            if (targetDurationMs > 0 && Math.abs((best.duration * 1000) - targetDurationMs) > 10000) {
                return null;
            }
            const detailRes = await fetch(`https://api.deezer.com/track/${best.id}`);
            const detailData = await detailRes.json();
            return {
                isrc: detailData.isrc || null,
                preview: best.preview || null
            };
        }
    } catch (err) {}
    return null;
}

async function fetchIsrcFromItunes(title, artist, isrc = null, targetDurationMs = 0) {
    try {
        const query = isrc || `${title} ${artist}`;
        const res = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=song`
        );
        const data = await res.json();
        if (data.results?.length) {
            const best = targetDurationMs > 0 ? data.results.sort(
                (a, b) => Math.abs(a.trackTimeMillis - targetDurationMs) - Math.abs(b.trackTimeMillis - targetDurationMs)
            )[0] : data.results[0];
            if (targetDurationMs > 0 && Math.abs(best.trackTimeMillis - targetDurationMs) > 10000) {
                return null;
            }
            return {
                isrc: best.isrc || null,
                preview: best.previewUrl || null
            };
        }
    } catch (err) {}
    return null;
}

async function queryGroq(promptText) {
    if (!process.env.GROQ_API_KEY) {
        return null;
    }
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",

            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",

                messages: [{
                    role: "user",
                    content: promptText
                }],

                response_format: {
                    type: "json_object"
                }
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
    if (!client) {
        return null;
    }
    let modelsToTry = [
        "gemini-3-flash-preview",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-latest"
    ];
    if (isGemini3Blocked && (Date.now() - gemini3BlockTime < BLOCK_DURATION)) {
        modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.0-flash-latest"];
    } else {
        isGemini3Blocked = false;
    }
    for (const modelName of modelsToTry) {
        try {
            const response = await client.models.generateContent({
                model: modelName,

                contents: [{
                    role: "user",

                    parts: [{
                        text: promptText
                    }]
                }]
            });
            const text = (response.text || (typeof response.text === "function" ? response.text() : "") || "").trim().replace(/```json|```/g, "");
            if (text) {
                return JSON.parse(text);
            }
        } catch (error) {
            if (error.message.includes("429") && modelName.includes("gemini-3")) {
                isGemini3Blocked = true;gemini3BlockTime = Date.now();
            }
        }
    }
    return null;
}

async function refineSearchWithAI(metadata) {
    const cacheKey = `${metadata.title}-${metadata.artist}`.toLowerCase();
    if (aiCache.has(cacheKey)) {
        return aiCache.get(cacheKey);
    }
    const promptText = `Act as a Professional Music Query Architect.
        DATA: Title: "${metadata.title}", Artist: "${metadata.artist}", Album: "${metadata.album}", Year: "${metadata.year}", VERIFIED_ISRC: "${metadata.isrc || "NONE"}", Duration: ${Math.round(metadata.duration / 1000)}s
        TASK: Create a high-precision YouTube search query. Include ISRC if provided. RETURN JSON ONLY: {"query": "Artist Title [ISRC] Topic", "confidence": 100}`;
    const result = (await queryGroq(promptText)) || (await queryGemini(promptText));
    if (result) {
        aiCache.set(cacheKey, result);
    }
    return result || {
        query: null,
        confidence: 0
    };
}

async function fetchFromOdesli(spotifyUrl) {
    if (!isValidSpotifyUrl(spotifyUrl)) {
        return null;
    }
    try {
        const parsed = new URL(spotifyUrl);
        const res = await fetch(
            `https://api.odesli.co/v1-alpha.1/links?url=${encodeURIComponent(`${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`)}`
        );
        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        const youtubeLink = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;
        if (!youtubeLink) {
            return null;
        }
        const entity = data.entitiesByUniqueId[data.linksByPlatform?.youtube?.entityUniqueId || data.linksByPlatform?.youtubeMusic?.entityUniqueId];
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

async function searchOnYoutube(
    query,
    cookieArgs,
    targetMetadata,
    onEarlyDispatch = null,
    skipPlayerOptimization = false,
    signal = null
) {
    const cleanQuery = query.replace(/on Spotify/g, "").replace(/-/g, " ").trim();
    const targetDurationMs = targetMetadata?.duration || 0;
    const optimizationArgs = skipPlayerOptimization ? "youtube:player_client=web_safari,android_vr,tv" : "youtube:player_client=web_safari,android_vr,tv;player_skip=configs,webpage,js-variables";
    const args = [
        ...cookieArgs,
        "--dump-json",
        "--quiet",
        "--no-playlist",
        ...COMMON_ARGS,
        "--extractor-args",
        optimizationArgs,
        "--cache-dir",
        CACHE_DIR,
        `ytsearch1:${cleanQuery}`
    ];

    await acquireLock(1); // Take full lock
    return new Promise(resolve => {
        const searchProcess = spawn("yt-dlp", args);

        if (signal) {
            signal.addEventListener("abort", () => {
                if (searchProcess.exitCode === null)
                    searchProcess.kill("SIGKILL");
                resolve(null);
            });
        }

        let output = "";
        searchProcess.stdout.on("data", data => {
            output += data.toString();
        });
        searchProcess.on("close", code => {
            releaseLock(1);
            if (code !== 0 || !output) {
                if (query.includes("US") || query.includes("PH")) {
                    console.log(`[Quantum Race] ISRC Search yielded 0 results.`);
                }return resolve(null);
            }
            try {
                const info = JSON.parse(output);
                const drift = targetDurationMs > 0 ? Math.abs((info.duration * 1000) - targetDurationMs) : 0;
                if (targetDurationMs > 0 && drift > 8000) {
                    console.log(
                        `[Quantum Race] Internal Reject: "${info.title}" drift is ${(drift / 1000).toFixed(1)}s`
                    );return resolve(null);
                }
                if (onEarlyDispatch) {
                    onEarlyDispatch({
                        title: targetMetadata.title,
                        artist: targetMetadata.artist,
                        cover: targetMetadata.imageUrl
                    });
                }
                if (query.includes("US") || query.includes("PH")) {
                    console.log(
                        `[Quantum Race] ISRC Search SUCCESS: "${info.title}" (Drift: ${(drift / 1000).toFixed(1)}s)`
                    );
                }
                cacheVideoInfo(info.webpage_url, info, cookieArgs);
                resolve({
                    url: info.webpage_url,
                    info,
                    diff: drift
                });
            } catch (e) {
                resolve(null);
            }
        });
    });
}

const calculateWaitTime = (hasP0, isPerfect, priority) => {
    if (hasP0) {
        return 15000;
    }
    if (isPerfect) {
        return 2000;
    }
    return priority === 2 ? 3000 : 1500;
};

async function priorityRace(candidates, metadata, onProgress, getElapsed, settleCallback = () => {}) {
    return new Promise(resolve => {
        let bestMatch = null, graceTimer = null, finishedCount = 0, isSettled = false;
        const settle = (match, reason = "") => {
            if (!isSettled) {
                isSettled = true;
                settleCallback(reason);
                if (graceTimer) {
                    clearTimeout(graceTimer);
                }
                resolve(match);
            }
        };

        const processResult = (result, c) => {
            if (isSettled) {
                return;
            }
            finishedCount++;
            if (!result) {
                if (finishedCount === candidates.length) {
                    settle(bestMatch, "All finished");
                }return;
            }
            const isGoodMatch = metadata.duration > 0 ? (result.diff < 8000) : true;
            if (!isGoodMatch) {
                console.log(
                    `[Quantum Race] Engine ${c.type} rejected: Drift too high (${(result.diff / 1000).toFixed(1)}s)`
                );
                if (finishedCount === candidates.length) {
                    settle(bestMatch, "All finished");
                }return;
            }
            console.log(`[Quantum Race] [+${getElapsed()}s] Early Dispatch: "${metadata.title}"`);
            onProgress("fetching_info", 85, {
                subStatus: "Mapping Authoritative Stream...",
                details: `PRE_SYNC: ${c.type}_ENGINE_MATCH_FOUND`,

                metadata_update: {
                    title: metadata.title,
                    artist: metadata.artist,
                    cover: metadata.imageUrl,
                    thumbnail: metadata.imageUrl
                }
            });

            if (result.diff < 2000) {
                settle({
                    ...result,
                    type: c.type,
                    priority: c.priority
                }, `${c.type} (Perfect Match)`);
                return;
            }

            if (c.priority === 0) {
                settle({
                    ...result,
                    type: c.type,
                    priority: c.priority
                }, `${c.type} (P0) match`);
            } else if (!bestMatch || c.priority < bestMatch.priority || (c.priority === bestMatch.priority && result.diff < bestMatch.diff)) {
                bestMatch = {
                    ...result,
                    type: c.type,
                    priority: c.priority
                };
                const waitTime = calculateWaitTime(
                    candidates.some(cand => cand.priority === 0),
                    metadata.duration > 0 && result.diff < 2000,
                    c.priority
                );
                if (graceTimer) {
                    clearTimeout(graceTimer);
                }
                graceTimer = setTimeout(() => settle(bestMatch, "Grace expired"), waitTime);
            }
            if (finishedCount === candidates.length) {
                settle(bestMatch, "All finished");
            }
        };

        candidates.forEach(c => {
            c.promise.then(result => processResult(result, c)).catch(err => {
                if (!isSettled) {
                    finishedCount++;
                    console.warn(`[Quantum Race] Engine ${c.type} error: ${err.message}`);
                    if (finishedCount === candidates.length) {
                        settle(bestMatch, "Consensus reached");
                    }
                }
            });
        });
    });
}

async function refreshPreviewIfNeeded(cleanUrl, brainData) {
    try {
        let fresh = await fetchPreviewUrlManually(cleanUrl);
        if (!fresh) {
            const dData = await fetchIsrcFromDeezer(brainData.title, brainData.artist, brainData.isrc, brainData.duration);
            fresh = dData?.preview;
        }
        if (!fresh) {
            const iData = await fetchIsrcFromItunes(brainData.title, brainData.artist, brainData.isrc, brainData.duration);
            fresh = iData?.preview;
        }
        if (fresh) {
            brainData.previewUrl = fresh;
        }
    } catch (error) {}
}

async function checkBrainCache(cleanUrl, onProgress) {
    if (!db) {
        return null;
    }
    try {
        const result = await db.execute({
            sql: "SELECT * FROM spotify_mappings WHERE url = ?",
            args: [cleanUrl]
        });
        if (!result.rows?.length) {
            return null;
        }
        const row = result.rows[0];
        const brainData = {
            ...row,
            imageUrl: row.imageUrl || "/logo.webp",
            formats: JSON.parse(row.formats || "[]"),
            audioFormats: JSON.parse(row.audioFormats || "[]"),
            audioFeatures: JSON.parse(row.audioFeatures || "null"),
            targetUrl: row.youtubeUrl,
            fromBrain: true
        };
        if (brainData.formats?.length) {
            onProgress("fetching_info", 95, {
                subStatus: "Synchronizing with Global Registry...",
                details: `REGISTRY_HIT: ${brainData.isrc || "LOCAL_CACHE"}`,

                metadata_update: {
                    title: brainData.title,
                    artist: brainData.artist,
                    cover: brainData.imageUrl,
                    thumbnail: brainData.imageUrl,
                    duration: brainData.duration / 1000,
                    previewUrl: brainData.previewUrl,
                    formats: brainData.formats,
                    audioFormats: brainData.audioFormats,
                    isFullData: true
                }
            });
            await refreshPreviewIfNeeded(cleanUrl, brainData);
            return brainData;
        }
    } catch (err) {}
    return null;
}

async function fetchInitialMetadata(videoURL, onProgress, startTime) {
    onProgress("fetching_info", 10, {
        subStatus: "Fetching metadata...",
        details: "METADATA: INITIATING_MULTI_SOURCE_SCAN"
    });
    const soundchartsPromise = fetchFromSoundcharts(videoURL).catch(e => {
        console.error("[Metadata] Soundcharts failed:", e.message);return null;
    });
    const scrapersPromise = fetchFromScrapers(videoURL).then(res => {
        if (res?.previewUrl && onProgress) {
            console.log(
                `[Quantum Race] [+${((Date.now() - startTime) / 1000).toFixed(1)}s] Scraper found Preview URL. Dispatching...`
            );
            onProgress("fetching_info", 20, {
                metadata_update: {
                    previewUrl: res.previewUrl
                }
            });
        }
        return res;
    }).catch(e => {
        console.error("[Metadata] Scrapers failed:", e.message);return null;
    });
    const firstMetadata = await Promise.any([
        soundchartsPromise.then(res => res || Promise.reject(new Error("No Soundcharts"))),
        scrapersPromise.then(res => res || Promise.reject(new Error("No Scrapers")))
    ]).catch(() => null);
    if (!firstMetadata) {
        throw new Error("Metadata fetch failed: All providers returned null");
    }
    console.log(
        `[Quantum Race] [+${((Date.now() - startTime) / 1000).toFixed(1)}s] Metadata Locked & Dispatched.`
    );
    onProgress("fetching_info", 20, {
        subStatus: "Metadata locked.",
        details: `IDENTITY: "${firstMetadata.title.toUpperCase()}"`,

        metadata_update: {
            title: firstMetadata.title,
            artist: firstMetadata.artist,
            cover: firstMetadata.imageUrl,
            thumbnail: firstMetadata.imageUrl,
            duration: firstMetadata.duration / 1000,
            previewUrl: firstMetadata.previewUrl
        }
    });
    return {
        metadata: {
            ...firstMetadata
        },

        soundchartsPromise
    };
}

async function resolveSideTasks(videoURL, metadata) {
    try {
        const res = await fetchSpotifyPageData(videoURL);
        if (res?.cover) {
            metadata.imageUrl = res.cover;
        }
    } catch (e) {}
}

function checkIsrcMatchSwitch(bestMatch, isrcMatch, threshold = 2000) {
    if (!isrcMatch) {
        return bestMatch;
    }
    if (bestMatch?.type !== "ISRC" && bestMatch?.type !== "Soundcharts" && isrcMatch.diff <= threshold) {
        return {
            ...isrcMatch,
            type: "ISRC",
            priority: 0
        };
    }
    return bestMatch;
}

async function runPriorityRace(videoURL, metadata, cookieArgs, onProgress, soundchartsPromise = null) {
    const startTime = Date.now(), getElapsed = () => ((Date.now() - startTime) / 1000).toFixed(1), candidates = [];
    const raceController = new AbortController();
    const {
        signal
    } = raceController;

    let raceSettled = false;
    const safeProgress = (status, progress, extra) => {
        if (!raceSettled) {
            onProgress(status, progress, extra);
        }
    };

    console.log(
        `[Quantum Race] [+${getElapsed()}s] Starting staggered engines (ISRC prioritized)...`
    );
    onProgress("fetching_info", 25, {
        subStatus: "Staging Multi-Source Search...",
        details: "THREADS: ISRC_FIRST_STRATEGY_ACTIVE"
    });

    const isrcPromise = (async () => {
        if (raceSettled)
            return null;

        let isrc = metadata.isrc || (soundchartsPromise ? (await soundchartsPromise)?.isrc : null);

        if (!isrc || !metadata.previewUrl) {
            const [dData, iData] = await Promise.all([
                fetchIsrcFromDeezer(metadata.title, metadata.artist, isrc || metadata.isrc, metadata.duration),
                fetchIsrcFromItunes(metadata.title, metadata.artist, isrc || metadata.isrc, metadata.duration)
            ]);
            const newPreview = dData?.preview || iData?.preview;
            if (newPreview && !metadata.previewUrl) {
                onProgress("fetching_info", 25, {
                    metadata_update: {
                        previewUrl: newPreview
                    }
                });
                metadata.previewUrl = newPreview;
            }
            if (!isrc)
                isrc = dData?.isrc || iData?.isrc;
        }

        if (!isrc || raceSettled) {
            return null;
        }
        safeProgress("fetching_info", 40, {
            details: `ISRC_IDENTIFIED: ${isrc}`
        });
        return searchOnYoutube(
            `"${isrc}"`,
            cookieArgs,
            metadata,
            early => safeProgress("fetching_info", 45, {
                metadata_update: {
                    ...early,
                    cover: metadata.imageUrl
                }
            }),
            true,
            signal
        );
    })();
    candidates.push({
        type: "ISRC",
        priority: 0,
        promise: isrcPromise
    });

    const odesliPromise = (async () => {
        await new Promise(r => setTimeout(r, 1500));
        if (!videoURL || raceSettled)
            return null;

        const res = await fetchFromOdesli(videoURL);
        if (!res || raceSettled)
            return null;

        safeProgress("fetching_info", 30, {
            details: "LINKER: CONSULTING_ODESLI_AGGREGATOR",

            metadata_update: {
                title: metadata.title,
                artist: metadata.artist,
                cover: metadata.imageUrl || res.thumbnailUrl
            }
        });
        const info = await getVideoInfo(res.targetUrl, cookieArgs, false, signal);
        const drift = Math.abs((info.duration * 1000) - metadata.duration);
        return {
            url: res.targetUrl,
            info,
            diff: drift
        };
    })();
    candidates.push({
        type: "Odesli",
        priority: 1,
        promise: odesliPromise
    });

    const aiPromise = (async () => {
        await new Promise(r => setTimeout(r, 6000));
        if (raceSettled)
            return null;

        const ai = await refineSearchWithAI(metadata);
        if (!ai?.query || raceSettled) {
            return null;
        }
        safeProgress("fetching_info", 50, {
            details: "SEMANTIC_ENGINE: SYNTHESIZING_SEARCH_VECTORS"
        });
        return searchOnYoutube(
            ai.query,
            cookieArgs,
            metadata,
            early => safeProgress("fetching_info", 50, {
                metadata_update: {
                    ...early,
                    cover: metadata.imageUrl
                }
            }),
            false,
            signal
        );
    })();
    candidates.push({
        type: "AI",
        priority: 2,
        promise: aiPromise
    });

    const cleanArtist = metadata.artist.replace(/\s+(Music|Band|Official|Topic|TV)\s*$/i, "").trim();
    const cleanPromise = (async () => {
        if (!cleanArtist || cleanArtist.toLowerCase() === "unknown artist")
            return null;
        await new Promise(r => setTimeout(r, 8500));
        if (raceSettled)
            return null;

        return searchOnYoutube(
            `${metadata.title} ${cleanArtist}`,
            cookieArgs,
            metadata,
            early => safeProgress("fetching_info", 55, {
                metadata_update: {
                    ...early,
                    cover: metadata.imageUrl
                }
            }),
            false,
            signal
        ).then(res => {
            if (res && !raceSettled) {
                safeProgress("fetching_info", 55, {
                    details: "ENGINE: BROAD_SPECTRUM_MATCH"
                });
            }
            return res;
        });
    })();
    if (cleanArtist) candidates.push({
        type: "Clean",
        priority: 2,
        promise: cleanPromise
    });

    const raceTimeout = setTimeout(() => {
        if (!raceSettled)
            raceController.abort("timeout");
    }, 45000);

    try {
        const bestMatch = await priorityRace(candidates, metadata, onProgress, getElapsed, reason => {
            raceSettled = true;
            raceController.abort("settled");
            clearTimeout(raceTimeout);
            console.log(`[Quantum Race] [+${getElapsed()}s] SETTLED: ${reason.toUpperCase()}`);
            onProgress("fetching_info", 80, {
                subStatus: "Race Completed.",
                details: `SETTLED: ${reason.toUpperCase().split(" ")[0]}`
            });
        });

        const [isrcResult] = await Promise.all([isrcPromise, resolveSideTasks(videoURL, metadata)]);
        return checkIsrcMatchSwitch(bestMatch, isrcResult);
    } catch (err) {
        raceSettled = true;
        raceController.abort("error");
        clearTimeout(raceTimeout);
        console.warn(`[Quantum Race] Safety override triggered: ${err.message}`);
        throw new Error("Search timed out or failed. Please try again.");
    }
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = [], onProgress = () => {}) {
    if (!videoURL.includes("spotify.com")) {
        return {
            targetUrl: videoURL
        };
    }
    if (!videoURL.includes("/track/")) {
        throw new Error("Only direct Spotify track links supported.");
    }
    const startTime = Date.now(), getLocalElapsed = () => ((Date.now() - startTime) / 1000).toFixed(1), cleanUrl = videoURL.split("?")[0];
    const cachedBrainData = await checkBrainCache(cleanUrl, onProgress);
    if (cachedBrainData) {
        return cachedBrainData;
    }
    if (resolutionCache.has(videoURL)) {
        const cached = resolutionCache.get(videoURL);
        if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
            onProgress("fetching_info", 90, {
                subStatus: "Found in local cache."
            });return cached.data;
        }
    }
    try {
        const {
            metadata,
            soundchartsPromise
        } = await fetchInitialMetadata(videoURL, onProgress, startTime);

        fetchPreviewUrlManually(videoURL).then(previewUrl => {
            if (previewUrl) {
                console.log(`[Quantum Race] [+${getLocalElapsed()}s] Early Preview Identified.`);
                onProgress("fetching_info", 20, {
                    metadata_update: {
                        previewUrl
                    }
                });
                metadata.previewUrl = previewUrl;
            }
        }).catch(() => {});

        const bestMatch = await runPriorityRace(videoURL, metadata, cookieArgs, onProgress, soundchartsPromise);
        if (!bestMatch?.url) {
            throw new Error("No match found.");
        }
        const finalData = {
            ...metadata,
            targetUrl: bestMatch.url,
            isIsrcMatch: !!(bestMatch.type === "ISRC" || bestMatch.type === "Soundcharts"),
            previewUrl: metadata.previewUrl
        };
        resolutionCache.set(videoURL, {
            data: finalData,
            timestamp: Date.now()
        });
        return finalData;
    } catch (err) {
        throw err;
    }
}

module.exports = {
    resolveSpotifyToYoutube,
    fetchIsrcFromDeezer,
    saveToBrain
};
