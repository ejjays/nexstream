import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "node:url";
// Netscape cookies
import db from "./db.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cookieCache = new Map<string, number>();
const CACHE_DURATION = 30 * 60 * 1000;

function isValidCookieFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes("# Netscape") || content.includes("HttpOnly_");
  } catch (e) {
    return false;
  }
}

export async function downloadCookies(type: string = "youtube"): Promise<string | null> {
  const isMeta = type === "facebook" || type === "instagram";
  const envKey = isMeta ? "FB_COOKIES_URL" : "COOKIES_URL";
  const cookieUrl = process.env[envKey];

  const filename = `${type}_cookies.txt`;
  const cookiesPath = path.join(__dirname, `../../${filename}`);
  const now = Date.now();

  const fileExists = fs.existsSync(cookiesPath);
  const isValid = fileExists && isValidCookieFile(cookiesPath);
  const cached = cookieCache.get(type);

  if (isValid) {
    if (!cached || now - cached > CACHE_DURATION) {
       (async () => {
          try {
              if (db) {
                const res = await (db as any).execute({
                    sql: "SELECT content FROM cookies WHERE type = ? LIMIT 1",
                    args: [type]
                });
                if (res.rows.length > 0) {
                    fs.writeFileSync(cookiesPath, res.rows[0].content);
                    cookieCache.set(type, Date.now());
                }
              }
              if (cookieUrl) await downloadCookiesBackground(type, cookieUrl, cookiesPath);
          } catch (e) {}
       })();
    }
    return cookiesPath;
  }

  if (db) {
    try {
      const res = await (db as any).execute({
        sql: "SELECT content FROM cookies WHERE type = ? LIMIT 1",
        args: [type]
      });
      if (res.rows.length > 0) {
        fs.writeFileSync(cookiesPath, res.rows[0].content);
        cookieCache.set(type, now);
        if (cookieUrl) downloadCookiesBackground(type, cookieUrl, cookiesPath);
        return cookiesPath;
      }
    } catch (e) {
      console.warn(`[Cookies] DB fetch failed for ${type}`);
    }
  }

  if (!cookieUrl) return null;

  return await downloadCookiesBackground(type, cookieUrl, cookiesPath);
}

async function downloadCookiesBackground(type: string, cookieUrl: string, cookiesPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    https
      .get(cookieUrl, (response) => {
        if (response.statusCode !== 200) {
          return resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
        }

        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          if (data.includes("# Netscape") || data.includes("HttpOnly_")) {
            fs.writeFileSync(cookiesPath, data);
            cookieCache.set(type, Date.now());
            if (db) {
              (db as any).execute({
                sql: "INSERT OR REPLACE INTO cookies (type, content, updated_at) VALUES (?, ?, ?)",
                args: [type, data, Date.now()]
              }).catch(() => {});
            }
            console.log(`[Cookies] ${type} cookies synced`);
            resolve(cookiesPath);
          } else {
            resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
          }
        });
      })
      .on("error", () => {
        resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
      });
  });
}
