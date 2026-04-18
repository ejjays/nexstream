const fs = require('fs');
const path = require('path');
const fpcalc = require('fpcalc');
const { Shazam } = require('node-shazam');

const ACOUSTID_API_KEY = 'vdzQhu1sWI';

const { getUgChords } = require("./ug-grounding.service");

async function getGeminiChords(artist, title, syncedLyrics, engineChords) {
    const apiKey = process.env.VERTEX_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
        
        let prompt = `Act as an expert music transcriber. Your task is to merge raw audio-extracted chords with synchronized lyrics to create a highly accurate Ultimate-Guitar style chord sheet.

Song: "${title}" by "${artist}"

`;

        if (syncedLyrics && engineChords && engineChords.length > 0) {
            prompt += `Here are the timestamped lyrics (in [mm:ss.xx] format):\n${syncedLyrics}\n\n`;
            
            // Format engine chords to be easily readable by the AI
            const chordsSummary = engineChords
                .filter(c => !c.is_passing) // Ignore passing chords to reduce noise
                .map(c => `[${formatTime(c.time)}] ${c.chord}`)
                .join('\n');
            
            prompt += `Here are the exact chords detected in the audio by our engine at specific timestamps:\n${chordsSummary}\n\n`;
            
            prompt += `CRITICAL INSTRUCTIONS:
1. You MUST format this EXACTLY like an Ultimate Guitar text file.
2. Chords MUST be placed on their own dedicated line directly ABOVE the lyrics, NOT inline with the text.
3. Example of correct formatting:
[ch]C[/ch]                  [ch]G[/ch]
Let it be, let it be
4. You MUST wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).
5. Use the timestamps provided to figure out exactly which word the chord falls on, and space the chords out on the top line accordingly.
6. Ignore long repetitive blocks of chords at the end (outros) if there are no lyrics. Keep it clean.
7. ONLY output the final formatted chord sheet text. No markdown blocks, no conversational text.`;

        } else {
            prompt += `Since exact audio data is missing, return the most highly-rated guitar chords and lyrics available for this song. 
CRITICAL: Chords MUST be placed on their own line directly ABOVE the lyrics. Wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).
Provide ONLY the song text with chords. No markdown code blocks or extra text.`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: prompt }]
                }]
            })
        });

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || null;
    } catch (e) {
        console.error("Gemini Chords Error:", e.message);
        return null;
    }
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = (seconds % 60).toFixed(2);
    return `${min < 10 ? '0' : ''}${min}:${sec.padStart(5, '0')}`;
}

async function getLyrics(artist, title) {
    const cleanTitle = title.split(/[([]/)[0].trim();

    const fetchExact = async (t) => {
        try {
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(t)}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json(); // Return full object to get syncedLyrics
        } catch (e) { return null; }
    };

    const fetchSearch = async (t) => {
        try {
            const q = encodeURIComponent(`${artist} ${t}`);
            const url = `https://lrclib.net/api/search?q=${q}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.length > 0) {
                return data.find(r => r.plainLyrics || r.syncedLyrics) || null;
            }
        } catch (e) { return null; }
        return null;
    };

    let data = await fetchExact(title);
    if (data) return data;

    if (title !== cleanTitle) {
        data = await fetchExact(cleanTitle);
        if (data) return data;
    }

    data = await fetchSearch(title);
    if (data) return data;

    if (title !== cleanTitle) {
        data = await fetchSearch(cleanTitle);
        if (data) return data;
    }

    return null;
}

async function processSong(artist, title, isrc, engineChords) {
    const lrclibData = await getLyrics(artist, title);
    
    const plainLyrics = lrclibData?.plainLyrics || null;
    const syncedLyrics = lrclibData?.syncedLyrics || null;

    // --- Key Detection Hint ---
    let keyHint = null;
    if (engineChords && engineChords.length > 0) {
        const counts = {};
        engineChords.filter(c => !c.is_passing).forEach(c => {
            const root = c.chord.split('/')[0];
            counts[root] = (counts[root] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        if (sorted.length > 0) keyHint = sorted[0][0];
    }

    // --- NEW: Grounded UG Chords ---
    // Try to get exact grounded chords from UG first (Pass lyrics and key hint to avoid wrong song match)
    let chordsSheet = await getUgChords(artist, title, plainLyrics, keyHint);
    let usedGrounding = !!chordsSheet;

    // Fallback to traditional Gemini transcription if grounding failed
    if (!chordsSheet) {
        console.log(`UG Grounding failed for ${artist} - ${title}, falling back to legacy Gemini transcription.`);
        chordsSheet = await getGeminiChords(artist, title, syncedLyrics, engineChords);
    }

    const cleanTitle = title.split('(')[0].trim();
    const ugLink = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(artist + " " + cleanTitle)}`;
    
    return {
        artist,
        title,
        isrc: isrc || null,
        lyrics: plainLyrics,
        chordsSheet,
        chordsLink: ugLink,
        grounded: usedGrounding
    };
}

async function fallbackToShazam(filePath, engineChords) {
    try {
        const shazam = new Shazam();
        const res = await shazam.recognise(filePath, 'en-US');
        
        if (res && res.track) {
            const artist = res.track.subtitle;
            const title = res.track.title;
            const isrc = res.track.isrc;
            
            if (artist && title) {
                return await processSong(artist, title, isrc, engineChords);
            }
        }
        throw new Error("Shazam could not find complete details for this audio file.");
    } catch (e) {
        throw new Error(`Error during Shazam recognition: ${e.message}`);
    }
}

async function extractSongData(filePath, engineChords = []) {
    return new Promise((resolve, reject) => {
        fpcalc(filePath, async (err, result) => {
            if (err) {
                try {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                } catch (fallbackErr) {
                    return reject(fallbackErr);
                }
            }

            const acoustidUrl = `https://api.acoustid.org/v2/lookup?client=${ACOUSTID_API_KEY}&meta=recordingids&fingerprint=${result.fingerprint}&duration=${result.duration}`;

            try {
                const response = await fetch(acoustidUrl);
                const data = await response.json();
                const recording = data.results?.[0]?.recordings?.[0];
                
                if (!recording) {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }

                const mbid = recording.id;
                const mbUrl = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=isrcs&fmt=json`;
                const mbRes = await fetch(mbUrl, { headers: { 'User-Agent': 'ISRC_Finder/1.0' } });
                const mbData = await mbRes.json();
                const isrc = mbData.isrcs?.[0];

                if (!isrc) {
                     const fallbackResult = await fallbackToShazam(filePath, engineChords);
                     return resolve(fallbackResult);
                 }

                const deezerRes = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
                const deezerData = await deezerRes.json();
                if (deezerData.error) {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }

                const finalResult = await processSong(deezerData.artist.name, deezerData.title, isrc, engineChords);
                resolve(finalResult);

            } catch (error) {
                try {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
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