const { sendEvent } = require('./sse.util');
const { getCookieType } = require('./video.util');
const { downloadCookies } = require('./cookie.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { isValidProxyUrl } = require('./validation.util');
const { getVideoInfo } = require('../services/ytdlp.service');
const { getBestThumbnail, proxyThumbnailIfNeeded } = require('../services/social.service');

async function getCookieArgs(videoURL, clientId) {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId) {
    sendEvent(clientId, {
      status: 'fetching_info',
      progress: 10,
      subStatus: 'Bypassing restricted clients...',
      details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS'
    });
  }
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

async function initializeSession(clientId) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 5,
    subStatus: 'Initializing Session...',
    details: 'SESSION: STARTING_SECURE_CONTEXT'
  });
  setTimeout(
    () =>
      sendEvent(clientId, {
        status: 'fetching_info',
        progress: 7,
        subStatus: 'Resolving Host...',
        details: 'NETWORK: RESOLVING_CDN_EDGE_NODES'
      }),
    50
  );
}

async function logExtractionSteps(clientId, serviceName) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 20,
    subStatus: `Extracting ${serviceName} Metadata...`,
    details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 40,
    subStatus: 'Analyzing Server-Side Signatures...',
    details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 60,
    subStatus: `Verifying ${serviceName} Handshake...`,
    details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS`
  });
}

function handleBrainHit(
  videoURL,
  targetURL,
  spotifyData,
  cookieArgs,
  clientId
) {
  if (!spotifyData.imageUrl || spotifyData.imageUrl === '/logo.webp') {
    (async () => {
      try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        let finalThumbnail = getBestThumbnail(info);
        finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
        if (clientId) {
          sendEvent(clientId, {
            status: 'fetching_info',
            metadata_update: {
              cover: finalThumbnail,
              title: spotifyData.title,
              artist: spotifyData.artist
            }
          });
        }
        saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
      } catch (e) {}
    })();
  }
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
  if (targetURL && !isValidProxyUrl(targetURL)) {
    console.warn('[Security] Blocked invalid targetUrl in resolve');
    return videoURL;
  }
  if (targetURL) return targetURL;
  const spotifyData = videoURL.includes('spotify.com')
    ? await resolveSpotifyToYoutube(videoURL, cookieArgs)
    : null;
  return spotifyData ? spotifyData.targetUrl : videoURL;
}

async function resolveAudioFormatIfMp3(format, streamURL, resolvedTargetURL, cookieArgs, formatId) {
  if (
    format === 'mp3' &&
    (streamURL.includes('youtube.com/watch') || streamURL.includes('youtu.be'))
  ) {
    const info = await getVideoInfo(resolvedTargetURL, cookieArgs);
    const audioFormat =
      info.formats.find(f => String(f.format_id) === String(formatId)) ||
      info.formats
        .filter(f => f.acodec !== 'none')
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    return { info, streamURL: audioFormat ? audioFormat.url : streamURL };
  }
  const info = await getVideoInfo(resolvedTargetURL, cookieArgs).catch(() => null);
  return { info, streamURL };
}

module.exports = {
  getCookieArgs,
  initializeSession,
  logExtractionSteps,
  handleBrainHit,
  resolveConvertTarget,
  resolveAudioFormatIfMp3
};
