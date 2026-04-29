import axios from 'axios';
import qs from 'qs';

let accessToken: string | null = null;
let tokenExpiry: number = 0;

export async function getSpotifyAccessToken(): Promise<string> {
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

    const response: any = await axios(authOptions);
    accessToken = response.data.access_token;
    tokenExpiry = now + response.data.expires_in * 1000 - 60000;
    return accessToken!;
  } catch (error: any) {
    console.error('[Spotify-Util] Failed to get access token:', error.response?.data || error.message);
    throw error;
  }
}
