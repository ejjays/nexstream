import { createClient } from '@libsql/client/http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
let client: any = null;

try {
  const url = process.env.TURSO_URL?.replace('libsql://', 'https://');
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url && authToken) {
    client = createClient({
      url,
      authToken,
    });
    console.log('[DB] Connected to Turso');
  } else {
    console.warn('[DB] Turso credentials missing, running in local-only mode');
  }
} catch (error) {
  console.error('[DB] Connection failed:', (error as Error).message);
}

export default client;

export async function queryConfig(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    const result = await client.execute({
      sql: 'SELECT value FROM configs WHERE key = ? LIMIT 1',
      args: [key],
    });
    return result.rows[0]?.value as string;
  } catch (error) {
    console.error(
      `[DB] Config lookup failed for ${key}:`,
      (error as Error).message
    );
    return null;
  }
}

export async function saveSession(
  sessionId: string,
  url: string
): Promise<void> {
  if (!client) return;
  try {
    await client.execute({
      sql: 'INSERT INTO sessions (id, url, created_at) VALUES (?, ?, ?)',
      args: [sessionId, url, Date.now()],
    });
  } catch (error) {
    console.error('[DB] Session save failed:', (error as Error).message);
  }
}

export async function cleanupOldSessions(): Promise<void> {
  if (!client) return;
  try {
    const dayAgo = Date.now() - 86400000;
    await client.execute({
      sql: 'DELETE FROM sessions WHERE created_at < ?',
      args: [dayAgo],
    });
  } catch (error) {
    console.error('[DB] Session cleanup failed:', (error as Error).message);
  }
}
