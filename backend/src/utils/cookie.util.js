const fs = require('fs');
const path = require('path');
const https = require('https');

let lastDownloadTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function downloadCookies() {
    const cookieUrl = process.env.COOKIES_URL;
    if (!cookieUrl) return null;

    const cookiesPath = path.join(__dirname, '../../temp_cookies.txt');
    const now = Date.now();

    // Return cached path if valid
    if (fs.existsSync(cookiesPath) && (now - lastDownloadTime < CACHE_DURATION)) {
        return cookiesPath;
    }
    
    return new Promise((resolve) => {
        const file = fs.createWriteStream(cookiesPath);
        https.get(cookieUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                lastDownloadTime = Date.now();
                console.log('Remote cookies refreshed');
                resolve(cookiesPath);
            });
        }).on('error', (err) => {
            console.error('Error downloading cookies:', err);
            resolve(fs.existsSync(cookiesPath) ? cookiesPath : null);
        });
    });
}

module.exports = { downloadCookies };
