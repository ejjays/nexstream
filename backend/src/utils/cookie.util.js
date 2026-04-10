const fs = require("fs");
const path = require("path");
const https = require("https");
const db = require("./db.util");

const cookieCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000;

function isValidCookieFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes("# Netscape") || content.includes("HttpOnly_");
  } catch (e) {
    return false;
  }
}

async function downloadCookies(type = "youtube") {
  const envKey = type === "facebook" ? "FB_COOKIES_URL" : "COOKIES_URL";
  const cookieUrl = process.env[envKey];

  const filename = `${type}_cookies.txt`;
  const cookiesPath = path.join(__dirname, `../../${filename}`);
  const now = Date.now();

  const fileExists = fs.existsSync(cookiesPath);
  const isValid = fileExists && isValidCookieFile(cookiesPath);
  const cached = cookieCache.get(type);

  // quick cache return
  if (isValid && cached && now - cached < CACHE_DURATION) {
    return cookiesPath;
  }

  // try database first (Fastest)
  if (db) {
    try {
      const res = await db.execute({
        sql: "SELECT content FROM cookies WHERE type = ? LIMIT 1",
        args: [type]
      });
      if (res.rows.length > 0) {
        fs.writeFileSync(cookiesPath, res.rows[0].content);
        cookieCache.set(type, now);
        // refresh background gist
        if (cookieUrl) downloadCookiesBackground(type, cookieUrl, cookiesPath);
        return cookiesPath;
      }
    } catch (e) {
      console.warn(`[Cookies] DB fetch failed for ${type}`);
    }
  }

  if (!cookieUrl) return isValid ? cookiesPath : null;

  // gist fallback
  if (isValid) {
    downloadCookiesBackground(type, cookieUrl, cookiesPath);
    return cookiesPath;
  }

  return await downloadCookiesBackground(type, cookieUrl, cookiesPath);
}

async function downloadCookiesBackground(type, cookieUrl, cookiesPath) {
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
            // sync to db
            if (db) {
              db.execute({
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

module.exports = {
  downloadCookies,
};
