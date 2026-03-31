const fs = require("fs");
const path = require("path");
const https = require("https");

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

  if (!cookieUrl) return null;

  const filename = `${type}_cookies.txt`;
  const cookiesPath = path.join(__dirname, `../../${filename}`);
  const now = Date.now();

  const fileExists = fs.existsSync(cookiesPath);
  const isValid = fileExists && isValidCookieFile(cookiesPath);
  const cached = cookieCache.get(type);

  // use existing file
  if (isValid && cached && now - cached < CACHE_DURATION) {
    return cookiesPath;
  }

  // background refresh file
  if (isValid) {
    downloadCookiesBackground(type, cookieUrl, cookiesPath).catch(() => {});
    return cookiesPath;
  }

  // block with timeout
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
  try {
    return await Promise.race([downloadCookiesBackground(type, cookieUrl, cookiesPath), timeoutPromise]);
  } catch (e) {
    console.warn(`[Cookies] ${type} download timed out. Using fallback.`);
    return isValidCookieFile(cookiesPath) ? cookiesPath : null;
  }
}

async function downloadCookiesBackground(type, cookieUrl, cookiesPath) {
  return new Promise((resolve) => {
    https
      .get(cookieUrl, (response) => {
        if (response.statusCode !== 200) {
          console.error(
            `[Cookies] Failed to download ${type} cookies: Status ${response.statusCode}`,
          );
          return resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
        }

        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          if (data.includes("# Netscape") || data.includes("HttpOnly_")) {
            fs.writeFileSync(cookiesPath, data);
            cookieCache.set(type, Date.now());
            console.log(`[Cookies] ${type} cookies refreshed`);
            resolve(cookiesPath);
          } else {
            resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
          }
        });
      })
      .on("error", (err) => {
        resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
      });
  });
}

module.exports = {
  downloadCookies,
};
