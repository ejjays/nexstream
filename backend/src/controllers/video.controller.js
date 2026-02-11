const path = require('path');
const fs = require('fs');
const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube, saveToBrain } = require('../services/spotify.service');
const { getTracks } = require('spotify-url-info')(fetch);
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
  req.on('close', () => removeClient(id));
};

exports.seedIntelligence = async (req, res) => {
    const { url, id: clientId = 'admin-seeder' } = req.query;
    if (!url) return res.status(400).json({ error: 'No Spotify Artist/Album URL provided' });

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
                        if (clientId) sendEvent(clientId, { status: 'seeding', subStatus: `Processing: ${track.name}`, details: data.details });
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
                } catch (trackErr) {
                    console.error(`[Seeder] Error: ${trackErr.message}`);
                }
            }
            console.log(`[Seeder] COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`);
        })();

    } catch (err) {
        console.error('[Seeder] Error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};

exports.getVideoInformation = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const videoURL = req.query.url;
  const clientId = req.query.id;
  if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

  // Universal Platform Detector
  let serviceName = 'YouTube';
  if (videoURL.includes('spotify.com')) serviceName = 'Spotify Music';
  else if (videoURL.includes('facebook.com') || videoURL.includes('fb.watch')) serviceName = 'Facebook';
  else if (videoURL.includes('instagram.com')) serviceName = 'Instagram';
  else if (videoURL.includes('tiktok.com')) serviceName = 'TikTok';
  else if (videoURL.includes('twitter.com') || videoURL.includes('x.com')) serviceName = 'X (Twitter)';
  else if (videoURL.includes('soundcloud.com')) serviceName = 'SoundCloud';

  console.log(`Fetching info for: ${videoURL}`);
  if (clientId) {
    sendEvent(clientId, { status: 'fetching_info', progress: 5, subStatus: 'Initializing Session...', details: 'SESSION: STARTING_SECURE_CONTEXT' });
    // Send a secondary "keep-alive" log immediately
    setTimeout(() => sendEvent(clientId, { status: 'fetching_info', progress: 7, subStatus: 'Resolving Host...', details: 'DNS: LOOKUP_CDN_EDGE_NODES' }), 50);
  }

  // Smart Cookie Isolation
  let cookieType = null;
  if (videoURL.includes('facebook.com') || videoURL.includes('fb.watch')) {
    cookieType = 'facebook';
  } else if (videoURL.includes('youtube.com') || videoURL.includes('youtu.be') || videoURL.includes('spotify.com')) {
    cookieType = 'youtube';
  }
  
  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 10, subStatus: 'Bypassing restricted clients...' });
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  const isSpotify = videoURL.includes('spotify.com');

  // 1. Resolve Target URL (Spotify -> YouTube or Direct)
  let targetURL = videoURL;
  let spotifyData = null;

  if (isSpotify) {
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 15, subStatus: 'Resolving Spotify -> YouTube...' });
    spotifyData = await resolveSpotifyToYoutube(videoURL, cookieArgs, (status, progress, extraData) => {
      if (clientId) {
        sendEvent(clientId, { status, progress, ...extraData });
      }
    });
    targetURL = spotifyData.targetUrl;
  } else {
    // Other platforms - add more granular logs for feel
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 20, subStatus: `Extracting ${serviceName} Metadata...`, details: `ENGINE_YTDLP: INITIATING_CORE_EXTRACTION` });
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 40, subStatus: 'Analyzing Server-Side Signatures...', details: `NETWORK_HANDSHAKE: ESTABLISHING_SECURE_TUNNEL` });
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 60, subStatus: `Verifying ${serviceName} Handshake...`, details: `AUTH_GATEWAY: BYPASSING_PROTOCOL_RESTRICTIONS` });
  }

  console.log(`[Info] Target URL: ${targetURL}`);
  if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 85, subStatus: 'Resolving Target Data...' });

  try {
    // SUPER BRAIN BYPASS: If spotifyData already contains processed formats and cover, skip ahead
    if (isSpotify && spotifyData.fromBrain) {
        console.log(`[Super Brain] Bypassing YouTube fetch for: ${spotifyData.title}`);
        return res.json({
            title: spotifyData.title,
            artist: spotifyData.artist,
            album: spotifyData.album,
            cover: spotifyData.imageUrl, // Use direct URL to save RAM
            thumbnail: spotifyData.imageUrl,
            duration: spotifyData.duration / 1000,
            formats: spotifyData.formats,
            audioFormats: spotifyData.audioFormats,
            spotifyMetadata: spotifyData
        });
    }

    // 2. Fetch Video Info
    const info = await getVideoInfo(targetURL, cookieArgs);

    if (!info.formats) {
      return res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        formats: [],
        audioFormats: []
      });
    }

    // 3. Process Formats (Logic extracted to format.util.js)
    const uniqueFormats = processVideoFormats(info);
    const audioFormats = processAudioFormats(info);

    console.log(`[Debug] Total unique video formats: ${uniqueFormats.length}`);

    // 4. Normalize Metadata (Logic extracted to social.service.js)
    const finalTitle = normalizeTitle(info);
    let finalThumbnail = getBestThumbnail(info);
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);

    // Apply proxy to Spotify image if needed
    if (isSpotify && spotifyData.imageUrl) {
        spotifyData.imageUrl = await proxyThumbnailIfNeeded(spotifyData.imageUrl, videoURL);
    }

    console.log(`[Info] Title: "${finalTitle}" | Cover: ${finalThumbnail ? 'Found' : 'Missing'}`);

    const finalResponse = {
      title: isSpotify ? spotifyData.title : finalTitle,
      artist: isSpotify ? spotifyData.artist : info.uploader || '',
      album: isSpotify ? spotifyData.album : '',
      cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
      thumbnail: isSpotify ? spotifyData.imageUrl : finalThumbnail,
      duration: info.duration,
      formats: uniqueFormats,
      audioFormats: audioFormats,
      spotifyMetadata: spotifyData
    };

    // STRICT QUALITY CONTROL: Only save to Brain if match was ISRC-Verified (Soundcharts/Deezer/iTunes)
    if (isSpotify && !spotifyData.fromBrain && spotifyData.isIsrcMatch) {
        console.log(`[Super Brain] Quality Match Verified (ISRC). Saving to permanent memory.`);
        const { saveToBrain } = require('../services/spotify.service');
        saveToBrain(videoURL, {
            ...spotifyData,
            cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
            formats: uniqueFormats,
            audioFormats: audioFormats,
            targetUrl: targetURL
        });
    } else if (isSpotify && !spotifyData.fromBrain) {
        console.log(`[Super Brain] Search results were not ISRC-Verified. Skipping permanent save to prevent data poisoning.`);
    }

    // 5. Send Response
    res.json(finalResponse);

  } catch (err) {
    console.error('Info error:', err);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

exports.convertVideo = async (req, res) => {
  // 0. Ignore HEAD requests (used by browsers to check headers)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const data = { ...req.query, ...req.body };
  const { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId, filesize } = data;
  const title = data.title || 'video';

  if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

  // Smart Cookie Isolation
  let cookieType = null;
  if (videoURL.includes('facebook.com') || videoURL.includes('fb.watch')) {
    cookieType = 'facebook';
  } else if (videoURL.includes('youtube.com') || videoURL.includes('youtu.be') || videoURL.includes('spotify.com')) {
    cookieType = 'youtube';
  }

  const cookiesPath = cookieType ? await downloadCookies(cookieType) : null;
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  if (clientId) sendEvent(clientId, { status: 'initializing', progress: 10 });

  // ... (Platform Detection Logic) ...
  let serviceName = 'YouTube';
  if (videoURL.includes('spotify.com')) serviceName = 'Spotify Music';
  else if (format === 'mp3' || format === 'm4a') serviceName = 'YouTube Music';
  else if (videoURL.includes('facebook.com') || videoURL.includes('fb.watch')) serviceName = 'Facebook';
  else if (videoURL.includes('instagram.com')) serviceName = 'Instagram';
  else if (videoURL.includes('tiktok.com')) serviceName = 'TikTok';
  else if (videoURL.includes('twitter.com') || videoURL.includes('x.com')) serviceName = 'X (Twitter)';
  else if (videoURL.includes('soundcloud.com')) serviceName = 'SoundCloud';

  // 1. Resolve Target
  let targetURL = data.targetUrl;
  let spotifyData = null;

  if (!targetURL) {
    spotifyData = videoURL.includes('spotify.com')
      ? await resolveSpotifyToYoutube(videoURL, cookieArgs)
      : null;
    targetURL = spotifyData ? spotifyData.targetUrl : videoURL;
  }

  // 2. Prepare Metadata
  const spotifyMetadata = {
    title: data.title,
    artist: data.artist,
    album: data.album,
    imageUrl: data.imageUrl,
    year: data.year
  };

  const finalMetadata = spotifyData
    ? { ...spotifyData } 
    : { ...spotifyMetadata, duration: data.duration };

  console.log(`[Convert] Request Debug - ID: ${clientId}`);
  console.log(`[Convert] URL: ${videoURL}`);
  console.log(`[Convert] Target URL (Input): ${data.targetUrl}`);
  console.log(`[Convert] Target URL (Resolved): ${targetURL}`);

  console.log(`[Convert] Starting Stream Request. ClientID: ${clientId} | Method: ${req.method}`);
  if (clientId) sendEvent(clientId, { 
    status: 'initializing', 
    progress: 5, 
    subStatus: 'Analyzing Stream Extensions...',
    details: 'MUXER: PREPARING_VIRTUAL_CONTAINER'
  });

  let finalFormat = format;
  let preFetchedInfo = null;

  // ELITE AUDIO: Check for Direct Copy compatibility
  if (format === 'mp3' || formatId) {
      try {
          // For MP3, this will almost always hit the cache from the previous /info call
          preFetchedInfo = await getVideoInfo(targetURL, cookieArgs);
      } catch (e) {
          console.warn('[Convert] Pre-fetch failed, streamDownload will fetch manually');
      }
  }

  const isSpotifyRequest = videoURL.includes('spotify.com');
  let displayTitle = finalMetadata.title || title;
  
  // For Spotify requests, include the artist in the display title
  if (isSpotifyRequest && finalMetadata.artist) {
      displayTitle = `${finalMetadata.artist} — ${displayTitle}`;
  }

  const sanitizedTitle = displayTitle.replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
  const filename = `${sanitizedTitle}.${finalFormat}`;

  try {
    if (clientId) sendEvent(clientId, { 
      status: 'initializing', 
      progress: 15, 
      subStatus: `Handshaking with ${serviceName}...`,
      details: 'CONNECTION: INITIATING_STREAM_HANDSHAKE'
    });

    // 4. Set Headers for Immediate Native Download
    const mimeTypes = {
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'webm': 'audio/webm',
      'mp4': 'video/mp4',
      'opus': 'audio/opus',
      'ogg': 'audio/ogg'
    };

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', mimeTypes[finalFormat] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    // 5. Spawn Stream Download
    const videoProcess = streamDownload(
      targetURL,
      {
        format: finalFormat,
        formatId,
      },
      cookieArgs,
      preFetchedInfo // Pass the info we just got!
    );

    let totalBytesSent = 0;
    const totalExpectedSize = parseInt(filesize) || 0;
    let lastProgressUpdate = 0;

    // Handle pipe errors (Critical for preventing ECONNRESET crashes)
    videoProcess.stdout.on('error', err => {
      console.error(`[Stream Error] stdout: ${err.message}`);
    });

    // Track actual bytes flowing to the user
    videoProcess.stdout.on('data', chunk => {
        if (totalBytesSent === 0 && clientId) {
            // Signal that the stream has officially started
            sendEvent(clientId, {
                status: 'downloading',
                progress: 100,
                subStatus: 'STREAM ESTABLISHED: Check Downloads'
            });
        }
        totalBytesSent += chunk.length;
    });

    // Pipe stdout (the file data) directly to the response
    videoProcess.stdout.pipe(res);

    videoProcess.stderr.on('data', data => {
        const output = data.toString();
        if (output.toLowerCase().includes('error') && !output.includes('warning')) {
             console.error(`[FFmpeg Error] ${output}`);
        }
    });

    videoProcess.on('close', code => {
      // ONLY send success event if data was actually transferred
      if (code === 0 && totalBytesSent > 100000) {
        // No need to send 'sending' event here as UI will already be in started state
        console.log(`[Convert] Successfully streamed: ${filename} (${(totalBytesSent / (1024*1024)).toFixed(2)}MB)`);
      } else {
        console.log(`[Convert] Stream closed. Code: ${code} | Bytes: ${totalBytesSent}`);
        if (clientId && totalBytesSent > 0 && code !== 0) {
            sendEvent(clientId, { status: 'error', message: 'Stream interrupted' });
        }
        res.end();
      }
    });

    req.on('close', () => {
      if (videoProcess.exitCode === null) {
        console.log(`[Convert] Client disconnected. ClientID: ${clientId} | Bytes Sent: ${totalBytesSent}`);
        videoProcess.kill();
      }
    });

  } catch (error) {
    console.error('Convert error:', error);
    if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
};

function cleanupFiles(...paths) {
  paths.forEach(p => {
    if (p && fs.existsSync(p)) {
      fs.unlink(p, () => {});
    }
  });
}

exports.seedIntelligence = async (req, res) => {
    const { url, id: clientId = 'admin-seeder' } = req.query;
    if (!url) return res.status(400).json({ error: 'No Spotify Artist/Album URL provided' });

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
        (async () => {
            let successCount = 0;
            let skipCount = 0;

            console.log(`[Seeder] Background Queue Started. Tracks to process: ${tracks.length}`);

            for (const track of tracks) {
                try {
                    // SUPER RESOLVER: Check all possible locations for the track ID or URL
                    const trackId = track.id || 
                                   (track.uri && track.uri.includes(':track:') ? track.uri.split(':').pop() : null) ||
                                   (track.url && track.url.includes('track/') ? track.url.split('track/').pop().split('?')[0] : null);

                    const trackUrl = track.external_urls?.spotify || 
                                   track.url || 
                                   (trackId ? `https://open.spotify.com/track/${trackId}` : null);

                    if (!trackUrl) {
                        console.warn(`[Seeder] Could not resolve URL for: "${track.name || 'Unknown'}" | Keys: ${Object.keys(track).join(', ')}`);
                        continue;
                    }

                    console.log(`[Seeder] Analyzing: "${track.name || 'Unknown'}"`);
                    
                    // The resolver handles caching and ISRC logic automatically
                    const result = await resolveSpotifyToYoutube(trackUrl, [], (status, progress, data) => {
                        if (clientId) sendEvent(clientId, { status: 'seeding', subStatus: `Scanning: ${track.name}`, details: data.details });
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
                        console.log(`[Seeder] [OK] "${track.name}" locked into Permanent Memory.`);
                    } else {
                        skipCount++;
                        const reason = result?.fromBrain ? 'Already in Brain' : 'No ISRC match found';
                        console.log(`[Seeder] [SKIP] "${track.name}" (${reason})`);
                    }

                    // ANTI-BAN: Wait 5 seconds between tracks
                    await new Promise(r => setTimeout(r, 5000));
                } catch (trackErr) {
                    console.error(`[Seeder] [ERROR] Track processing failed:`, trackErr.message);
                }
            }
            console.log(`[Seeder] MISSION COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`);
        })();

    } catch (err) {
        console.error('[Seeder] FATAL:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};