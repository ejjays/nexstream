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

// Helper to download stems from Gradio to local server
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

// Endpoint to save analysis from frontend
router.post('/save', async (req, res) => {
  const { id, name, stems, chords, beats, tempo, engine } = req.body;

  try {
    // 1. Download Gradio files to local storage immediately so they don't expire
    const localStems = {};
    for (const [key, url] of Object.entries(stems)) {
      if (url) {
        await downloadStem(url, id, key);
        // Our server will serve them from this local path
        localStems[key] = `/api/remix/stems/${id}/${key}.mp3`;
      }
    }

    // 2. Save Metadata to Turso for 3-day persistence
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
  const filePath = path.join(STEMS_BASE_DIR, id, file);
  
  if (fs.existsSync(filePath)) {
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

module.exports = router;
