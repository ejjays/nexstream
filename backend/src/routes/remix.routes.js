const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const db = require('../utils/db.util');

const STEMS_BASE_DIR = path.join(__dirname, '../../temp/remix_stems');
if (!fs.existsSync(STEMS_BASE_DIR)) {
  fs.mkdirSync(STEMS_BASE_DIR, { recursive: true });
}

async function downloadStem(url, id, stemName) {
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

        await downloadStem(url, id, key);
      }
    }

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
  const filePath = path.join(STEMS_BASE_DIR, id, file);
  
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

module.exports = router;
