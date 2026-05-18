import { promises as fsAsync } from "node:fs";
import path from "path";
import https from "https";
import os from "os";
import { fileURLToPath } from "node:url";
// parse cookies
import db from "./db.util.js";
import { createRedisClient } from "./redis.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const redis = createRedisClient('CookieCache');
const cookieCache = new Map<string, number>();
const CACHE_DURATION = 30 * 60 * 1000;
async function getCachedCookie(type: string): Promise<number | null> {
  // check L1
  const cached = cookieCache.get(type);
  if (cached) return cached;

  // check Redis
  try {
    const redisCached = await redis.get(`cookie_ts:${type}`);
...
    if (redisCached) {
      const ts = parseInt(redisCached, 10);
      cookieCache.set(type, ts);
      return ts;
    }
  } catch (e) {
    console.warn('[CookieUtil] Redis fetch error:', (e as Error).message);
  }
  return null;
}

async function setCachedCookie(type: string, timestamp: number) {
  cookieCache.set(type, timestamp);
  try {
    await redis.set(`cookie_ts:${type}`, timestamp.toString(), 'PX', CACHE_DURATION);
  } catch (e) {
    console.warn('[CookieUtil] Redis save error:', (e as Error).message);
  }
}

async function isValidCookieFile(filePath: string): Promise<boolean> {
  try {
    await fsAsync.access(filePath);
    const content = await fsAsync.readFile(filePath, "utf8");
    return content.includes("# Netscape") || content.includes("HttpOnly_");
  } catch {
    return false;
  }
}

function downloadCookiesBackground(type: string, cookieUrl: string, cookiesPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    https
      .get(cookieUrl, (response) => {
        if (response.statusCode !== 200) {
          isValidCookieFile(cookiesPath).then(valid => resolve(valid ? cookiesPath : null));
          return;
        }

        let data = "";
        response.on("data", (chunk) => { data += chunk; });
        response.on("end", async () => {
          if (data.includes("# Netscape") || data.includes("HttpOnly_")) {
            await fsAsync.writeFile(cookiesPath, data);
            await setCachedCookie(type, Date.now());
            if (db) {
              (db as unknown as { execute: (options: { sql: string; args: unknown[] }) => Promise<void> }).execute({
                sql: "INSERT OR REPLACE INTO cookies (type, content, updated_at) VALUES (?, ?, ?)",
                args: [type, data, Date.now()]
              }).catch(() => { /* ignore db error */ });
            }
            console.log(`[Cookies] ${type} cookies synced`);
            resolve(cookiesPath);
          } else {
            isValidCookieFile(cookiesPath).then(valid => resolve(valid ? cookiesPath : null));
          }
        });
      })
      .on("error", () => {
        isValidCookieFile(cookiesPath).then(valid => resolve(valid ? cookiesPath : null));
      });
  });
}

export async function downloadCookies(type = "youtube"): Promise<string | null> {
  const isMeta = type === "facebook" || type === "instagram";
  const envKey = isMeta ? "FB_COOKIES_URL" : "COOKIES_URL";
  const cookieUrl = process.env[envKey];

  const filename = `${type}_cookies_${process.pid}.txt`;
  const cookiesPath = path.join(os.tmpdir(), filename);
  const now = Date.now();

  const isValid = await isValidCookieFile(cookiesPath);
  const cachedTs = await getCachedCookie(type);

  if (isValid) {
    if (!cachedTs || now - cachedTs > CACHE_DURATION) {
       (async () => {
          try {
              if (db) {
                const res = await db.execute<{ content: string }>({
                    sql: "SELECT content FROM cookies WHERE type = ? LIMIT 1",
                    args: [type]
                });
                if (res.rows.length > 0) {
                    await fsAsync.writeFile(cookiesPath, res.rows[0].content);
                    await setCachedCookie(type, Date.now());
                }
              }
              if (cookieUrl) await downloadCookiesBackground(type, cookieUrl, cookiesPath);
          } catch (e: unknown) {
            console.debug('[CookieUtil] DB fetch error in background:', (e as Error).message);
          }
       })().catch(err => console.error(`[CookieUtil] Background sync failed: ${err.message}`));
    }
    return cookiesPath;
  }

  if (db) {
    try {
      const res = await db.execute<{ content: string }>({
        sql: "SELECT content FROM cookies WHERE type = ? LIMIT 1",
        args: [type]
      });
      if (res.rows.length > 0) {
        await fsAsync.writeFile(cookiesPath, res.rows[0].content);
        await setCachedCookie(type, now);
        if (cookieUrl) await downloadCookiesBackground(type, cookieUrl, cookiesPath);
        return cookiesPath;
      }
    } catch {
      console.warn(`[Cookies] DB fetch failed for ${type}`);
    }
  }

  if (!cookieUrl) return null;

  return downloadCookiesBackground(type, cookieUrl, cookiesPath);
}
