const axios = require('axios');
const qs = require('qs');

const clientId = '5fff0545aad548a1901ea39f5e8f0548';
const clientSecret = 'ad7e5575b53e4213bbe0310f944e10e6';
const input = process.argv.slice(2).join(' ').trim();

async function getIsrc() {
  if (!input) {
    console.log('Usage: node i.js <track_id | track_url | search_query>');
    return;
  }

  try {
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      method: 'post',
      data: qs.stringify({
        grant_type: 'client_credentials'
      }),
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const tokenResponse = await axios(authOptions);
    const accessToken = tokenResponse.data.access_token;

    let track;

    const urlMatch = input.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    const idMatch = input.match(/^[a-zA-Z0-9]{22}$/); // Standard Spotify ID length

    if (urlMatch || idMatch) {
      const trackId = urlMatch ? urlMatch[1] : input;
      const trackResponse = await axios({
        url: `https://api.spotify.com/v1/tracks/${trackId}`,
        method: 'get',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      track = trackResponse.data;
    } else {
      const searchResponse = await axios({
        url: 'https://api.spotify.com/v1/search',
        method: 'get',
        params: {
          q: input,
          type: 'track',
          limit: 1
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      track = searchResponse.data.tracks.items[0];
    }

    if (track) {
      console.log('Song:', track.name);
      console.log('Artist:', track.artists.map(a => a.name).join(', '));
      console.log('ID:', track.id);
      console.log('ISRC:', track.external_ids.isrc);
    } else {
      console.log('No track found for input:', input);
    }
  } catch (error) {
    if (error.response) {
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

getIsrc();
