const fetch = require("isomorphic-unfetch");
const { isValidSpotifyUrl } = require("../../utils/validation.util");

async function searchDeezer(query) {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
    return res.json();
}

async function fetchIsrcFromDeezer(title, artist, isrc = null, targetDurationMs = 0) {
    try {
        if (isrc) {
            const res = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
            const data = await res.json();
            if (data && !data.error && data.preview) {
                return { isrc: data.isrc || isrc, preview: data.preview };
            }
        }
        let searchData = await searchDeezer(`artist:"${artist}" track:"${title}"`);
        if (!searchData.data?.length) searchData = await searchDeezer(`${title} ${artist}`);
        const cleanTitle = title.replace(/\s*[\[(].*?[\)\]]/g, "").trim();
        if (!searchData.data?.length && cleanTitle !== title) searchData = await searchDeezer(`${cleanTitle} ${artist}`);
        
        if (searchData.data?.length) {
            const best = searchData.data.find(t => {
                const artistMatch = t.artist.name.toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(t.artist.name.toLowerCase());
                const durationMatch = targetDurationMs > 0 ? Math.abs((t.duration * 1000) - targetDurationMs) < 5000 : true;
                return artistMatch && durationMatch;
            }) || searchData.data[0];
            
            if (targetDurationMs > 0 && Math.abs((best.duration * 1000) - targetDurationMs) > 10000) return null;
            
            const detailRes = await fetch(`https://api.deezer.com/track/${best.id}`);
            const detailData = await detailRes.json();
            return { isrc: detailData.isrc || null, preview: best.preview || null };
        }
    } catch (err) {}
    return null;
}

async function fetchIsrcFromItunes(title, artist, isrc = null, targetDurationMs = 0) {
    try {
        const query = isrc || `${title} ${artist}`;
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=5&entity=song`);
        const data = await res.json();
        if (data.results?.length) {
            const best = targetDurationMs > 0 ? data.results.sort((a, b) => Math.abs(a.trackTimeMillis - targetDurationMs) - Math.abs(b.trackTimeMillis - targetDurationMs))[0] : data.results[0];
            if (targetDurationMs > 0 && Math.abs(best.trackTimeMillis - targetDurationMs) > 10000) return null;
            return { isrc: best.isrc || null, preview: best.previewUrl || null };
        }
    } catch (err) {}
    return null;
}

async function fetchFromOdesli(spotifyUrl) {
    if (!isValidSpotifyUrl(spotifyUrl)) return null;
    try {
        const parsed = new URL(spotifyUrl);
        const res = await fetch(`https://api.odesli.co/v1-alpha.1/links?url=${encodeURIComponent(`${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`)}`);
        if (!res.ok) return null;
        const data = await res.json();
        const youtubeLink = data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url;
        if (!youtubeLink) return null;
        const entity = data.entitiesByUniqueId[data.linksByPlatform?.youtube?.entityUniqueId || data.linksByPlatform?.youtubeMusic?.entityUniqueId];
        return { targetUrl: youtubeLink, title: entity?.title, artist: entity?.artistName, thumbnailUrl: entity?.thumbnailUrl };
    } catch (err) {
        return null;
    }
}

module.exports = {
    fetchIsrcFromDeezer,
    fetchIsrcFromItunes,
    fetchFromOdesli
};
