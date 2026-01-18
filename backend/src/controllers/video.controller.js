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

  const cookiesPath = await downloadCookies();
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  const isSpotify = videoURL.includes('spotify.com');

  // 1. Resolve Target URL (Spotify -> YouTube or Direct)
  let targetURL = videoURL;
  let spotifyData = null;

  if (isSpotify) {
    spotifyData = await resolveSpotifyToYoutube(videoURL, cookieArgs, (status, progress) => {
      if (clientId) {
        sendEvent(clientId, { status, progress });
      }
    });
    targetURL = spotifyData.targetUrl;
  }

  console.log(`[Info] Target URL: ${targetURL}`);

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
  if (clientId) sendEvent(clientId, { status: 'initializing', progress: 90 });

  const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.${format}`);
  const coverPath = path.join(TEMP_DIR, `${clientId}_cover.jpg`);
  const sanitizedTitle = (finalMetadata.title || title).replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
  const filename = `${sanitizedTitle}.${format}`;

  try {
    if (clientId) sendEvent(clientId, { status: 'downloading', progress: 0 });

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

    // 4. Spawn Download
    const videoProcess = spawnDownload(
      targetURL,
      {
        format,
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
            const progress = Math.round(percentage * 0.95);
            
            sendEvent(clientId, {
              status: 'downloading',
              progress: progress
            });
          }
        }
        
        if (clientId && (line.includes('[Merger]') || line.includes('[ExtractAudio]'))) {
          sendEvent(clientId, { status: 'merging', progress: 98 });
        }
      });
    });

    videoProcess.stderr.on('data', data => {
      console.error(`[yt-dlp Download Error] ${data.toString()}`);
    });

    videoProcess.on('close', async code => {
      if (code === 0) {
        if (clientId) sendEvent(clientId, { status: 'merging', progress: 99 });

        // 5. Post-process (Tagging)
        try {
          await injectMetadata(tempFilePath, { ...finalMetadata, coverFile: finalCoverPath });
        } catch (tagError) {
          console.warn('[Metadata] Injection failed but continuing:', tagError.message);
        }

        if (clientId) sendEvent(clientId, { status: 'sending', progress: 99 });
        
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