import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import db from '../utils/db.util.js';
import { extractSongData } from "../services/extract.service.js";
import { spawn } from 'child_process';
import { Readable } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const STEMS_BASE_DIR = path.join(__dirname, '../../temp/remix_stems');
if (!fs.existsSync(STEMS_BASE_DIR)) {
  fs.mkdirSync(STEMS_BASE_DIR, { recursive: true });
}

const upload = multer({ dest: path.join(__dirname, '../../temp/uploads') });

let ACTIVE_ENGINE_URL: string | null = null;
let LAST_WAKE_TIME = 0;

router.post('/register-engine', (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  ACTIVE_ENGINE_URL = url;
  res.json({ success: true, url: ACTIVE_ENGINE_URL });
});

router.get('/engine-status', (req: Request, res: Response) => {
  res.json({ url: ACTIVE_ENGINE_URL });
});

router.post('/process', upload.single('file'), async (req: Request, res: Response) => {
  if (!ACTIVE_ENGINE_URL) return res.status(400).json({ error: 'Engine not connected' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { engine, stems } = req.body;
    const form = new FormData();
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
    form.append('file', fileBlob, req.file.originalname);
    form.append('engine', engine || 'Demucs');
    form.append('stems', stems || '4 Stems');

    const engineUrl = ACTIVE_ENGINE_URL.replace(/\/$/, '');
    const startRes = await fetch(`${engineUrl}/process`, {
      method: 'POST',
      body: form
    });

    if (!startRes.ok) {
        const errData: any = await startRes.json().catch(() => ({}));
        throw new Error(errData.message || `Engine error ${startRes.status}`);
    }

    const { task_id }: any = await startRes.json();
    if (!task_id) throw new Error('Failed to get task_id from engine');

    let attempts = 0;
    const maxAttempts = 240;
    const poll = async () => {
      attempts++;
      try {
        const statusRes = await fetch(`${engineUrl}/status/${task_id}`);
        if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.status}`);
        const task: any = await statusRes.json();
        if (task.status === 'success') {
          const finalData = task.data;
          Object.keys(finalData.stems).forEach(key => {
            if (finalData.stems[key]) {
              finalData.stems[key] = `${engineUrl}/download?path=${encodeURIComponent(finalData.stems[key])}`;
            }
          });
          if (finalData.package) {
            finalData.package = `${engineUrl}/download?path=${encodeURIComponent(finalData.package)}`;
          }
          return res.json(finalData);
        } else if (task.status === 'error') {
          throw new Error(task.message || 'Unknown engine error');
        }
        if (attempts >= maxAttempts) throw new Error('Processing timed out');
        setTimeout(poll, 5000);
      } catch (err: unknown) {
        const error = err as Error;
        if (!res.headersSent) res.status(500).json({ error: `polling failed: ${error.message}` });
      }
    };
    setTimeout(poll, 5000);
  } catch (err: unknown) {
    const error = err as Error;
    if (!res.headersSent) res.status(500).json({ error: `engine failed: ${error.message}` });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

router.post('/wake-engine', async (req: Request, res: Response) => {
  const now = Date.now();
  if (now - LAST_WAKE_TIME < 60000) {
     return res.json({ status: 'throttled', message: 'Wake-up in progress' });
  }
  LAST_WAKE_TIME = now;
  ACTIVE_ENGINE_URL = null;
  const scriptsDir = path.join(__dirname, '../../../scripts');
  const KAGGLE_TMP_DIR = '/tmp/.kaggle';
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
      if (!fs.existsSync(KAGGLE_TMP_DIR)) fs.mkdirSync(KAGGLE_TMP_DIR, { recursive: true });
      fs.writeFileSync(path.join(KAGGLE_TMP_DIR, 'kaggle.json'), JSON.stringify({ username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY }));
  }
  const pushProcess = spawn('kaggle', ['kernels', 'push', '-p', '.', '--accelerator', 'NvidiaTeslaT4'], { 
    cwd: scriptsDir,
    env: { ...process.env, KAGGLE_CONFIG_DIR: process.env.KAGGLE_USERNAME ? KAGGLE_TMP_DIR : path.join(process.env.HOME || '', '.kaggle') }
  });
  res.json({ success: true, status: 'waking' });
});

async function downloadStem(url: string, id: string, stemName: string): Promise<void> {
  const dir = path.join(STEMS_BASE_DIR, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `${stemName}.wav`);
  const writer = fs.createWriteStream(localPath);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const stream = Readable.fromWeb(response.body as any);
    stream.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => { clearTimeout(timeoutId); resolve(); });
      writer.on('error', (err) => { clearTimeout(timeoutId); reject(err); });
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

router.post('/save', async (req: Request, res: Response) => {
  const { id, name, stems, chords, beats, tempo, engine } = req.body;
  try {
    const localStems: any = {};
    const downloadTasks = [];
    for (const [key, url] of Object.entries(stems)) {
      if (url) {
        downloadTasks.push((async () => {
          await downloadStem(url as string, id, key);
          localStems[key] = `/api/remix/stems/${id}/${key}.wav`;
        })());
      }
    }
    await Promise.all(downloadTasks);
    if (db) {
      await (db as any).execute({
        sql: `INSERT INTO remix_history (id, name, stems, chords, beats, tempo, engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, name, JSON.stringify(localStems), JSON.stringify(chords), JSON.stringify(beats), tempo, engine || 'Demucs', Date.now()]
      });
    }
    res.json({ success: true, localStems });
  } catch (err) {
    res.status(500).json({ error: 'Failed to persist remix data' });
  }
});

router.get('/stems/:id/:file', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const file = String(req.params.file);
  const filePath = path.join(STEMS_BASE_DIR, id, file);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Stem not found');
  }
});

router.get('/history', async (req: Request, res: Response) => {
  if (!db) return res.json([]);
  try {
    const result = await (db as any).execute("SELECT * FROM remix_history ORDER BY created_at DESC LIMIT 15");
    const history = result.rows.map((row: any) => ({
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
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.patch('/history/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name } = req.body;
  if (!db) return res.status(500).json({ error: 'DB not initialized' });
  try {
    await (db as any).execute({ sql: "UPDATE remix_history SET name = ? WHERE id = ?", args: [name, id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename' });
  }
});

router.delete('/history/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) return res.status(500).json({ error: 'DB not initialized' });
  try {
    await (db as any).execute({ sql: "DELETE FROM remix_history WHERE id = ?", args: [id] });
    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.get('/export/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) return res.status(500).json({ error: 'DB not initialized' });
  try {
    const result = await (db as any).execute({ sql: "SELECT * FROM remix_history WHERE id = ?", args: [id] });
    if (result.rows.length === 0) return res.status(404).send('Not found');
    const row = result.rows[0];
    const targetDir = path.join(STEMS_BASE_DIR, id);
    const metadata = { id: row.id, name: row.name, stems: JSON.parse(row.stems), chords: JSON.parse(row.chords), beats: JSON.parse(row.beats), tempo: row.tempo, engine: row.engine };
    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(metadata));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${row.id}.nexremix"`);
    const zipProcess = spawn('zip', ['-q', '-r', '-0', '-', '.'], { cwd: targetDir });
    zipProcess.stdout.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Export failed');
  }
});

router.get('/extract/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  let projectDir = path.join(STEMS_BASE_DIR, id);
  const mixPath = path.join(projectDir, 'temp_mix.wav');
  if (!fs.existsSync(mixPath)) {
    const stemsToMix = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'].map(s => path.join(projectDir, `${s}.wav`)).filter(p => fs.existsSync(p));
    if (stemsToMix.length === 0) return res.status(404).json({ error: 'Audio not found' });
    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpegArgs: string[] = [];
        stemsToMix.forEach(s => ffmpegArgs.push('-i', s));
        ffmpegArgs.push('-filter_complex', `amix=inputs=${stemsToMix.length}:duration=longest`, '-y', mixPath);
        const ff = spawn('ffmpeg', ffmpegArgs);
        ff.on('close', code => code === 0 ? resolve() : reject());
      });
    } catch (e) { return res.status(500).json({ error: 'Failed to prepare audio' }); }
  }
  try {
      let engineChords = [];
      const dbResult = await (db as any)?.execute({ sql: "SELECT chords FROM remix_history WHERE id = ?", args: [id] });
      if (dbResult && dbResult.rows.length > 0) engineChords = JSON.parse(dbResult.rows[0].chords);
      const data = await extractSongData(mixPath, engineChords);
      res.json(data);
  } catch (error: unknown) { res.status(500).json({ error: (error as Error).message }); }
});

export default router;
