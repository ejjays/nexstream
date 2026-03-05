require('dotenv').config();
const { getVideoInfo } = require('../src/services/ytdlp/info');

const testUrl = 'https://www.facebook.com/facebook/videos/10153231379946729/';

async function debugFacebook() {
    try {
        console.log('Extracting raw yt-dlp data...');
        const info = await getVideoInfo(testUrl);
        
        console.log('--- RAW EXTRACTION RESULTS ---');
        console.log('Title:', info.title);
        console.log('Has formats key?', 'formats' in info);
        if (info.formats) {
            console.log('Formats length:', info.formats.length);
            if (info.formats.length > 0) {
                 console.log('First format keys:', Object.keys(info.formats[0]));
            }
        }
        console.log('Has entries?', 'entries' in info);
    } catch (err) {
        console.error('Extraction failed completely:', err.message);
    }
}

debugFacebook();
