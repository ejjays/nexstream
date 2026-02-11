const { URL } = require('node:url');

const SUPPORTED_DOMAINS = [
    'youtube.com', 'youtu.be',
    'spotify.com', 'open.spotify.com',
    'facebook.com', 'fb.watch',
    'instagram.com', 'tiktok.com',
    'twitter.com', 'x.com',
    'soundcloud.com'
];

/**
 * Validates if a URL is from a supported domain.
 */
function isSupportedUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return SUPPORTED_DOMAINS.some(domain => 
            parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

/**
 * Checks if a URL is a valid Spotify domain.
 */
function isValidSpotifyUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'open.spotify.com' || parsed.hostname === 'spotify.com';
    } catch {
        return false;
    }
}

/**
 * Safely extracts a 22-character Spotify track ID.
 */
function extractTrackId(url) {
    if (!isValidSpotifyUrl(url)) return null;
    const match = url.match(/\/track\/([a-zA-Z0-9]{22})/);
    return match ? match[1] : null;
}

module.exports = {
    isSupportedUrl,
    isValidSpotifyUrl,
    extractTrackId
};
