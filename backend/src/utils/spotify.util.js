const axios = require('axios');
const qs = require('qs');

let accessToken = null;
let tokenExpiry = 0;

async function getSpotifyAccessToken() {
  const now = Date.now();
  if (accessToken && now < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not found in environment variables.');
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

    const response = await axios(authOptions);
    accessToken = response.data.access_token;
    tokenExpiry = now + response.data.expires_in * 1000 - 60000; // subtract 1 min for safety
    return accessToken;
  } catch (error) {
    console.error('[Spotify-Util] Failed to get access token:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getSpotifyAccessToken
};
