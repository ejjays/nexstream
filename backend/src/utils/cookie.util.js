const fs = require("fs");
const path = require("path");
const https = require("https");

const cookieCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function isValidCookieFile(filePath) {
    if (!fs.existsSync(filePath))
        return false;
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

    if (!cookieUrl) {
        return null;
    }

    const filename = `${type}_cookies.txt`;
    const cookiesPath = path.join(__dirname, `../../${filename}`);
    const now = Date.now();

    const isCurrentValid = isValidCookieFile(cookiesPath);
    if (!isCurrentValid && fs.existsSync(cookiesPath)) {
        console.warn(`[Cookies] Current ${type} cookie file is invalid. Deleting.`);
        fs.unlinkSync(cookiesPath);
    }

    const cached = cookieCache.get(type);
    if (isValidCookieFile(cookiesPath) && (cached && now - cached < CACHE_DURATION)) {
        return cookiesPath;
    }

    if (isValidCookieFile(cookiesPath)) {
        downloadCookiesBackground(type, cookieUrl, cookiesPath).catch(() => {});
        return cookiesPath;
    }

    return downloadCookiesBackground(type, cookieUrl, cookiesPath);
}

async function downloadCookiesBackground(type, cookieUrl, cookiesPath) {
    return new Promise(resolve => {
        https.get(cookieUrl, response => {
            if (response.statusCode !== 200) {
                console.error(
                    `[Cookies] Failed to download ${type} cookies: Status ${response.statusCode}`
                );
                return resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
            }

            let data = "";
            response.on("data", chunk => data += chunk);
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
        }).on("error", err => {
            resolve(isValidCookieFile(cookiesPath) ? cookiesPath : null);
        });
    });
}

module.exports = {
    downloadCookies
};