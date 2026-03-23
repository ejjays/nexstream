const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const db = require('../utils/db.util');
const crypto = require('crypto');
const { extractSongData } = require("../services/extract.service");

const STEMS_BASE_DIR = path.join(__dirname, '../../temp/remix_stems');
if (!fs.existsSync(STEMS_BASE_DIR)) {
  fs.mkdirSync(STEMS_BASE_DIR, { recursive: true });
}

const upload = multer({ dest: path.join(__dirname, '../../temp/uploads') });

let ACTIVE_ENGINE_URL = null;
let LAST_WAKE_TIME = 0;

router.post('/register-engine', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  
  ACTIVE_ENGINE_URL = url;
  console.log(`[Engine] Registered new Kaggle Gradio URL: ${ACTIVE_ENGINE_URL}`);
  res.json({ success: true, url: ACTIVE_ENGINE_URL });
});

router.get('/engine-status', (req, res) => {
  res.json({ url: ACTIVE_ENGINE_URL });
});

router.post('/wake-engine', async (req, res) => {
  const now = Date.now();
  if (now - LAST_WAKE_TIME < 60000) { // Throttling: 1 wake per minute
     return res.json({ status: 'throttled', message: 'Wake-up already in progress. Please wait.' });
  }

  LAST_WAKE_TIME = now;
  ACTIVE_ENGINE_URL = null; // Clear old URL

  const { spawn } = require('child_process');
  const scriptsDir = path.join(__dirname, '../../../scripts');

  // Cloud-Setup for Kaggle credentials (Koyeb/Railway/Vercel)
  const KAGGLE_TMP_DIR = '/tmp/.kaggle';
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
      if (!fs.existsSync(KAGGLE_TMP_DIR)) fs.mkdirSync(KAGGLE_TMP_DIR, { recursive: true });
      const creds = JSON.stringify({ username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY });
      fs.writeFileSync(path.join(KAGGLE_TMP_DIR, 'kaggle.json'), creds);
  }
  
  console.log(`[Engine] Waking up Kaggle Kernel from ${scriptsDir}...`);
  
  const pushProcess = spawn('kaggle', ['kernels', 'push', '-p', '.', '--accelerator', 'NvidiaTeslaT4'], { 
    cwd: scriptsDir,
    env: { 
        ...process.env, 
        KAGGLE_CONFIG_DIR: process.env.KAGGLE_USERNAME ? KAGGLE_TMP_DIR : path.join(process.env.HOME, '.kaggle') 
    }
  });

  pushProcess.stdout.on('data', (data) => console.log(`[Kaggle Push] ${data}`));
  pushProcess.stderr.on('data', (data) => console.error(`[Kaggle Error] ${data}`));

  pushProcess.on('close', (code) => {
    if (code !== 0) {
       console.error(`[Engine] Kaggle push failed with code ${code}`);
    } else {
       console.log('[Engine] Kaggle kernel push successful. Waiting for Gradio registration...');
    }
  });

  res.json({ success: true, status: 'waking' });
});

async function downloadStem(url, id, stemName) {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol. Only HTTP and HTTPS are allowed.');
    }
    const forbiddenHosts = ['localhost', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (forbiddenHosts.includes(parsedUrl.hostname) || parsedUrl.hostname.endsWith('.local')) {
      throw new Error('Local network addresses are forbidden.');
    }
  } catch (err) {
    throw new Error('Invalid stem URL: ' + err.message);
  }

  const dir = path.join(STEMS_BASE_DIR, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const localPath = path.join(dir, `${stemName}.wav`);
  const writer = fs.createWriteStream(localPath);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

router.post('/save', async (req, res) => {
  const { id, name, stems, chords, beats, tempo, engine } = req.body;

  try {
    const localStems = {};
    for (const [key, url] of Object.entries(stems)) {
      if (url) {
        await downloadStem(url, id, key);
        localStems[key] = `/api/remix/stems/${id}/${key}.wav`;
      }
    }

    if (db) {
      await db.execute({
        sql: `INSERT INTO remix_history (id, name, stems, chords, beats, tempo, engine, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, 
          name, 
          JSON.stringify(localStems), 
          JSON.stringify(chords), 
          JSON.stringify(beats), 
          tempo, 
          engine || 'Demucs',
          Date.now()
        ]
      });
    }

    res.json({ success: true, localStems });
  } catch (err) {
    console.error('Save failed:', err);
    res.status(500).json({ error: 'Failed to persist remix data' });
  }
});

router.get('/stems/:id/:file', (req, res) => {
  const { id, file } = req.params;
  
  const safePattern = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
  const safeIdPattern = /^[a-zA-Z0-9_\-\s]+$/;
  
  if (!safeIdPattern.test(id) || !safePattern.test(file)) {
    return res.status(400).send('Invalid path parameters');
  }

  const filePath = path.join(STEMS_BASE_DIR, id, file);
  const resolvedBase = path.resolve(STEMS_BASE_DIR);
  const resolvedPath = path.resolve(filePath);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    return res.status(403).send('Access denied');
  }
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wav') {
      res.setHeader('Content-Type', 'audio/wav');
    } else if (ext === '.ogg') {
      res.setHeader('Content-Type', 'audio/ogg');
    } else {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
    res.sendFile(filePath);
  } else {
    res.status(404).send('Stem not found');
  }
});

router.get('/history', async (req, res) => {
  if (!db) return res.json([]);
  
  try {
    const result = await db.execute("SELECT * FROM remix_history ORDER BY created_at DESC LIMIT 15");
    const history = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      stems: JSON.parse(row.stems),
      chords: JSON.parse(row.chords),
      beats: JSON.parse(row.beats),
      tempo: row.tempo,
      engine: row.engine,
      date: new Date(row.created_at).toLocaleDateString()
    }));
    res.json(history);
  } catch (err) {
    console.error('History fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.patch('/history/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!db) return res.status(500).json({ error: 'DB not initialized' });
  
  try {
    await db.execute({
      sql: "UPDATE remix_history SET name = ? WHERE id = ?",
      args: [name, id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Rename failed:', err);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

router.delete('/history/:id', async (req, res) => {
  const { id } = req.params;
  if (!db) return res.status(500).json({ error: 'DB not initialized' });

  try {
    await db.execute({
      sql: "DELETE FROM remix_history WHERE id = ?",
      args: [id]
    });

    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete failed:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.get('/export/:id', async (req, res) => {
  const { id } = req.params;
  if (!db) return res.status(500).json({ error: 'DB not initialized' });

  try {
    const result = await db.execute({
      sql: "SELECT * FROM remix_history WHERE id = ?",
      args: [id]
    });

    if (result.rows.length === 0) return res.status(404).send('Not found');

    const row = result.rows[0];
    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (!fs.existsSync(targetDir)) return res.status(404).send('Files missing');

    const metadata = {
      id: row.id,
      name: row.name,
      stems: JSON.parse(row.stems),
      chords: JSON.parse(row.chords),
      beats: JSON.parse(row.beats),
      tempo: row.tempo,
      engine: row.engine
    };

    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(metadata));

    const safeName = row.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.nexremix"`);

    const { spawn } = require('child_process');
    const zipProcess = spawn('zip', ['-q', '-r', '-0', '-', '.'], { cwd: targetDir });

    zipProcess.stdout.pipe(res);
    zipProcess.stderr.on('data', data => {
      const msg = data.toString();
      if (!msg.includes('warning')) console.error('Zip Error:', msg);
    });

  } catch (err) {
    console.error('Export failed:', err);
    if (!res.headersSent) res.status(500).send('Export failed');
  }
});

router.post('/import', upload.single('projectZip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const zipPath = req.file.path;
  const newId = `${Date.now()}-imported`;
  const targetDir = path.join(STEMS_BASE_DIR, newId);
  const tempExtractDir = path.join(STEMS_BASE_DIR, `temp_${crypto.randomBytes(8).toString('hex')}`);

  try {
    fs.mkdirSync(tempExtractDir, { recursive: true });

    const { spawn } = require('child_process');
    const unzipProcess = spawn('unzip', ['-q', zipPath, '-d', tempExtractDir]);

    await new Promise((resolve, reject) => {
      unzipProcess.on('close', code => {
        if (code === 0 || code === 1) resolve(); // 1 means warnings
        else reject(new Error(`Unzip failed with code ${code}`));
      });
    });

    const projectJsonPath = path.join(tempExtractDir, 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
       throw new Error('Invalid project file: missing project.json');
    }

    const metadata = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
    fs.mkdirSync(targetDir, { recursive: true });

    const localStems = {};
    const expectedStems = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];
    
    for (const stem of expectedStems) {
      let tempStemPath = path.join(tempExtractDir, `${stem}.wav`);
      if (!fs.existsSync(tempStemPath)) tempStemPath = path.join(tempExtractDir, `${stem}.mp3`);
      if (!fs.existsSync(tempStemPath)) tempStemPath = path.join(tempExtractDir, `${stem}.ogg`);

      if (fs.existsSync(tempStemPath)) {
        const ext = path.extname(tempStemPath);
        const targetStemPath = path.join(targetDir, `${stem}${ext}`);
        fs.renameSync(tempStemPath, targetStemPath);
        localStems[stem] = `/api/remix/stems/${newId}/${stem}${ext}`;
      }
    }

    if (db) {
      await db.execute({
        sql: `INSERT INTO remix_history (id, name, stems, chords, beats, tempo, engine, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId, 
          metadata.name, 
          JSON.stringify(localStems), 
          JSON.stringify(metadata.chords || []), 
          JSON.stringify(metadata.beats || []), 
          metadata.tempo || 0, 
          metadata.engine || 'Imported',
          Date.now()
        ]
      });
    }

    res.json({
      success: true,
      project: {
        id: newId,
        name: metadata.name,
        stems: localStems,
        chords: metadata.chords || [],
        beats: metadata.beats || [],
        tempo: metadata.tempo || 0
      }
    });

  } catch (err) {
    console.error('Import failed:', err);
    res.status(500).json({ error: err.message || 'Failed to import project' });
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
});

// --- Lyrics & Chords Extraction Route ---
router.get('/extract/:id', async (req, res) => {
  const { id } = req.params;
  
  const safeIdPattern = /^[a-zA-Z0-9_\-\s]+$/;
  if (!safeIdPattern.test(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  let projectDir = path.join(STEMS_BASE_DIR, id);
  let resolvedBase = path.resolve(STEMS_BASE_DIR);
  let resolvedPath = path.resolve(projectDir);

  if (id === 'demo-1' || id === 'demo-2') {
     const demoFolder = id === 'demo-1' ? 'demo1' : 'demo2';
     projectDir = path.resolve(__dirname, '../../../frontend/public/demo_songs', demoFolder);
     resolvedBase = path.resolve(__dirname, '../../../frontend/public/demo_songs');
     resolvedPath = path.resolve(projectDir);
  }

  if (!resolvedPath.startsWith(resolvedBase)) {
     return res.status(403).json({ error: 'Access denied' });
  }

  const { spawn } = require('child_process');
  const mixPath = path.join(projectDir, 'temp_mix.wav');
  
  if (!fs.existsSync(mixPath)) {
    const stemsToMix = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
      .map(stem => path.join(projectDir, `${stem}.wav`))
      .filter(p => fs.existsSync(p));

    if (stemsToMix.length === 0) {
      const otherStems = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
        .flatMap(stem => [path.join(projectDir, `${stem}.mp3`), path.join(projectDir, `${stem}.ogg`)])
        .filter(p => fs.existsSync(p));
      
      if (otherStems.length > 0) {
         stemsToMix.push(...otherStems);
      } else {
        return res.status(404).json({ error: 'Audio stems not found to analyze' });
      }
    }

    try {
      await new Promise((resolve, reject) => {
        const ffmpegArgs = [];
        stemsToMix.forEach(stem => {
          ffmpegArgs.push('-i', stem);
        });
        
        ffmpegArgs.push('-filter_complex', `amix=inputs=${stemsToMix.length}:duration=longest`);
        ffmpegArgs.push('-y', mixPath);

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        
        ffmpegProcess.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('ffmpeg mixing failed'));
        });
        
        ffmpegProcess.on('error', reject);
      });
    } catch (err) {
       console.error("FFmpeg mixing error:", err);
       return res.status(500).json({ error: 'Failed to prepare audio for analysis' });
    }
  }
  
  const targetStem = mixPath;

  if (!fs.existsSync(targetStem)) {
     return res.status(404).json({ error: 'Audio stem not found to analyze' });
  }

  try {
      
      // Load chords from project to feed to AI
      let engineChords = [];
      const projectJsonPath = require('path').join(projectDir, 'project.json');
      if (require('fs').existsSync(projectJsonPath)) {
          try {
             const projData = JSON.parse(require('fs').readFileSync(projectJsonPath, 'utf8'));
             if (projData.chords) engineChords = projData.chords;
          } catch(e){}
      } else if (require('../utils/db.util')) {
         try {
             const dbResult = await require('../utils/db.util').execute({ sql: "SELECT chords FROM remix_history WHERE id = ?", args: [id] });
             if (dbResult.rows.length > 0) {
                 engineChords = JSON.parse(dbResult.rows[0].chords);
             }
         } catch(e){}
      }
      
      const data = await extractSongData(targetStem, engineChords);

      res.json(data);
  } catch (error) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: error.message || 'Failed to extract song data' });
  }
});

module.exports = router;
