const fs = require('fs');
const path = require('path');
const https = require('https');

const cookieCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function downloadCookies(type = 'youtube') {
    const envKey = type === 'facebook' ? 'FB_COOKIES_URL' : 'COOKIES_URL';
    const cookieUrl = process.env[envKey];
    
    if (!cookieUrl) {
        // console.warn(`[Cookies] No URL found for ${type}`);
        return null;
    }

    const filename = `${type}_cookies.txt`;
    const cookiesPath = path.join(__dirname, `../../${filename}`);
    const now = Date.now();

    // Return cached path if valid
    const cached = cookieCache.get(type);
    if (fs.existsSync(cookiesPath) && (cached && now - cached < CACHE_DURATION)) {
        return cookiesPath;
    }
    
    return new Promise((resolve) => {
        const file = fs.createWriteStream(cookiesPath);
        https.get(cookieUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                cookieCache.set(type, Date.now());
                console.log(`[Cookies] ${type} cookies refreshed`);
                resolve(cookiesPath);
            });
        }).on('error', (err) => {
            console.error(`[Cookies] Error downloading ${type} cookies:`, err);
            resolve(fs.existsSync(cookiesPath) ? cookiesPath : null);
        });
    });
}

module.exports = { downloadCookies };