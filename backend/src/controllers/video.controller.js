const { downloadCookies } = require("../utils/cookie.util");
const { addClient, removeClient, sendEvent } = require("../utils/sse.util");
const {
  resolveSpotifyToYoutube,
  saveToBrain,
} = require("../services/spotify.service");
const {
  isSupportedUrl,
  isValidSpotifyUrl,
} = require("../utils/validation.util");
const { getTracks, getData } = require("spotify-url-info")(fetch);
const { getVideoInfo, streamDownload } = require("../services/ytdlp.service");
const {
  getBestThumbnail,
  proxyThumbnailIfNeeded,
} = require("../services/social.service");
const {
  detectService,
  getCookieType,
  getSanitizedFilename,
} = require("../utils/video.util");
const {
  prepareFinalResponse,
  prepareBrainResponse,
  setupConvertResponse,
} = require("../utils/response.util");
const { processBackgroundTracks } = require("../services/seeder.service");

exports.streamEvents = (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).end();
  addClient(id, res);
  req.on("close", () => removeClient(id));
};

async function getCookieArgs(videoURL, clientId) {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId)
    sendEvent(clientId, {
      status: "fetching_info",
      progress: 10,
      subStatus: "Bypassing restricted clients...",
      details: "AUTH: BYPASSING_PROTOCOL_RESTRICTIONS",
    });
  return cookiesPath ? ["--cookies", cookiesPath] : [];
}

async function initializeSession(clientId) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: "fetching_info",
    progress: 5,
    subStatus: "Initializing Session...",
    details: "SESSION: STARTING_SECURE_CONTEXT",
  });
  setTimeout(
    () =>
      sendEvent(clientId, {
        status: "fetching_info",
        progress: 7,
        subStatus: "Resolving Host...",
        details: "NETWORK: RESOLVING_CDN_EDGE_NODES",
      }),
    50,
  );
}

async function logExtractionSteps(clientId, serviceName) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: "fetching_info",
    progress: 20,
    subStatus: `Extracting ${serviceName} Metadata...`,
    details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION`,
  });
  sendEvent(clientId, {
    status: "fetching_info",
    progress: 40,
    subStatus: "Analyzing Server-Side Signatures...",
    details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL`,
  });
  sendEvent(clientId, {
    status: "fetching_info",
    progress: 60,
    subStatus: `Verifying ${serviceName} Handshake...`,
    details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS`,
  });
}

exports.getVideoInformation = async (req, res) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  const videoURL = req.query.url;
  const clientId = req.query.id;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: "No valid URL provided" });

  const serviceName = detectService(videoURL);
  await initializeSession(clientId);

  const cookieArgs = await getCookieArgs(videoURL, clientId);
  const isSpotify = videoURL.includes("spotify.com");

  try {
    let targetURL = videoURL;
    let spotifyData = null;

    if (isSpotify) {
      spotifyData = await resolveSpotifyToYoutube(
        videoURL,
        cookieArgs,
        (status, progress, extraData) => {
          if (clientId) sendEvent(clientId, { status, progress, ...extraData });
        },
      );
      targetURL = spotifyData.targetUrl;

      if (spotifyData.fromBrain) {
        handleBrainHit(videoURL, targetURL, spotifyData, cookieArgs, clientId);
        return res.json(prepareBrainResponse(spotifyData));
      }
    } else {
      await logExtractionSteps(clientId, serviceName);
    }

    if (clientId)
      sendEvent(clientId, {
        status: "fetching_info",
        progress: 85,
        subStatus: "Resolving Target Data...",
      });

    const info = await getVideoInfo(targetURL, cookieArgs);
    if (!info.formats)
      return res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        formats: [],
        audioFormats: [],
      });

    const finalResponse = await prepareFinalResponse(
      info,
      isSpotify,
      spotifyData,
      videoURL,
    );

    if (isSpotify && !spotifyData.fromBrain && spotifyData.isIsrcMatch) {
      saveToBrain(videoURL, {
        ...spotifyData,
        cover: finalResponse.cover,
        formats: finalResponse.formats,
        audioFormats: finalResponse.audioFormats,
        targetUrl: targetURL,
      });
    }

    res.json(finalResponse);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch video info" });
  }
};

function handleBrainHit(
  videoURL,
  targetURL,
  spotifyData,
  cookieArgs,
  clientId,
) {
  if (!spotifyData.imageUrl || spotifyData.imageUrl === "/logo.webp") {
    (async () => {
      try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        let finalThumbnail = getBestThumbnail(info);
        finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
        if (clientId)
          sendEvent(clientId, {
            status: "fetching_info",
            metadata_update: {
              cover: finalThumbnail,
              title: spotifyData.title,
              artist: spotifyData.artist,
            },
          });
        saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
      } catch (e) {
      }
    })();
  }
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
  if (targetURL) return targetURL;
  const spotifyData = videoURL.includes("spotify.com")
    ? await resolveSpotifyToYoutube(videoURL, cookieArgs)
    : null;
  return spotifyData ? spotifyData.targetUrl : videoURL;
}

exports.getStreamUrls = async (req, res) => {
  const { url: videoURL, id: clientId, formatId } = req.query;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: "No valid URL provided" });

  try {
    const cookieArgs = await getCookieArgs(videoURL, clientId);
    const resolvedTargetURL = await resolveConvertTarget(
      videoURL,
      req.query.targetUrl,
      cookieArgs,
    );
    const info = await getVideoInfo(resolvedTargetURL, cookieArgs);

    const isDirect = (f) => 
      f.url && 
      f.protocol && 
      !f.protocol.includes("m3u8") && 
      !f.protocol.includes("manifest") &&
      !f.url.includes(".m3u8");

    const availableVideoFormats = info.formats.filter(f => 
      f.vcodec !== "none" && 
      isDirect(f) &&
      f.ext === "mp4" && 
      f.vcodec.startsWith("avc1") &&
      f.height <= 1080
    ).sort((a, b) => b.height - a.height);

    const backupVideoFormats = info.formats.filter(f => 
      f.vcodec !== "none" && 
      isDirect(f) &&
      f.ext === "webm" &&
      f.height <= 1080
    ).sort((a, b) => b.height - a.height);

    const availableAudioFormats = info.formats.filter(f => 
      f.acodec !== "none" && 
      isDirect(f) &&
      f.ext === "m4a"
    ).sort((a, b) => b.abr - a.abr);

    const selectedVideoFormat = availableVideoFormats[0] || backupVideoFormats[0];
    const selectedAudioFormat = availableAudioFormats[0];

    const requestedVideoFormat = info.formats.find(f => 
      f.format_id === formatId && 
      isDirect(f) &&
      f.vcodec !== "none"
    );

    const finalVideoFormat = (requestedVideoFormat && requestedVideoFormat.height <= 1080) ? requestedVideoFormat : selectedVideoFormat;

    const response = {
      videoUrl: finalVideoFormat ? finalVideoFormat.url : null,
      audioUrl: selectedAudioFormat ? selectedAudioFormat.url : null,
      title: info.title,
      uploader: info.uploader,
      filename: getSanitizedFilename(
        info.title,
        info.uploader,
        finalVideoFormat?.ext || "mp4",
        videoURL.includes("spotify.com"),
      ),
    };
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve stream URLs" });
  }
};

const axios = require("axios");
exports.proxyStream = async (req, res) => {
  const streamUrl = req.query.url;
  if (!streamUrl) return res.status(400).end();

  try {
    const response = await axios({
      method: "get",
      url: streamUrl,
      responseType: "stream",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
      },
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", response.headers["content-type"]);
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    response.data.pipe(res);
  } catch (err) {
    res.status(500).end();
  }
};

exports.reportTelemetry = async (req, res) => {
  const { event, data, clientId } = req.body;
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[EME_REPORT] [${timestamp}] [Client:${clientId}] EVENT:${event} | DATA:${JSON.stringify(data)}`);
  res.status(204).end();
};

exports.convertVideo = async (req, res) => {
  if (req.method === "HEAD") return res.status(200).end();
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  const data = { ...req.query, ...req.body };

  if (req.method === "GET" && data.imageUrl && data.imageUrl.length > 2000) {
    data.imageUrl = "";
  }

  const {
    url: videoURL,
    id: clientId = Date.now().toString(),
    format = "mp4",
    formatId,
  } = data;
  if (!videoURL || !isSupportedUrl(videoURL))
    return res.status(400).json({ error: "No valid URL provided" });

  const isSpotifyRequest = videoURL.includes("spotify.com");
  const filename = getSanitizedFilename(
    data.title || "video",
    data.artist,
    format,
    isSpotifyRequest,
  );

  if (clientId)
    sendEvent(clientId, {
      status: "initializing",
      progress: 5,
      subStatus: "Initializing Engine...",
      details: "MUXER: PREPARING_VIRTUAL_CONTAINER",
    });

  (async () => {
    try {
      const cookieArgs = await getCookieArgs(videoURL, clientId);
      const resolvedTargetURL = await resolveConvertTarget(
        videoURL,
        data.targetUrl,
        cookieArgs,
      );

      setupConvertResponse(res, filename, format);
      if (res.flushHeaders) res.flushHeaders();

      let streamURL = data.targetUrl || resolvedTargetURL;
      let info = null;

      if (
        format === "mp3" &&
        (!data.targetUrl || data.targetUrl.includes("youtube.com/watch"))
      ) {
        info = await getVideoInfo(resolvedTargetURL, cookieArgs);
        const audioFormat =
          info.formats.find((f) => f.format_id === formatId) ||
          info.formats
            .filter((f) => f.acodec !== "none")
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
        streamURL = audioFormat.url;
      } else if (formatId || format === "mp3") {
        info = await getVideoInfo(resolvedTargetURL, cookieArgs).catch(
          () => null,
        );
      }

      const videoProcess = streamDownload(
        streamURL,
        { format, formatId },
        cookieArgs,
        info,
      );
      let totalBytesSent = 0;

      videoProcess.stdout.on("data", (chunk) => {
        if (totalBytesSent === 0) {
          if (clientId)
            sendEvent(clientId, {
              status: "downloading",
              progress: 100,
              subStatus: "STREAM ESTABLISHED: Check Downloads",
            });
        }
        totalBytesSent += chunk.length;
      });

      videoProcess.stdout.pipe(res);
      req.on("close", () => {
        if (videoProcess.exitCode === null) videoProcess.kill();
      });
      videoProcess.on("close", (code) => {
        if (code !== 0 && totalBytesSent > 0 && clientId)
          sendEvent(clientId, {
            status: "error",
            message: "Stream interrupted",
          });
        res.end();
      });
    } catch (error) {
      if (clientId)
        sendEvent(clientId, {
          status: "error",
          message: "Internal server error",
        });
      if (!res.headersSent)
        res.status(500).json({ error: "Internal server error" });
    }
  })();
};

exports.seedIntelligence = async (req, res) => {
  const { url, id: clientId = "admin-seeder" } = req.query;
  if (!url || !isValidSpotifyUrl(url))
    return res
      .status(400)
      .json({ error: "Invalid Spotify Artist/Album URL provided" });

  try {
    let tracks = [];
    try {
      tracks = await getTracks(url);
    } catch (e) {}

    if (!tracks || tracks.length === 0) {
      const data = await getData(url);
      if (data && data.tracks)
        tracks = Array.isArray(data.tracks)
          ? data.tracks
          : data.tracks.items || [];
    }

    if (!tracks || tracks.length === 0)
      throw new Error(
        "No tracks found. Ensure it is a valid Spotify Track, Album, or Artist URL.",
      );

    res.json({
      message: "Intelligence Gathering Started in Background",
      trackCount: tracks.length,
      target: url,
    });
    processBackgroundTracks(tracks, clientId).catch((err) =>
      console.error("[Seeder] Background Process Crashed:", err.message),
    );
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};