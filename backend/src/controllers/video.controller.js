const { downloadCookies } = require("../utils/cookie.util");
const { addClient, removeClient, sendEvent } = require("../utils/sse.util");
const { resolveSpotifyToYoutube, saveToBrain } = require("../services/spotify.service");
const { isSupportedUrl, isValidSpotifyUrl } = require("../utils/validation.util");
const { getTracks, getData } = require("spotify-url-info")(fetch);
const { getVideoInfo, streamDownload } = require("../services/ytdlp.service");
const { getBestThumbnail, proxyThumbnailIfNeeded } = require("../services/social.service");
const { detectService, getCookieType, getSanitizedFilename } = require("../utils/video.util");
const { prepareFinalResponse, prepareBrainResponse, setupConvertResponse } = require("../utils/response.util");
const { processBackgroundTracks } = require("../services/seeder.service");

exports.streamEvents = (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).end();
    addClient(id, res);
    console.log(`[SSE] Client Synchronized: ${id}`);
    req.on("close", () => removeClient(id));
};

async function getCookieArgs(videoURL, clientId) {
    const cookieType = getCookieType(videoURL);
    const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
    if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 10, subStatus: "Bypassing restricted clients...", details: "AUTH: BYPASSING_PROTOCOL_RESTRICTIONS" });
    return cookiesPath ? ["--cookies", cookiesPath] : [];
}

async function initializeSession(clientId) {
    if (!clientId) return;
    sendEvent(clientId, { status: "fetching_info", progress: 5, subStatus: "Initializing Session...", details: "SESSION: STARTING_SECURE_CONTEXT" });
    setTimeout(() => sendEvent(clientId, { status: "fetching_info", progress: 7, subStatus: "Resolving Host...", details: "NETWORK: RESOLVING_CDN_EDGE_NODES" }), 50);
}

async function logExtractionSteps(clientId, serviceName) {
    if (!clientId) return;
    sendEvent(clientId, { status: "fetching_info", progress: 20, subStatus: `Extracting ${serviceName} Metadata...`, details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION` });
    sendEvent(clientId, { status: "fetching_info", progress: 40, subStatus: "Analyzing Server-Side Signatures...", details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL` });
    sendEvent(clientId, { status: "fetching_info", progress: 60, subStatus: `Verifying ${serviceName} Handshake...`, details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS` });
}

exports.getVideoInformation = async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const videoURL = req.query.url;
    const clientId = req.query.id;
    if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: "No valid URL provided" });

    const serviceName = detectService(videoURL);
    await initializeSession(clientId);

    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const isSpotify = videoURL.includes("spotify.com");

    try {
        let targetURL = videoURL;
        let spotifyData = null;

        if (isSpotify) {
            spotifyData = await resolveSpotifyToYoutube(videoURL, cookieArgs, (status, progress, extraData) => {
                if (clientId) sendEvent(clientId, { status, progress, ...extraData });
            });
            targetURL = spotifyData.targetUrl;

            if (spotifyData.fromBrain) {
                handleBrainHit(videoURL, targetURL, spotifyData, cookieArgs, clientId);
                return res.json(prepareBrainResponse(spotifyData));
            }
        } else {
            await logExtractionSteps(clientId, serviceName);
        }

        console.log(`[Info] Target URL: ${targetURL}`);
        if (clientId) sendEvent(clientId, { status: "fetching_info", progress: 85, subStatus: "Resolving Target Data..." });

        const info = await getVideoInfo(targetURL, cookieArgs);
        if (!info.formats) return res.json({ title: info.title, thumbnail: info.thumbnail, formats: [], audioFormats: [] });

        const finalResponse = await prepareFinalResponse(info, isSpotify, spotifyData, videoURL);

        if (isSpotify && !spotifyData.fromBrain && spotifyData.isIsrcMatch) {
            saveToBrain(videoURL, { ...spotifyData, cover: finalResponse.cover, formats: finalResponse.formats, audioFormats: finalResponse.audioFormats, targetUrl: targetURL });
        }

        res.json(finalResponse);
    } catch (err) {
        console.error("Info error:", err);
        res.status(500).json({ error: "Failed to fetch video info" });
    }
};

function handleBrainHit(videoURL, targetURL, spotifyData, cookieArgs, clientId) {
    console.log(`[Super Brain] Hit: ${spotifyData.title}`);
    if (!spotifyData.imageUrl || spotifyData.imageUrl === "/logo.webp") {
        console.log(`[Super Brain] Healing missing image for: ${spotifyData.title}`);
        (async () => {
            try {
                const info = await getVideoInfo(targetURL, cookieArgs);
                let finalThumbnail = getBestThumbnail(info);
                finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
                if (clientId) sendEvent(clientId, { status: "fetching_info", metadata_update: { cover: finalThumbnail, title: spotifyData.title, artist: spotifyData.artist } });
                saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
            } catch (e) {
                console.error("[Healing] Failed:", e.message);
            }
        })();
    }
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
    if (targetURL) return targetURL;
    const spotifyData = videoURL.includes("spotify.com") ? await resolveSpotifyToYoutube(videoURL, cookieArgs) : null;
    return spotifyData ? spotifyData.targetUrl : videoURL;
}

exports.convertVideo = async (req, res) => {
    if (req.method === "HEAD") return res.status(200).end();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const data = { ...req.query, ...req.body };

    if (req.method === "GET" && data.imageUrl && data.imageUrl.length > 2000) {
        console.warn("[Convert] Stripping massive base64 imageUrl from GET request for safety");
        data.imageUrl = "";
    }

    const { url: videoURL, id: clientId = Date.now().toString(), format = "mp4", formatId } = data;
    if (!videoURL || !isSupportedUrl(videoURL)) return res.status(400).json({ error: "No valid URL provided" });

    const isSpotifyRequest = videoURL.includes("spotify.com");
    const filename = getSanitizedFilename(data.title || "video", data.artist, format, isSpotifyRequest);

    console.log(`[Convert] Starting "${format.toUpperCase()}" conversion: "${filename}"`);

    if (clientId) sendEvent(clientId, { status: "initializing", progress: 5, subStatus: "Initializing Engine...", details: "MUXER: PREPARING_VIRTUAL_CONTAINER" });

    (async () => {
        try {
            const cookieArgs = await getCookieArgs(videoURL, clientId);
            const resolvedTargetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);

            setupConvertResponse(res, filename, format);
            if (res.flushHeaders) res.flushHeaders();

            let streamURL = data.targetUrl || resolvedTargetURL;
            let info = null;

            if (format === "mp3" && (!data.targetUrl || data.targetUrl.includes("youtube.com/watch"))) {
                info = await getVideoInfo(resolvedTargetURL, cookieArgs);
                const audioFormat = info.formats.find(f => f.format_id === formatId) || info.formats.filter(f => f.acodec !== "none").sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
                streamURL = audioFormat.url;
            } else if (formatId || format === "mp3") {
                info = await getVideoInfo(resolvedTargetURL, cookieArgs).catch(() => null);
            }

            const videoProcess = streamDownload(streamURL, { format, formatId }, cookieArgs, info);
            let totalBytesSent = 0;

            videoProcess.stdout.on("data", chunk => {
                if (totalBytesSent === 0) {
                    console.log(`[Stream] Established: Sending data for "${filename}"`);
                    if (clientId) sendEvent(clientId, { status: "downloading", progress: 100, subStatus: "STREAM ESTABLISHED: Check Downloads" });
                }
                totalBytesSent += chunk.length;
            });

            videoProcess.stdout.pipe(res);
            req.on("close", () => { if (videoProcess.exitCode === null) videoProcess.kill(); });
            videoProcess.on("close", code => {
                console.log(`[Stream] Closed with code ${code}. Total bytes sent: ${totalBytesSent}`);
                if (code !== 0 && totalBytesSent > 0 && clientId) sendEvent(clientId, { status: "error", message: "Stream interrupted" });
                res.end();
            });
        } catch (error) {
            console.error("[Convert] Error:", error);
            if (clientId) sendEvent(clientId, { status: "error", message: "Internal server error" });
            if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
        }
    })();
};

exports.seedIntelligence = async (req, res) => {
    const { url, id: clientId = "admin-seeder" } = req.query;
    if (!url || !isValidSpotifyUrl(url)) return res.status(400).json({ error: "Invalid Spotify Artist/Album URL provided" });

    console.log(`[Seeder] Initializing Intelligence Gathering for: ${url}`);

    try {
        let tracks = [];
        try { tracks = await getTracks(url); } catch (e) {}

        if (!tracks || tracks.length === 0) {
            const data = await getData(url);
            if (data && data.tracks) tracks = Array.isArray(data.tracks) ? data.tracks : (data.tracks.items || []);
        }

        if (!tracks || tracks.length === 0) throw new Error("No tracks found. Ensure it is a valid Spotify Track, Album, or Artist URL.");

        res.json({ message: "Intelligence Gathering Started in Background", trackCount: tracks.length, target: url });
        processBackgroundTracks(tracks, clientId).catch(err => console.error("[Seeder] Background Process Crashed:", err.message));
    } catch (err) {
        console.error("[Seeder] FATAL:", err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};