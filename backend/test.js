const axios = require('axios');

async function getIsrcLikeABrowser(spotifyUrl) {
    try {
        // 1. Get the Track ID from your link
        const trackId = spotifyUrl.split('/track/')[1].split('?')[0];
        
        console.log(`XB is pretending to be a browser for ID: ${trackId}...`);

        // 2. These are the "Real Person" headers. 
        // They tell Groover: "I am a real Chrome browser on a phone."
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://groover.co/en/lp/free-tools/isrc-finder/',
            'Origin': 'https://groover.co',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Dest': 'empty'
        };

        // 3. Instead of "injecting code," we go straight to their data source
        const apiUrl = `https://api.groover.co/api/v1/spotify/tracks/${trackId}/`;
        
        const response = await axios.get(apiUrl, { headers });

        if (response.data && response.data.external_ids) {
            const isrc = response.data.external_ids.isrc;
            console.log('\n✅ SUCCESS! Node.js found it:');
            console.log(`Song: ${response.data.name}`);
            console.log(`ISRC: ${isrc}`);
            return isrc;
        } else {
            console.log('\n❌ Found the song, but Groover has no ISRC for it.');
        }

    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.log('\n❌ Groover blocked Node.js. They can tell it is a script.');
            console.log('To fix this, we might need a "Proxy" or a real Browser session.');
        } else {
            console.log('\n❌ Error:', error.message);
        }
    }
}

// Test it with the link you used in the console
getIsrcLikeABrowser('https://open.spotify.com/track/4WcZ9uJtvgK4fstpK5vxlR?si=m99Ku1UlTP-MoxvjWkMUQg');
