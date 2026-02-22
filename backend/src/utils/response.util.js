const { processVideoFormats, processAudioFormats } = require("./format.util");
const { normalizeTitle, getBestThumbnail, proxyThumbnailIfNeeded } = require("../services/social.service");

async function prepareFinalResponse(info, isSpotify, spotifyData, videoURL) {
    const finalTitle = normalizeTitle(info);
    let finalThumbnail = getBestThumbnail(info);
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);

    if (isSpotify && spotifyData?.imageUrl) {
        spotifyData.imageUrl = await proxyThumbnailIfNeeded(spotifyData.imageUrl, videoURL);
    }

    return {
        title: isSpotify ? spotifyData.title : finalTitle,
        artist: isSpotify ? spotifyData.artist : info.uploader || "",
        album: isSpotify ? spotifyData.album : "",
        cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
        thumbnail: isSpotify ? spotifyData.imageUrl : finalThumbnail,
        duration: info.duration,
        previewUrl: isSpotify ? spotifyData.previewUrl : null,
        formats: processVideoFormats(info),
        audioFormats: processAudioFormats(info),
        spotifyMetadata: spotifyData
    };
}

function prepareBrainResponse(spotifyData) {
    return {
        title: spotifyData.title,
        artist: spotifyData.artist,
        album: spotifyData.album,
        cover: spotifyData.imageUrl || "/logo.webp",
        thumbnail: spotifyData.imageUrl || "/logo.webp",
        duration: spotifyData.duration / 1000,
        previewUrl: spotifyData.previewUrl,
        formats: spotifyData.formats,
        audioFormats: spotifyData.audioFormats,
        spotifyMetadata: spotifyData
    };
}

function setupConvertResponse(res, filename, format) {
    const mimeTypes = {
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "webm": "audio/webm",
        "mp4": "video/mp4",
        "opus": "audio/opus",
        "ogg": "audio/ogg"
    };

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Type", mimeTypes[format] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
}

module.exports = {
    prepareFinalResponse,
    prepareBrainResponse,
    setupConvertResponse
};
