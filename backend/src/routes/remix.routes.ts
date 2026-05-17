import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import db from '../utils/db.util.js';
import { extractSongData } from "../services/extract.service.js";
import { spawn } from 'child_process';
import { Readable } from 'node:stream';
import { z } from 'zod';

const EngineStartResponseSchema = z.object({
  task_id: z.string().optional(),
  message: z.string().optional()
}).catchall(z.unknown());

const EngineStatusResponseSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z.object({
    stems: z.record(z.string(), z.string().nullable().optional()).optional(),
    package: z.string().nullable().optional()
  }).catchall(z.unknown()).optional()
}).catchall(z.unknown());

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
  if (!url) {
    res.status(400).json({ error: 'URL required' });
    return;
  }
  ACTIVE_ENGINE_URL = url;
  res.json({ success: true, url: ACTIVE_ENGINE_URL });
});

router.get('/engine-status', (_req: Request, res: Response) => {
  res.json({ url: ACTIVE_ENGINE_URL });
});

router.post('/process', upload.single('file'), async (req: Request, res: Response) => {
  if (!ACTIVE_ENGINE_URL) {
    res.status(400).json({ error: 'Engine not connected' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

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
        const rawErr = await startRes.json().catch(() => ({}));
        const startData = EngineStartResponseSchema.safeParse(rawErr);
        const errMessage = startData.success ? startData.data.message : undefined;
        throw new Error(errMessage || `Engine error ${startRes.status}`);
    }

    const rawStartData = await startRes.json();
    const startData = EngineStartResponseSchema.safeParse(rawStartData);
    if (!startData.success || !startData.data.task_id) {
        throw new Error('Failed to get task_id from engine');
    }
    const task_id = startData.data.task_id;

    let attempts = 0;
    const maxAttempts = 240;
    const poll = async () => {
      attempts++;
      try {
        const statusRes = await fetch(`${engineUrl}/status/${task_id}`);
        if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.status}`);
        const rawTaskData = await statusRes.json();
        const taskParsed = EngineStatusResponseSchema.safeParse(rawTaskData);
        if (!taskParsed.success) {
            throw new Error(`Engine status parse error: ${taskParsed.error.message}`);
        }
        const task = taskParsed.data;
        if (task.status === 'success') {
          const finalData = task.data;
          if (!finalData || !finalData.stems) throw new Error('Missing stems data');
          Object.keys(finalData.stems).forEach(key => {
            if (finalData.stems?.[key]) {
              finalData.stems[key] = `${engineUrl}/download?path=${encodeURIComponent(finalData.stems[key])}`;
            }
          });
          if (finalData.package) {
            finalData.package = `${engineUrl}/download?path=${encodeURIComponent(finalData.package)}`;
          }
          res.json(finalData);
          return;
        } else if (task.status === 'error') {
          throw new Error(task.message || 'Unknown engine error');
        }
        if (attempts >= maxAttempts) throw new Error('Processing timed out');
        setTimeout(poll, 5000);
      } catch (err: unknown) {
        if (!res.headersSent) res.status(500).json({ error: `polling failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    };
    setTimeout(poll, 5000);
  } catch (err: unknown) {
    if (!res.headersSent) res.status(500).json({ error: `engine failed: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

router.post('/wake-engine', (req: Request, res: Response) => {
  const now = Date.now();
  if (now - LAST_WAKE_TIME < 60000) {
     res.json({ status: 'throttled', message: 'Wake-up in progress' });
     return;
  }
  LAST_WAKE_TIME = now;
  ACTIVE_ENGINE_URL = null;
  const scriptsDir = path.join(__dirname, '../../../scripts');
  const KAGGLE_TMP_DIR = '/tmp/.kaggle';
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
      if (!fs.existsSync(KAGGLE_TMP_DIR)) fs.mkdirSync(KAGGLE_TMP_DIR, { recursive: true });
      fs.writeFileSync(path.join(KAGGLE_TMP_DIR, 'kaggle.json'), JSON.stringify({ username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY }));
  }
  spawn('kaggle', ['kernels', 'push', '-p', '.', '--accelerator', 'NvidiaTeslaT4'], { 
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
    if (!response.body) throw new Error('No response body');
    const stream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
    stream.pipe(writer);
    return new Promise<void>((resolve, reject) => {
      writer.on('finish', () => { clearTimeout(timeoutId); resolve(); });
      writer.on('error', (err: Error) => { clearTimeout(timeoutId); reject(err); });
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

router.post('/save', async (
  req: Request<Record<string, unknown>, Record<string, unknown>, {
    id: string;
    name: string;
    stems: Record<string, string>;
    chords: string[];
    beats: number[];
    tempo: number;
    engine?: string;
  }>,
  res: Response
) => {
  const { id, name, stems, chords, beats, tempo, engine } = req.body;
  try {
    const localStems: Record<string, string> = {};
    const downloadTasks: Promise<void>[] = [];
    for (const [key, url] of Object.entries(stems)) {
      if (url) {
        downloadTasks.push((async () => {
          await downloadStem(url, id, key);
          localStems[key] = `/api/remix/stems/${id}/${key}.wav`;
        })());
      }
    }
    await Promise.all(downloadTasks);
    if (db) {
      const database = db as {
        execute: (options: { sql: string; args: (string | number)[] }) => Promise<unknown>;
      };
      await database.execute({
        sql: "INSERT INTO remix_history (id, name, stems, chords, beats, tempo, engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          id,
          name,
          JSON.stringify(localStems),
          JSON.stringify(chords),
          JSON.stringify(beats),
          tempo,
          engine || 'Demucs',
          Date.now(),
        ],
      });
    }
    res.json({ success: true, localStems });
  } catch (_err: unknown) {
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
    return;
  }
  res.status(404).send('Stem not found');
});

router.get('/history', async (_req: Request, res: Response) => {
  if (!db) {
    return res.json([]);
  }
  try {
    const result = await (db as { execute(query: string): Promise<{ rows: { id: number; name: string; stems: string; chords: string; beats: string; tempo: number; engine: string; created_at: string; }[] }> }).execute("SELECT * FROM remix_history ORDER BY created_at DESC LIMIT 15");
    const history = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      stems: JSON.parse(row.stems),
      chords: JSON.parse(row.chords),
      beats: JSON.parse(row.beats),
      tempo: row.tempo,
      engine: row.engine,
      date: new Date(row.created_at).toLocaleDateString()
    }));
    return res.json(history);
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.post('/rename', async (req: Request, res: Response) => {
  const { id, name } = req.body as { id: string; name: string };
  if (!db) {
    return res.status(500).json({ error: 'DB not initialized' });
  }
  try {
    await db.execute({ sql: "UPDATE remix_history SET name = ? WHERE id = ?", args: [name, id] });
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to rename' });
  }
});

router.delete('/delete/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) {
    return res.status(500).json({ error: 'DB not initialized' });
  }
  try {
    await db.execute({ sql: "DELETE FROM remix_history WHERE id = ?", args: [id] });
    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    return res.json({ success: true });
  } catch (_err: unknown) {
    return res.status(500).json({ error: 'Failed to delete' });
  }
});

router.get('/export/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) return res.status(500).json({ error: 'DB not initialized' });
  try {
    const result = await (db as { execute: (options: { sql: string; args: string[] }) => Promise<{ rows: Array<{ id: string; name: string; stems: string; chords: string; beats: string; tempo: number; engine: string; }> }> }).execute({ sql: "SELECT * FROM remix_history WHERE id = ?", args: [id] });
    if (result.rows.length === 0) return res.status(404).send('Not found');
    const row = result.rows[0];
    const targetDir = path.join(STEMS_BASE_DIR, id);
    
    if (!fs.existsSync(targetDir)) {
      return res.status(404).send('Project directory not found on server');
    }

    const metadata = { 
      id: row.id, 
      name: row.name, 
      stems: JSON.parse(row.stems), 
      chords: JSON.parse(row.chords), 
      beats: JSON.parse(row.beats), 
      tempo: row.tempo, 
      engine: row.engine 
    };
    
    fs.writeFileSync(path.join(targetDir, 'project.json'), JSON.stringify(metadata, null, 2));
    
    const safeName = (row.name || row.id).replace(/["\r\n]/gu, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);
    
    const zipProcess = spawn('zip', ['-q', '-r', '-', '.'], { cwd: targetDir });
    
    zipProcess.stdout.pipe(res);
    
    zipProcess.stderr.on('data', (data) => {
      console.error(`zip stderr: ${data}`);
    });

    zipProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`zip process exited with code ${code}`);
        if (!res.headersSent) res.status(500).send('Zip generation failed');
      }
    });
    return;
  } catch (err) {
    console.error('Export exception:', err);
    if (!res.headersSent) {
      res.status(500).send('Export failed');
      return;
    }
    return;
  }
});

router.get('/extract/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const projectDir = path.join(STEMS_BASE_DIR, id);
  const mixPath = path.join(projectDir, 'temp_mix.wav');
  if (!fs.existsSync(mixPath)) {
    const stemsToMix = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano']
      .map(s => path.join(projectDir, `${s}.wav`))
      .filter(p => fs.existsSync(p));
    if (stemsToMix.length === 0) {
        res.status(404).json({ error: 'Audio not found' });
        return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const ffmpegArgs: string[] = [];
        stemsToMix.forEach(s => ffmpegArgs.push('-i', s));
        ffmpegArgs.push('-filter_complex', `amix=inputs=${stemsToMix.length}:duration=longest`, '-y', mixPath);
        const ff = spawn('ffmpeg', ffmpegArgs);
        ff.on('close', code => (code === 0 ? resolve() : reject(new Error('FFmpeg failed'))));
      });
    } catch (_e: unknown) {
        res.status(500).json({ error: 'Failed to prepare audio' });
        return;
    }
  }
  try {
      type DbResult = { rows: { chords: string }[] };
      type DbClient = { execute(opts: { sql: string; args: string[] }): Promise<DbResult> };
      const dbClient = db as unknown as DbClient;
      let engineChords: string[] = [];
      const dbResult = await dbClient.execute({ sql: "SELECT chords FROM remix_history WHERE id = ?", args: [id] });
      if (dbResult.rows.length > 0) engineChords = JSON.parse(dbResult.rows[0].chords) as string[];
      const data = await extractSongData(mixPath, engineChords.map(s => ({ chord: String(s), is_passing: false })));
      return res.json(data);
  } catch (error: unknown) { return res.status(500).json({ error: error instanceof Error ? error.message : String(error) }); }
});

export default router;
