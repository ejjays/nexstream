const path = require('path');
const fs = require('fs');
const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube } = require('../services/spotify.service');
const {
  getVideoInfo,
  spawnDownload,
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

exports.getVideoInformation = async (req, res) => {
  const videoURL = req.query.url;
  const clientId = req.query.id;
  if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

  console.log(`Fetching info for: ${videoURL}`);
  if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 5, subStatus: 'Initializing Session...' });

  const cookiesPath = await downloadCookies();
  if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 10, subStatus: 'Bypassing restricted clients...' });
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  const isSpotify = videoURL.includes('spotify.com');
  // Use YouTube Music for Audio mode, YouTube for Video mode (even if from Spotify)
  const serviceName = format === 'mp3' ? 'YouTube Music' : 'YouTube';

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
    // YouTube Direct path - add more granular logs for feel
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 20, subStatus: 'Extracting Video Metadata...' });
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 40, subStatus: 'Analyzing Server-Side Signatures...' });
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 60, subStatus: 'Verifying Stream Handshake...' });
  }

  console.log(`[Info] Target URL: ${targetURL}`);
  if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 85, subStatus: 'Resolving Target Data...' });

  try {
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

    console.log(`[Info] Title: "${finalTitle}" | Cover: ${finalThumbnail ? 'Found' : 'Missing'}`);

    // 5. Send Response
    res.json({
      title: isSpotify ? spotifyData.title : finalTitle,
      artist: isSpotify ? spotifyData.artist : info.uploader || '',
      album: isSpotify ? spotifyData.album : '',
      cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
      thumbnail: isSpotify ? spotifyData.imageUrl : finalThumbnail,
      duration: info.duration,
      formats: uniqueFormats,
      audioFormats: audioFormats,
      spotifyMetadata: spotifyData
    });

  } catch (err) {
    console.error('Info error:', err);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

exports.convertVideo = async (req, res) => {
  const data = { ...req.query, ...req.body };
  const { url: videoURL, id: clientId = Date.now().toString(), format = 'mp4', formatId } = data;
  const title = data.title || 'video';

  if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

  const cookiesPath = await downloadCookies();
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  if (clientId) sendEvent(clientId, { status: 'initializing', progress: 10 });

  const isSpotify = videoURL.includes('spotify.com');
  // Use YouTube Music for Audio mode, YouTube for Video mode (even if from Spotify)
  const serviceName = format === 'mp3' ? 'YouTube Music' : 'YouTube';

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
    ? { ...spotifyData } // Spread all spotify props including duration
    : { ...spotifyMetadata, duration: data.duration };

  console.log(`[Convert] Target URL: ${targetURL}`);
  if (clientId) sendEvent(clientId, { status: 'initializing', progress: 5, subStatus: 'Analyzing Stream Extensions...' });

  let finalFormat = format;
  // If it's audio mode, check if we can use M4A direct copy
  if (format === 'mp3' && formatId) {
     try {
        if (clientId) sendEvent(clientId, { status: 'initializing', progress: 8, subStatus: 'Mapping direct-stream copies...' });
        const info = await getVideoInfo(targetURL, cookieArgs);
        const selectedStream = info.formats.find(f => f.format_id === formatId);
        if (selectedStream && (selectedStream.ext === 'm4a' || selectedStream.acodec?.includes('mp4a'))) {
            finalFormat = 'm4a';
            console.log(`[Convert] Detected M4A stream, switching to Direct Copy mode.`);
        }
     } catch (e) {
        console.warn('[Convert] Could not verify stream extension, defaulting to mp3 conversion');
     }
  }

  const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.${finalFormat}`);
  const coverPath = path.join(TEMP_DIR, `${clientId}_cover.jpg`);
  const sanitizedTitle = (finalMetadata.title || title).replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
  const filename = `${sanitizedTitle}.${finalFormat}`;

  try {
    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 12, subStatus: 'Injecting Lossless Cover Art...' });

    // 3. Handle Cover Art (Save to disk)
    let finalCoverPath = null;
    if (finalMetadata.imageUrl) {
      try {
        if (finalMetadata.imageUrl.startsWith('data:image')) {
          const base64Data = finalMetadata.imageUrl.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(coverPath, Buffer.from(base64Data, 'base64'));
          finalCoverPath = coverPath;
        } else {
          finalCoverPath = await downloadImage(finalMetadata.imageUrl, coverPath);
        }
      } catch (e) {
        console.warn('[Metadata] Cover download/save failed:', e.message);
      }
    }

    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 15, subStatus: `Handshaking with ${serviceName}...` });

    // 4. Spawn Download
    const videoProcess = spawnDownload(
      targetURL,
      {
        format: finalFormat,
        formatId,
        tempFilePath,
        metadata: { ...finalMetadata, coverFile: finalCoverPath }
      },
      cookieArgs
    );

    videoProcess.stdout.on('data', data => {
      const output = data.toString();
      const lines = output.split('\n');
      
      lines.forEach(line => {
        if (line.includes('[download]')) {
          const match = line.match(/(\d+(?:\.\d+)?)%/);
          if (match && clientId) {
            const percentage = parseFloat(match[1]);
            // Map 0-100% download to 20-92% total progress
            const progress = Math.round(20 + (percentage * 0.72));
            
            sendEvent(clientId, {
              status: 'downloading',
              progress: progress,
              subStatus: `RECEIVING DATA: ${Math.floor(percentage)}%`
            });
          }
        }
        
        // Include FixupM4a for direct copy status updates
        if (clientId && (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[FixupM4a]'))) {
          sendEvent(clientId, { status: 'merging', progress: 95, subStatus: 'Merging & Tagging Streams...' });
        }
      });
    });

    videoProcess.stderr.on('data', data => {
      console.error(`[yt-dlp Download Error] ${data.toString()}`);
    });

    videoProcess.on('close', async code => {
      if (code === 0) {
        if (clientId) sendEvent(clientId, { status: 'merging', progress: 97, subStatus: 'Finalizing Metadata Tags...' });

        // 5. Post-process (Tagging)
        try {
          await injectMetadata(tempFilePath, { ...finalMetadata, coverFile: finalCoverPath });
        } catch (tagError) {
          console.warn('[Metadata] Injection failed but continuing:', tagError.message);
        }

        if (clientId) sendEvent(clientId, { status: 'sending', progress: 99, subStatus: 'Preparing File for Transfer...' });
        
        res.download(tempFilePath, filename, err => {
          cleanupFiles(tempFilePath, coverPath);
        });
      } else {
        if (clientId) sendEvent(clientId, { status: 'error', message: 'Conversion failed' });
        if (!res.headersSent) res.status(500).end();
        cleanupFiles(tempFilePath, coverPath);
      }
    });

    req.on('close', () => {
      if (videoProcess.exitCode === null) {
        videoProcess.kill();
        cleanupFiles(tempFilePath, coverPath);
      }
    });

  } catch (error) {
    console.error('Convert error:', error);
    if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
    if (!res.headersSent) res.status(500).end();
  }
};

function cleanupFiles(...paths) {
  paths.forEach(p => {
    if (p && fs.existsSync(p)) {
      fs.unlink(p, () => {});
    }
  });
}