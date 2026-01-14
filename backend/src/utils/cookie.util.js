const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadCookies() {
    const cookieUrl = process.env.COOKIE_URL;
    if (!cookieUrl) return null;

    const cookiesPath = path.join(__dirname, '../../temp_cookies.txt');
    
    return new Promise((resolve) => {
        const file = fs.createWriteStream(cookiesPath);
        https.get(cookieUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('Remote cookies downloaded successfully');
                resolve(cookiesPath);
            });
        }).on('error', (err) => {
            console.error('Error downloading cookies:', err);
            resolve(null);
        });
    });
}

module.exports = { downloadCookies };
