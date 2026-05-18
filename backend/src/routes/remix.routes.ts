import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import db from '../utils/db.util.js';
import { extractSongData } from "../services/extract.service.js";
import { spawn } from 'child_process';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import os from 'node:os';
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

const sessionEngines = new Map<string, string>();
let LAST_WAKE_TIME = 0;

router.post('/register-engine', (req: Request, res: Response) => {
  const { url, session_id } = req.body;
  console.log(`[Engine] Registration attempt: session=${session_id} url=${url}`);
  
  if (!url || !session_id) {
    console.error(`[Engine] Registration failed: Missing url or session_id`);
    res.status(400).json({ error: 'URL and session_id required' });
    return;
  }
  sessionEngines.set(session_id, url);
  console.log(`[Engine] Successfully registered: ${session_id} -> ${url}`);
  res.json({ success: true, url: url, session_id });
});

router.get('/engine-status', (req: Request, res: Response) => {
  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    res.json({ url: null, error: 'session_id required' });
    return;
  }
  const url = sessionEngines.get(sessionId) || null;
  if (url) console.log(`[Engine] Status check: session=${sessionId} found=${url}`);
  res.json({ url });
});

router.post('/process', upload.single('file'), async (req: Request, res: Response) => {
  const { engine, stems, session_id } = req.body;
  console.log(`[Process] Request received: engine=${engine} stems=${stems} session_id=${session_id}`);
  
  const engineUrlRaw = session_id ? sessionEngines.get(session_id) : null;
  console.log(`[Process] Engine lookup: session_id=${session_id} -> url=${engineUrlRaw}`);

  if (!engineUrlRaw) {
    console.error(`[Process] Failed: No engine mapped for session ${session_id}`);
    res.status(400).json({ error: 'Engine not connected or session expired' });
    return;
  }
  if (!req.file) {
    console.error(`[Process] Failed: No file uploaded`);
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
    form.append('file', fileBlob, req.file.originalname);
    form.append('engine', engine || 'Demucs');
    form.append('stems', stems || '4 Stems');

    const engineUrl = engineUrlRaw.replace(/\/$/, '');
    console.log(`[Process] Forwarding to engine: ${engineUrl}/process`);
    
    const startRes = await fetch(`${engineUrl}/process`, {
      method: 'POST',
      body: form
    });

    console.log(`[Process] Engine response status: ${startRes.status}`);

    if (!startRes.ok) {
        const rawErr = await startRes.json().catch(() => ({}));
        console.error(`[Process] Engine error response:`, rawErr);
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

router.post('/wake-engine', async (req: Request, res: Response) => {
  let { kaggleUsername, kaggleKey, backendUrl } = req.body;
  
  // fallback to DB
  if (!backendUrl || backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')) {
    try {
      const dbResult = await db?.execute<{ value: string }>({
        sql: "SELECT value FROM configs WHERE key = 'BACKEND_URL' LIMIT 1",
        args: []
      });
      if (dbResult && dbResult.rows.length > 0) {
        console.log(`[Engine] Overriding localhost with public URL from DB: ${dbResult.rows[0].value}`);
        backendUrl = dbResult.rows[0].value;
      }
    } catch (e) {
      console.error('[Engine] DB URL lookup failed:', e);
    }
  }

  console.log(`[Engine] Wake-engine request: user=${kaggleUsername} backendUrl=${backendUrl}`);
  
  const finalUsername = kaggleUsername || process.env.KAGGLE_USERNAME;
  const finalKey = kaggleKey || process.env.KAGGLE_KEY;

  if (!finalUsername || !finalKey) {
    res.status(401).json({ error: 'Kaggle credentials required' });
    return;
  }

  const sessionId = randomUUID();
  const tmpBase = os.tmpdir();
  const KAGGLE_TMP_DIR = path.join(tmpBase, `.kaggle-${sessionId}`);
  const WORKSPACE_DIR = path.join(tmpBase, `workspace-${sessionId}`);
  
  try {
    // isolate auth
    if (!fs.existsSync(KAGGLE_TMP_DIR)) fs.mkdirSync(KAGGLE_TMP_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(KAGGLE_TMP_DIR, 'kaggle.json'), 
      JSON.stringify({ username: finalUsername, key: finalKey })
    );

    // ephemeral metadata
    if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    
    const scriptsDir = path.join(__dirname, '../../../scripts');
    const metadataPath = path.join(scriptsDir, 'kernel-metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    
    // update metadata
    metadata.id = `${finalUsername}/nexstream-engine-${sessionId.substring(0, 8)}`;
    metadata.title = `NexStream Engine ${sessionId.substring(0, 8)}`;
    metadata.code_file = "run_engine.py";
    metadata.accelerator = "NvidiaTeslaT4"; // set accelerator
    
    fs.writeFileSync(path.join(WORKSPACE_DIR, 'kernel-metadata.json'), JSON.stringify(metadata));

    // inject env
    const engineScriptPath = path.join(scriptsDir, 'remix_lab_btc.py');
    const baseScript = fs.readFileSync(engineScriptPath, 'utf-8');
    const safeBackendUrl = JSON.stringify(backendUrl);
    const safeSessionId = JSON.stringify(sessionId);
    const injectedScript = `
import os
os.environ["NEXSTREAM_BACKEND_URL"] = ${safeBackendUrl}
os.environ["NEXSTREAM_SESSION_ID"] = ${safeSessionId}

${baseScript}
    `;
    fs.writeFileSync(path.join(WORKSPACE_DIR, 'run_engine.py'), injectedScript);

    // dispatch kaggle
    const kaggleProcess = spawn('kaggle', ['kernels', 'push', '-p', WORKSPACE_DIR, '--accelerator', 'NvidiaTeslaT4'], {
      detached: true,
      env: { ...process.env, KAGGLE_CONFIG_DIR: KAGGLE_TMP_DIR }
    });

    kaggleProcess.on('error', (err) => {
      console.error('Failed to spawn kaggle process:', err);
    });

    // cleanup dirs
    setTimeout(() => {
      try {
        if (fs.existsSync(KAGGLE_TMP_DIR)) fs.rmSync(KAGGLE_TMP_DIR, { recursive: true, force: true });
        if (fs.existsSync(WORKSPACE_DIR)) fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
      } catch (e) {
        console.error('Cleanup failed:', e);
      }
    }, 30000); // wait for push

    res.json({ success: true, status: 'waking', session_id: sessionId });
  } catch (error) {
    console.error('Kernel dispatch failed:', error);
    res.status(500).json({ error: 'Kernel dispatch failed' });
  }
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
    res.json([]);
    return;
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
    res.json(history);
    return;
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch history' });
    return;
  }
});

router.post('/rename', async (req: Request, res: Response) => {
  const { id, name } = req.body as { id: string; name: string };
  if (!db) {
    res.status(500).json({ error: 'DB not initialized' });
    return;
  }
  try {
    await db.execute({ sql: "UPDATE remix_history SET name = ? WHERE id = ?", args: [name, id] });
    res.json({ success: true });
    return;
  } catch (_err) {
    res.status(500).json({ error: 'Failed to rename' });
    return;
  }
});

router.delete('/delete/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) {
    res.status(500).json({ error: 'DB not initialized' });
    return;
  }
  try {
    await db.execute({ sql: "DELETE FROM remix_history WHERE id = ?", args: [id] });
    const targetDir = path.join(STEMS_BASE_DIR, id);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    res.json({ success: true });
    return;
  } catch (_err: unknown) {
    res.status(500).json({ error: 'Failed to delete' });
    return;
  }
});

router.get('/export/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!db) {
    res.status(500).json({ error: 'DB not initialized' });
    return;
  }
  try {
    const result = await (db as { execute: (options: { sql: string; args: string[] }) => Promise<{ rows: Array<{ id: string; name: string; stems: string; chords: string; beats: string; tempo: number; engine: string; }> }> }).execute({ sql: "SELECT * FROM remix_history WHERE id = ?", args: [id] });
    if (result.rows.length === 0) {
      res.status(404).send('Not found');
      return;
    }
    const row = result.rows[0];
    const targetDir = path.join(STEMS_BASE_DIR, id);
    
    if (!fs.existsSync(targetDir)) {
      res.status(404).send('Project directory not found on server');
      return;
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
    
    const zipProcess = spawn('zip', ['-q', '-r', '-', '.'], { 
      cwd: targetDir,
      detached: true
    });
    
    req.on('close', () => {
      if (zipProcess.pid) {
        try { process.kill(-zipProcess.pid, 'SIGKILL'); } catch { /* ignore */ }
      }
    });
    
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
  } catch (err) {
    console.error('Export exception:', err);
    if (!res.headersSent) res.status(500).send('Export failed');
  }
  return;
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
        const ff = spawn('ffmpeg', ffmpegArgs, { detached: true });
        
        const cleanup = () => {
          if (ff.pid) {
            try { process.kill(-ff.pid, 'SIGKILL'); } catch { /* ignore */ }
          }
        };
        req.on('close', cleanup);

        ff.on('close', code => {
          req.off('close', cleanup);
          (code === 0 ? resolve() : reject(new Error('FFmpeg failed')));
        });
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
      res.json(data);
      return;
  } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      return;
  }
});

export default router;
