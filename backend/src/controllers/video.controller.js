const path = require('node:path');
const fs = require('node:fs');
const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { isSupportedUrl, isValidSpotifyUrl } = require('../utils/validation.util');
const { getTracks } = require('spotify-url-info')(fetch);

/**
 * Detects the service name based on the URL.
 */
function detectService(url) {
  if (url.includes('spotify.com')) return 'Spotify Music';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
  if (url.includes('soundcloud.com')) return 'SoundCloud';
  if (url.includes('reddit.com')) return 'Reddit';
  return 'YouTube';
}

/**
 * Determines the cookie type for isolation.
 */
function getCookieType(url) {
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'facebook';
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('spotify.com')) return 'youtube';
  return null;
}

const {
  getVideoInfo,
  spawnDownload,
  streamDownload,
  downloadImage,
  injectMetadata
} = require('../services/ytdlp.service');
const { processVideoFormats, processAudioFormats } = require('../utils/format.util');
const { normalizeTitle, getBestThumbnail, proxyThumbnailIfNeeded } = require('../services/social.service');

const TEMP_DIR = path.join(__dirname, '../../temp');

exports.streamEvents = (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).end();
  addClient(id, res);
  console.log(`[SSE] Client Synchronized: ${id}`);
  req.on('close', () => removeClient(id));
};

exports.seedIntelligence = async (req, res) => {
    const { url, id: clientId = 'admin-seeder' } = req.query;
    if (!url) return res.status(400).json({ error: 'No Spotify Artist/Album URL provided' });

    if (!isValidSpotifyUrl(url)) {
        return res.status(400).json({ error: 'Invalid Spotify URL provided.' });
    }

    console.log(`[Seeder] Initializing Intelligence Gathering for: ${url}`);
    
    try {
        const tracks = await getTracks(url);
        if (!tracks || tracks.length === 0) throw new Error('No tracks found in the provided link.');

        res.json({ 
            message: 'Intelligence Gathering Started in Background', 
            trackCount: tracks.length,
            target: url 
        });

        // Background Processor
        (async () => {
            let successCount = 0;
            let skipCount = 0;

            for (const track of tracks) {
                try {
                    const trackUrl = track.external_urls?.spotify || track.url;
                    if (!trackUrl) continue;

                    console.log(`[Seeder] Processing Track: "${track.name}"`);
                    
                    // The resolver handles caching and ISRC logic automatically
                    const result = await resolveSpotifyToYoutube(trackUrl, [], (status, progress, data) => {
                        if (clientId) sendEvent(clientId, { status: 'seeding', subStatus: `Processing: "${track.name} by ${track.artists?.[0]?.name || 'Unknown'}"`, details: data.details });
                    });

                    // Only save to brain if it's ISRC verified and not already there
                    if (result && result.isIsrcMatch && !result.fromBrain) {
                        const info = await getVideoInfo(result.targetUrl);
                        const uniqueFormats = processVideoFormats(info);
                        const audioFormats = processAudioFormats(info);

                        await saveToBrain(trackUrl, {
                            ...result,
                            cover: result.imageUrl,
                            formats: uniqueFormats,
                            audioFormats: audioFormats
                        });
                        successCount++;
                        console.log(`[Seeder] SUCCESS: "${track.name}" locked.`);
                    } else {
                        skipCount++;
                        console.log(`[Seeder] SKIPPED: "${track.name}" (No ISRC or Already exists).`);
                    }

                    await new Promise(r => setTimeout(r, 5000));
                } catch (error) {
                    console.error(`[Seeder] Error: ${error.message}`);
                }
            }
            console.log(`[Seeder] COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`);
        })();

    } catch (err) {
        console.error('[Seeder] Error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};

async function handleSpotifyRequest(videoURL, cookieArgs, clientId) {
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 15, subStatus: 'Synchronizing with Global Registry...', details: 'UPLINK: SYNCHRONIZING_METADATA_STREAM' });
    
    const spotifyData = await resolveSpotifyToYoutube(videoURL, cookieArgs, (status, progress, extraData) => {
        if (clientId) {
            // Forward metadata_update for early UI rendering
            sendEvent(clientId, { status, progress, ...extraData });
        }
    });

    return { 
        targetURL: spotifyData.targetUrl, 
        spotifyData 
    };
}

async function prepareFinalResponse(info, isSpotify, spotifyData, videoURL) {
    const finalTitle = normalizeTitle(info);
    let finalThumbnail = getBestThumbnail(info);
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);

    if (isSpotify && spotifyData?.imageUrl) {
        spotifyData.imageUrl = await proxyThumbnailIfNeeded(spotifyData.imageUrl, videoURL);
    }

    return {
        title: isSpotify ? spotifyData.title : finalTitle,
        artist: isSpotify ? spotifyData.artist : info.uploader || '',
        album: isSpotify ? spotifyData.album : '',
        cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
        thumbnail: isSpotify ? spotifyData.imageUrl : finalThumbnail,
        duration: info.duration,
        formats: processVideoFormats(info),
        audioFormats: processAudioFormats(info),
        spotifyMetadata: spotifyData
    };
}

async function initializeSession(clientId, serviceName) {
    if (!clientId) return;
    sendEvent(clientId, { status: 'fetching_info', progress: 5, subStatus: 'Initializing Session...', details: 'SESSION: STARTING_SECURE_CONTEXT' });
    setTimeout(() => sendEvent(clientId, { status: 'fetching_info', progress: 7, subStatus: 'Resolving Host...', details: 'NETWORK: RESOLVING_CDN_EDGE_NODES' }), 50);
}

async function getCookieArgs(videoURL, clientId) {
    const cookieType = getCookieType(videoURL);
    const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 10, subStatus: 'Bypassing restricted clients...', details: 'AUTH: BYPASSING_PROTOCOL_RESTRICTIONS' });
    return cookiesPath ? ['--cookies', cookiesPath] : [];
}

async function logExtractionSteps(clientId, serviceName) {
    if (!clientId) return;
    sendEvent(clientId, { status: 'fetching_info', progress: 20, subStatus: `Extracting ${serviceName} Metadata...`, details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION` });
    sendEvent(clientId, { status: 'fetching_info', progress: 40, subStatus: 'Analyzing Server-Side Signatures...', details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL` });
    sendEvent(clientId, { status: 'fetching_info', progress: 60, subStatus: `Verifying ${serviceName} Handshake...`, details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS` });
}

exports.getVideoInformation = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const videoURL = req.query.url;
  const clientId = req.query.id;
  if (!videoURL || !isSupportedUrl(videoURL)) {
    return res.status(400).json({ error: 'No valid URL provided' });
  }

  const serviceName = detectService(videoURL);
  await initializeSession(clientId, serviceName);

  const cookieArgs = await getCookieArgs(videoURL, clientId);
  const isSpotify = videoURL.includes('spotify.com');

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
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 85, subStatus: 'Resolving Target Data...' });

    const info = await getVideoInfo(targetURL, cookieArgs);
    if (!info.formats) {
      return res.json({ title: info.title, thumbnail: info.thumbnail, formats: [], audioFormats: [] });
    }

    const finalResponse = await prepareFinalResponse(info, isSpotify, spotifyData, videoURL);

    if (isSpotify && !spotifyData.fromBrain && spotifyData.isIsrcMatch) {
        saveToBrain(videoURL, {
            ...spotifyData,
            cover: finalResponse.cover,
            formats: finalResponse.formats,
            audioFormats: finalResponse.audioFormats,
            targetUrl: targetURL
        });
    }

    res.json(finalResponse);
  } catch (err) {
    console.error('Info error:', err);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

function handleBrainHit(videoURL, targetURL, spotifyData, cookieArgs, clientId) {
    console.log(`[Super Brain] Hit: ${spotifyData.title}`);
    if (!spotifyData.imageUrl || spotifyData.imageUrl === '/logo.webp') {
        console.log(`[Super Brain] Healing missing image for: ${spotifyData.title}`);
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
            } catch (e) { console.error('[Healing] Failed:', e.message); }
        })();
    }
}

function prepareBrainResponse(spotifyData) {
    return {
        title: spotifyData.title,
        artist: spotifyData.artist,
        album: spotifyData.album,
        cover: spotifyData.imageUrl || '/logo.webp',
        thumbnail: spotifyData.imageUrl || '/logo.webp',
        duration: spotifyData.duration / 1000,
        formats: spotifyData.formats,
        audioFormats: spotifyData.audioFormats,
        spotifyMetadata: spotifyData
    };
}

function setupConvertResponse(res, filename, format) {
    const mimeTypes = {
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'webm': 'audio/webm',
        'mp4': 'video/mp4',
        'opus': 'audio/opus',
        'ogg': 'audio/ogg'
    };

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
}

async function resolveConvertTarget(videoURL, targetURL, cookieArgs) {
    if (targetURL) return targetURL;
    const spotifyData = videoURL.includes('spotify.com') ? await resolveSpotifyToYoutube(videoURL, cookieArgs) : null;
    return spotifyData ? spotifyData.targetUrl : videoURL;
}

function getSanitizedFilename(title, artist, format, isSpotifyRequest) {
    let displayTitle = title;
    if (isSpotifyRequest && artist) displayTitle = `${artist} — ${displayTitle}`;
    const sanitized = displayTitle.replaceAll(/[<>:"/\\|?*]/g, '').trim() || 'video';
    return `${sanitized}.${format}`;
}

exports.convertVideo = async (req, res) => {
  if (req.method === 'HEAD') return res.status(200).end();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const data = { ...req.query, ...req.body };
  
  // URL SAFETY: If imageUrl is a massive base64 string passed via GET, strip it to prevent 414 URI Too Long
  if (req.method === 'GET' && data.imageUrl && data.imageUrl.length > 2000) {
      console.warn('[Convert] Stripping massive base64 imageUrl from GET request for safety');
      data.imageUrl = ''; 
  }

  const { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId } = data;

  if (!videoURL || !isSupportedUrl(videoURL)) {
    return res.status(400).json({ error: 'No valid URL provided' });
  }

  // --- LIGHTNING ENGINE FOR MP3 (INSTANT HEADER DISPATCH) ---
  if (format === 'mp3') {
    const isSpotifyRequest = videoURL.includes('spotify.com');
    const filename = getSanitizedFilename(data.title || 'video', data.artist, format, isSpotifyRequest);
    
    // SEND HEADERS IMMEDIATELY: This triggers the browser download modal at 0ms
    setupConvertResponse(res, filename, format);
    // Force flush headers so browser sees the attachment immediately
    if (res.flushHeaders) res.flushHeaders();
    
    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 5, subStatus: 'Lightning Engine Active: Starting Stream...', details: 'HYBRID_ENGINE: INSTANT_MP3_DISPATCH' });

    (async () => {
        try {
            const cookieArgs = await getCookieArgs(videoURL, clientId);
            const resolvedTargetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);
            
            // CRITICAL: We need the REAL media stream URL, not the YouTube Watch URL
            let streamURL = data.targetUrl;
            let info = null;

            if (!streamURL || streamURL.includes('youtube.com/watch')) {
                info = await getVideoInfo(resolvedTargetURL, cookieArgs);
                const audioFormat = info.formats.find(f => f.format_id === formatId) || 
                                  info.formats.filter(f => f.acodec !== 'none').sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
                streamURL = audioFormat.url;
            } else {
                // If we have a direct streamURL, create a skeleton info to satisfy handleMp3Stream
                info = { formats: [{ format_id: formatId, url: streamURL }] };
            }
            
            const videoProcess = streamDownload(streamURL, { format, formatId }, cookieArgs, info);
            let totalBytesSent = 0;

            videoProcess.stdout.on('data', chunk => {
                if (totalBytesSent === 0 && clientId) {
                    sendEvent(clientId, { status: 'downloading', progress: 100, subStatus: 'STREAM ESTABLISHED: Check Downloads' });
                }
                totalBytesSent += chunk.length;
            });

            videoProcess.stdout.pipe(res);
            req.on('close', () => { if (videoProcess.exitCode === null) videoProcess.kill(); });
            videoProcess.on('close', code => { 
                if (code !== 0 && totalBytesSent > 0 && clientId) sendEvent(clientId, { status: 'error', message: 'Stream interrupted' }); 
                res.end(); 
            });
        } catch (error) {
            console.error('[Lightning MP3] Critical Stream Error:', error);
            if (clientId) sendEvent(clientId, { status: 'error', message: 'Stream failed to initialize' });
            res.end();
        }
    })();
    return;
  }
  // --- END LIGHTNING ENGINE ---

  const cookieArgs = await getCookieArgs(videoURL, clientId);
  const targetURL = await resolveConvertTarget(videoURL, data.targetUrl, cookieArgs);
  const isSpotifyRequest = videoURL.includes('spotify.com');
  const filename = getSanitizedFilename(data.title || 'video', data.artist, format, isSpotifyRequest);

  if (clientId) sendEvent(clientId, { status: 'initializing', progress: 5, subStatus: 'Analyzing Stream Extensions...', details: 'MUXER: PREPARING_VIRTUAL_CONTAINER' });

  try {
    const info = (format === 'mp3' || formatId) ? await getVideoInfo(targetURL, cookieArgs).catch(() => null) : null;
    setupConvertResponse(res, filename, format);
    
    const videoProcess = streamDownload(targetURL, { format, formatId }, cookieArgs, info);
    let totalBytesSent = 0;

    videoProcess.stdout.on('data', chunk => {
        if (totalBytesSent === 0 && clientId) {
            sendEvent(clientId, { status: 'downloading', progress: 100, subStatus: 'STREAM ESTABLISHED: Check Downloads' });
        }
        totalBytesSent += chunk.length;
    });

    videoProcess.stdout.pipe(res);
    req.on('close', () => { if (videoProcess.exitCode === null) videoProcess.kill(); });
    videoProcess.on('close', code => { if (code !== 0 && totalBytesSent > 0 && clientId) sendEvent(clientId, { status: 'error', message: 'Stream interrupted' }); res.end(); });
  } catch (error) {
    if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

async function resolveAndSaveTrack(track, clientId) {
    const trackId = track.id || 
                   (track.uri && track.uri.includes(':track:') ? track.uri.split(':').pop() : null) ||
                   (track.url && track.url.includes('track/') ? track.url.split('track/').pop().split('?')[0] : null);

    const trackUrl = track.external_urls?.spotify || 
                   track.url || 
                   (trackId ? `https://open.spotify.com/track/${trackId}` : null);

    if (!trackUrl) {
        console.warn(`[Seeder] Could not resolve URL for: "${track.name || 'Unknown'}"`);
        return false;
    }

    console.log(`[Seeder] Analyzing: "${track.name || 'Unknown'}"`);
    
    const result = await resolveSpotifyToYoutube(trackUrl, [], (status, progress, data) => {
        if (clientId) sendEvent(clientId, { status: 'seeding', subStatus: `Scanning: "${track.name} by ${track.artists?.[0]?.name || 'Unknown'}"`, details: data.details });
    });

    if (result && result.isIsrcMatch && !result.fromBrain) {
        const info = await getVideoInfo(result.targetUrl);
        await saveToBrain(trackUrl, {
            ...result,
            cover: result.imageUrl,
            formats: processVideoFormats(info),
            audioFormats: processAudioFormats(info)
        });
        console.log(`[Seeder] [OK] "${track.name}" locked into Permanent Memory.`);
        return true;
    }

    const reason = result?.fromBrain ? 'Already in Brain' : 'No ISRC match found';
    console.log(`[Seeder] [SKIP] "${track.name}" (${reason})`);
    return false;
}

async function processBackgroundTracks(tracks, clientId) {
    let successCount = 0;
    let skipCount = 0;

    console.log(`[Seeder] Background Queue Started. Tracks to process: ${tracks.length}`);

    for (const track of tracks) {
        try {
            const saved = await resolveAndSaveTrack(track, clientId);
            if (saved) successCount++;
            else skipCount++;

            // ANTI-BAN: Wait 5 seconds between tracks
            await new Promise(r => setTimeout(r, 5000));
        } catch (error) {
            console.error(`[Seeder] [ERROR] Track processing failed:`, error.message);
        }
    }
    console.log(`[Seeder] MISSION COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`);
}

exports.seedIntelligence = async (req, res) => {
    const { url, id: clientId = 'admin-seeder' } = req.query;
    if (!url) return res.status(400).json({ error: 'No Spotify Artist/Album URL provided' });

    if (!isValidSpotifyUrl(url)) {
        return res.status(400).json({ error: 'Invalid Spotify URL provided.' });
    }

    console.log(`[Seeder] Initializing Intelligence Gathering for: ${url}`);
    
    try {
        // Universal Track Extraction
        let tracks = [];
        try {
            tracks = await getTracks(url);
        } catch (e) {
            console.error('[Seeder] spotify-url-info getTracks failed:', e.message);
        }

        if (!tracks || tracks.length === 0) {
            // Fallback for some Artist links that return nested objects
            const { getData } = require('spotify-url-info')(fetch);
            const data = await getData(url);
            if (data && data.tracks) {
                tracks = Array.isArray(data.tracks) ? data.tracks : (data.tracks.items || []);
            }
        }

        if (!tracks || tracks.length === 0) {
            throw new Error('No tracks found in the provided link. Ensure it is a valid Spotify Track, Album, or Artist URL.');
        }

        res.json({ 
            message: 'Intelligence Gathering Started in Background', 
            trackCount: tracks.length,
            target: url 
        });

        // Background Processor
        processBackgroundTracks(tracks, clientId).catch(err => {
            console.error('[Seeder] Background Process Crashed:', err.message);
        });

    } catch (err) {
        console.error('[Seeder] FATAL:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};