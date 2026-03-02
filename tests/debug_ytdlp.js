const { getVideoInfo } = require('../src/services/ytdlp/info');
const { downloadCookies } = require('../src/utils/cookie.util');
require('dotenv').config({ path: './.env' });

async function test() {
    console.log('Testing getVideoInfo with Cookies...');
    try {
        const cookiesPath = await downloadCookies('youtube');
        console.log('Using cookies from:', cookiesPath);
        const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];
        const info = await getVideoInfo('https://youtu.be/nTbA7qrEsP0', cookieArgs);
        console.log('Success! Title:', info.title);
    } catch (e) {
        console.error('Test Failed!');
        console.error(e);
    }
}

test();
