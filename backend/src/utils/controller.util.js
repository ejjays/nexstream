const { sendEvent } = require('./sse.util');
const { getCookieType } = require('./video.util');
const { downloadCookies } = require('./cookie.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { isValidProxyUrl } = require('./validation.util');
const { getVideoInfo } = require('../services/ytdlp.service');
const { getBestThumbnail, proxyThumbnailIfNeeded } = require('../services/social.service');

async function getCookieArgs(videoURL, clientId, status = 'fetching_info') {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId) {
    sendEvent(clientId, {
      status,
      progress: 10,
      subStatus: 'Bypassing restricted clients...',
      details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS'
    });
  }
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

async function initializeSession(clientId, status = 'fetching_info') {
  if (!clientId) return;
  sendEvent(clientId, {
    status,
    progress: 5,
    subStatus: 'Initializing Session...',
    details: 'SESSION: STARTING_SECURE_CONTEXT'
  });
}

async function logExtractionSteps(clientId, serviceName) {
  if (!clientId) return;
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 10,
    subStatus: `Extracting ${serviceName} Metadata...`,
    details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 15,
    subStatus: 'Analyzing Server-Side Signatures...',
    details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL`
  });
  sendEvent(clientId, {
    status: 'fetching_info',
    progress: 20,
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
        
        // Only save if it's an ISRC match to avoid data poisoning
        if (spotifyData.isIsrcMatch) {
            saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
        }
      } catch (e) {}
    })();
  }
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
  if (targetURL && !isValidProxyUrl(targetURL)) {
    console.warn('[Security] Blocked invalid targetUrl in resolve');
    return videoURL;
  }
  
  // use frontend target if valid youtube link
  if (targetURL && (targetURL.includes('youtube.com') || targetURL.includes('youtu.be'))) return targetURL;

  // fallback target url
  if (videoURL.includes('spotify.com')) {
      console.log(`[Resolve] Using unified cache for Spotify target resolution: ${videoURL}`);
      // hit RAM cache
      let info = await getVideoInfo(videoURL, cookieArgs).catch(() => null);
      
      if (info && info.isPartial) {
          console.log(`[Resolve] Waiting for background resolution for: ${videoURL}`);
          // wait background resolution
          info = await getVideoInfo(videoURL, cookieArgs, false).catch(() => null);
      }
      
      if (info && (info.target_url || info.targetUrl)) {
          const resolved = info.target_url || info.targetUrl;
          console.log(`[Resolve] Successfully hit cache: ${resolved}`);
          return resolved;
      }
  }
  
  return videoURL;
}

async function resolveAudioFormatIfMp3(format, streamURL, resolvedTargetURL, cookieArgs, formatId, clientId, videoURL = null) {
  const urlToUse = videoURL || resolvedTargetURL;
  console.log(`[Resolve] Resolving audio format for ${urlToUse} (Format: ${format})`);

  // hit RAM cache
  let info = await getVideoInfo(urlToUse, cookieArgs).catch(() => null);

  if (!info) {
    const extractors = require('../services/extractors');
    info = await extractors.getInfo(urlToUse, { cookie: cookieArgs.join('; ') }).catch(() => null);
  }

  if (!info) return { info: null, streamURL };
  
  const audioFormat =
    info.formats.find(f => String(f.format_id) === String(formatId)) ||
    info.formats
      .filter(f => f.acodec !== 'none' || f.is_audio)
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  // return info format
  return { info, audioFormat, streamURL };
}

module.exports = {
  getCookieArgs,
  initializeSession,
  logExtractionSteps,
  handleBrainHit,
  resolveConvertTarget,
  resolveAudioFormatIfMp3
};
