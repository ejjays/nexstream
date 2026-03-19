const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const db = require('../utils/db.util');
const crypto = require('crypto');

const STEMS_BASE_DIR = path.join(__dirname, '../../temp/remix_stems');
if (!fs.existsSync(STEMS_BASE_DIR)) {
  fs.mkdirSync(STEMS_BASE_DIR, { recursive: true });
}

async function downloadStem(url, id, stemName) {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol. Only HTTP and HTTPS are allowed.');
    }
    // Basic SSRF protection
    const forbiddenHosts = ['localhost', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (forbiddenHosts.includes(parsedUrl.hostname) || parsedUrl.hostname.endsWith('.local')) {
      throw new Error('Local network addresses are forbidden.');
    }
  } catch (err) {
    throw new Error('Invalid stem URL: ' + err.message);
  }

  const dir = path.join(STEMS_BASE_DIR, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const localPath = path.join(dir, `${stemName}.mp3`);
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

// Endpoint to save analysis from frontend
router.post('/save', async (req, res) => {
  const { id, name, stems, chords, beats, tempo, engine } = req.body;

  try {
    const localStems = {};
    for (const [key, url] of Object.entries(stems)) {
      if (url) {
        await downloadStem(url, id, key);
        localStems[key] = `/api/remix/stems/${id}/${key}.mp3`;
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

// Serve local stems
router.get('/stems/:id/:file', (req, res) => {
  const { id, file } = req.params;
  
  // Strict validation to prevent path traversal
  const safePattern = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
  if (!safePattern.test(id) || !safePattern.test(file)) {
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
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Stem not found');
  }
});

// Get History
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
    res.status(500).json([]);
  }
});

router.patch('/history/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  if (!db) return res.status(500).send('Database unavailable');
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid name' });

  try {
    // 1. Update database
    await db.execute({
      sql: "UPDATE remix_history SET name = ? WHERE id = ?",
      args: [name, id]
    });

    // 2. We don't actually need to rewrite project.json here because export dynamically builds project.json from db when generating the zip

    res.json({ success: true, name });
  } catch (err) {
    console.error('Rename Error:', err);
    res.status(500).json({ error: 'Failed to rename project' });
  }
});

router.delete('/history/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!db) return res.status(500).send('Database unavailable');

  try {
    // 1. Delete from database
    await db.execute({
      sql: "DELETE FROM remix_history WHERE id = ?",
      args: [id]
    });

    // 2. Delete files from disk
    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.get('/export/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!db) return res.status(500).send('Database unavailable');

  try {
    const result = await db.execute({
      sql: "SELECT * FROM remix_history WHERE id = ?",
      args: [id]
    });

    if (result.rows.length === 0) return res.status(404).send('Project not found');
    
    const row = result.rows[0];
    const targetDir = path.join(STEMS_BASE_DIR, id);

    if (!fs.existsSync(targetDir)) return res.status(404).send('Audio files expired or deleted from server.');

    const metadata = {
      name: row.name,
      chords: JSON.parse(row.chords),
      beats: JSON.parse(row.beats),
      tempo: row.tempo,
      engine: row.engine || 'Demucs'
    };
    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(metadata, null, 2));

    const safeName = row.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.nexremix.zip"`);

    const { spawn } = require('child_process');
    const zipProcess = spawn('zip', ['-q', '-r', '-0', '-', '.'], { cwd: targetDir });

    zipProcess.stdout.pipe(res);

    zipProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('adding:')) {
        console.error(`[Zip] ${msg}`);
      }
    });

    zipProcess.on('close', (code) => {
      fs.unlink(path.join(targetDir, 'project.json'), () => {});
      if (code !== 0) {
         console.error(`Zip process exited with code ${code}`);
         if (!res.headersSent) res.status(500).send('Zipping failed');
      }
    });

  } catch (err) {
    console.error('Export Error:', err);
    if (!res.headersSent) res.status(500).send('Export generation failed');
  }
});

const upload = multer({ 
  dest: path.join(__dirname, '../../temp/uploads'),
  limits: { fileSize: 4000 * 1024 * 1024 } // 2GB limit
});

router.post('/import', upload.single('projectZip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!db) return res.status(500).json({ error: 'Database unavailable' });

  const zipPath = req.file.path;
  const newId = `${Date.now()}-imported`;
  const targetDir = path.join(STEMS_BASE_DIR, newId);
  const tempExtractDir = path.join(STEMS_BASE_DIR, `temp_${crypto.randomBytes(8).toString('hex')}`);

  try {
    fs.mkdirSync(tempExtractDir, { recursive: true });

    const { spawn } = require('child_process');
    const unzipProcess = spawn('unzip', ['-q', zipPath, '-d', tempExtractDir]);

    unzipProcess.on('close', async (code) => {
      fs.unlink(zipPath, () => {});

      if (code !== 0) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'Failed to extract project zip' });
      }

      try {
        const projectJsonPath = path.join(tempExtractDir, 'project.json');
        if (!fs.existsSync(projectJsonPath)) {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Invalid project format: project.json missing' });
        }

        const metadata = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
        
        fs.mkdirSync(targetDir, { recursive: true });
        
        const localStems = {};
        const expectedStems = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];
        for (const stem of expectedStems) {
          const tempStemPath = path.join(tempExtractDir, `${stem}.mp3`);
          if (fs.existsSync(tempStemPath)) {
            const targetStemPath = path.join(targetDir, `${stem}.mp3`);
            fs.copyFileSync(tempStemPath, targetStemPath);
            localStems[stem] = `/api/remix/stems/${newId}/${stem}.mp3`;
          }
        }
        
        fs.rmSync(tempExtractDir, { recursive: true, force: true });

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
            metadata.engine || 'Demucs',
            Date.now()
          ]
        });

        res.json({ 
          success: true, 
          project: {
            id: newId,
            name: metadata.name,
            stems: localStems,
            chords: metadata.chords || [],
            beats: metadata.beats || [],
            tempo: metadata.tempo || 0,
            engine: metadata.engine || 'Demucs'
          }
        });

      } catch (innerErr) {
        console.error('Import Metadata Error:', innerErr.stack || innerErr);
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        res.status(500).json({ error: 'Failed to parse project data' });
      }
    });

  } catch (err) {
    console.error('Import Error:', err);
    fs.unlink(zipPath, () => {});
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    res.status(500).json({ error: 'Import failed' });
  }
});

module.exports = router;
