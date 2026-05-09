
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // refresh access token
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return cachedToken;
    }
  } catch (e) {
    console.error('[Spotify-API] Auth failed:', e.message);
  }
  return null;
}

async function fetchTrackData(trackId) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;
    const track = await response.json();

    return {
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      imageUrl: track.album.images[0]?.url || null,
      duration: track.duration_ms,
      isrc: track.external_ids?.isrc || null,
      source: 'spotify-api'
    };
  } catch (e) {
    return null;
  }
}

async function searchTrack(query) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;
    const data = await response.json();
    
    return (data.tracks?.items || []).map(track => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      imageUrl: track.album.images[0]?.url || null,
      duration: track.duration_ms,
      isrc: track.external_ids?.isrc || null,
      uri: track.uri
    }));
  } catch (e) {
    return [];
  }
}

module.exports = {
  fetchTrackData,
  searchTrack
};
