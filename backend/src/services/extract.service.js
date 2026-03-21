const fs = require('fs');
const path = require('path');
const fpcalc = require('fpcalc');
const axios = require('axios');
const { Shazam } = require('node-shazam');

const API_KEY = 'vdzQhu1sWI';

async function getLyrics(artist, title) {
    const cleanTitle = title.split(/[([]/)[0].trim();

    const fetchExact = async (t) => {
        try {
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(t)}`;
            const res = await axios.get(url);
            return res.data.plainLyrics || res.data.syncedLyrics;
        } catch (e) { return null; }
    };

    const fetchSearch = async (t) => {
        try {
            const q = encodeURIComponent(`${artist} ${t}`);
            const url = `https://lrclib.net/api/search?q=${q}`;
            const res = await axios.get(url);
            if (res.data && res.data.length > 0) {
                const match = res.data.find(r => r.plainLyrics || r.syncedLyrics);
                if (match) return match.plainLyrics || match.syncedLyrics;
            }
        } catch (e) { return null; }
        return null;
    };

    let lyrics = await fetchExact(title);
    if (lyrics) return lyrics;

    if (title !== cleanTitle) {
        lyrics = await fetchExact(cleanTitle);
        if (lyrics) return lyrics;
    }

    lyrics = await fetchSearch(title);
    if (lyrics) return lyrics;

    if (title !== cleanTitle) {
        lyrics = await fetchSearch(cleanTitle);
        if (lyrics) return lyrics;
    }

    return null;
}

async function processSong(artist, title, isrc) {
    const lyrics = await getLyrics(artist, title);
    const cleanTitle = title.split('(')[0].trim();
    const ugLink = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(artist + " " + cleanTitle)}`;
    
    return {
        artist,
        title,
        isrc: isrc || null,
        lyrics,
        chordsLink: ugLink
    };
}

async function fallbackToShazam(filePath) {
    try {
        const shazam = new Shazam();
        const res = await shazam.recognise(filePath, 'en-US');
        
        if (res && res.track) {
            const artist = res.track.subtitle;
            const title = res.track.title;
            const isrc = res.track.isrc;
            
            if (artist && title) {
                return await processSong(artist, title, isrc);
            }
        }
        throw new Error("Shazam could not find complete details for this audio file.");
    } catch (e) {
        throw new Error(`Error during Shazam recognition: ${e.message}`);
    }
}

async function extractSongData(filePath) {
    return new Promise((resolve, reject) => {
        fpcalc(filePath, async (err, result) => {
            if (err) {
                try {
                    const fallbackResult = await fallbackToShazam(filePath);
                    return resolve(fallbackResult);
                } catch (fallbackErr) {
                    return reject(fallbackErr);
                }
            }

            const acoustidUrl = `https://api.acoustid.org/v2/lookup?client=${API_KEY}&meta=recordingids&fingerprint=${result.fingerprint}&duration=${result.duration}`;

            try {
                const response = await axios.get(acoustidUrl);
                const recording = response.data.results?.[0]?.recordings?.[0];
                
                if (!recording) {
                    const fallbackResult = await fallbackToShazam(filePath);
                    return resolve(fallbackResult);
                }

                const mbid = recording.id;
                const mbUrl = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=isrcs&fmt=json`;
                const mbRes = await axios.get(mbUrl, { headers: { 'User-Agent': 'ISRC_Finder/1.0' } });
                const isrc = mbRes.data.isrcs?.[0];

                if (!isrc) {
                     const fallbackResult = await fallbackToShazam(filePath);
                     return resolve(fallbackResult);
                }

                const deezerRes = await axios.get(`https://api.deezer.com/track/isrc:${isrc}`);
                if (deezerRes.data.error) {
                    const fallbackResult = await fallbackToShazam(filePath);
                    return resolve(fallbackResult);
                }

                const finalResult = await processSong(deezerRes.data.artist.name, deezerRes.data.title, isrc);
                resolve(finalResult);

            } catch (error) {
                try {
                    const fallbackResult = await fallbackToShazam(filePath);
                    resolve(fallbackResult);
                } catch (fallbackErr) {
                    reject(fallbackErr);
                }
            }
        });
    });
}

module.exports = {
    extractSongData
};
