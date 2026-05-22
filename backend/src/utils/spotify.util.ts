import { secureFetch } from './security.util.js';

let accessToken: string | null = null;
let tokenExpiry = 0;

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
    const response = await secureFetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials'
      }).toString(),
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify API responded with status ${response.status}: ${text}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    
    accessToken = data.access_token;
    tokenExpiry = now + data.expires_in * 1000 - 60000;
    return data.access_token;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[Spotify-Util] Failed to get access token:', error.message);
    } else {
      console.error('[Spotify-Util] Failed to get access token:', error);
    }
    throw error;
  }
}
