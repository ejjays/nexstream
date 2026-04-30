import fs from 'fs';
import { sendEvent } from './sse.util.js';
import { getCookieType } from './video.util.js';
import { downloadCookies } from './cookie.util.js';
import { isValidProxyUrl } from './validation.util.js';
import { getVideoInfo } from '../services/ytdlp.service.js';
import { getBestThumbnail, proxyThumbnailIfNeeded } from '../services/social.service.js';
import { VideoInfo, SpotifyMetadata } from '../types/index.js';

export async function getCookieArgs(videoURL: string, clientId: string | undefined, status: string = 'fetching_info'): Promise<string[]> {
  const cookieType = getCookieType(videoURL);
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId) {
    sendEvent(clientId, {
      status: status as any,
      progress: 8,
      subStatus: 'Bypassing restricted clients...',
      details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS'
    });
  }
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

export async function initializeSession(clientId: string | undefined, status: string = 'fetching_info'): Promise<void> {
  if (!clientId) return;
  sendEvent(clientId, {
    status: status as any,
    progress: 3,
    subStatus: 'Initializing Session...',
    details: 'SESSION: STARTING_SECURE_CONTEXT'
  });
}

export async function logExtractionSteps(clientId: string | undefined, serviceName: string, step: number = 1): Promise<void> {
  if (!clientId) return;
  const steps = [
    { progress: 12, subStatus: `Extracting ${serviceName} Metadata...`, details: 'ENGINE_YTDLP: INITIATING_CORE_EXTRACTION' },
    { progress: 18, subStatus: 'Analyzing Server-Side Signatures...', details: 'NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL' },
    { progress: 24, subStatus: `Verifying ${serviceName} Handshake...`, details: 'AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS' }
  ];
  
  const currentStep = steps[step - 1] || steps[0];
  sendEvent(clientId, {
    status: 'fetching_info' as any,
    ...currentStep
  });
}

export function handleBrainHit(
  videoURL: string,
  targetURL: string,
  spotifyData: SpotifyMetadata,
  cookieArgs: string[],
  clientId: string | undefined
): void {
  if (!spotifyData.cover || spotifyData.cover === '/logo.webp') {
    (async () => {
      try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        let finalThumbnail = getBestThumbnail(info);
        finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
        if (clientId) {
          sendEvent(clientId, {
            status: 'fetching_info' as any,
            text: JSON.stringify({
              metadata_update: {
                cover: finalThumbnail,
                title: spotifyData.title,
                artist: spotifyData.artist
              }
            })
          });
        }
        
        // Only save if it's an ISRC match to avoid data poisoning
        if (spotifyData.fromBrain) {
            const { saveToBrain } = await import('../services/spotify.service.js');
            saveToBrain(videoURL, { ...spotifyData, cover: finalThumbnail });
        }
      } catch (e) {}
    })();
  }
}

export async function resolveConvertTarget(videoURL: string, targetURL: string | undefined, cookieArgs: string[]): Promise<string> {
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
          const resolved = (info.target_url || info.targetUrl) as string;
          console.log(`[Resolve] Successfully hit cache: ${resolved}`);
          return resolved;
      }
  }
  
  return videoURL;
}

export async function resolveAudioFormatIfMp3(
  format: string, 
  streamURL: string, 
  resolvedTargetURL: string, 
  cookieArgs: string[], 
  formatId: string | undefined, 
  clientId: string | undefined, 
  videoURL: string | null = null
): Promise<{ info: VideoInfo | null, audioFormat?: any, streamURL: string }> {
  const urlToUse = videoURL || resolvedTargetURL;
  console.log(`[Resolve] Resolving audio format for ${urlToUse} (Format: ${format})`);

  // hit RAM cache
  let info: VideoInfo | null = await getVideoInfo(urlToUse, cookieArgs).catch(() => null);

  if (!info) {
    const { getInfo } = await import('../services/extractors/index.js');
    
    // parse cookies
    let rawCookie: string | null = null;
    if (cookieArgs && cookieArgs.includes('--cookies')) {
        const cookiePath = cookieArgs[cookieArgs.indexOf('--cookies') + 1];
        if (cookiePath && fs.existsSync(cookiePath)) {
            const content = fs.readFileSync(cookiePath, 'utf8');
            const lines = content.split('\n');
            const pairs: string[] = [];
            for (const line of lines) {
                if (!line.trim() || line.startsWith('#')) continue;
                const parts = line.split('\t');
                if (parts.length >= 7) pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
            }
            rawCookie = pairs.join('; ');
        }
    }

    info = await getInfo(urlToUse, { cookie: rawCookie || cookieArgs.join('; ') }).catch(() => null);
  }

  if (!info) return { info: null, streamURL };
  
  const audioFormat =
    info.formats.find(f => String(f.format_id) === String(formatId)) ||
    info.formats
      .filter(f => f.acodec !== 'none' || f.is_audio)
      .sort((a, b) => ((b as any).abr || 0) - ((a as any).abr || 0))[0];

  // return info format
  return { info, audioFormat, streamURL };
}
