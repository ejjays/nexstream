import fs from 'fs';
import path from 'path';
// @ts-ignore
import fpcalc from 'fpcalc';
// @ts-ignore
import { Shazam } from 'node-shazam';
import { getUgChords } from "./ug-grounding.service.js";

const ACOUSTID_API_KEY = 'vdzQhu1sWI';

async function getGeminiChords(artist: string, title: string, syncedLyrics: string | null, engineChords: any[]): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VERTEX_API_KEY;
    if (!apiKey) return null;

    try {
        const { GoogleGenAI } = await import("@google/genai");
        const genAI = new (GoogleGenAI as any)({ apiKey });
        
        let prompt = `Act as an expert music transcriber. Your task is to merge raw audio-extracted chords with synchronized lyrics to create a highly accurate Ultimate-Guitar style chord sheet.\n\nSong: "${title}" by "${artist}"\n\n`;

        if (syncedLyrics && engineChords && engineChords.length > 0) {
            prompt += `Here are the timestamped lyrics (in [mm:ss.xx] format):\n${syncedLyrics}\n\n`;
            
            const chordsSummary = engineChords
                .filter(c => !c.is_passing)
                .map(c => `[${formatTime(c.time)}] ${c.chord}`)
                .join('\n');
            
            prompt += `Here are the exact chords detected in the audio by our engine at specific timestamps:\n${chordsSummary}\n\n`;
            prompt += `CRITICAL INSTRUCTIONS:\n1. You MUST format this EXACTLY like an Ultimate Guitar text file.\n2. Chords MUST be placed on their own dedicated line directly ABOVE the lyrics, NOT inline with the text.\n3. Example of correct formatting:\n[ch]C[/ch]                  [ch]G[/ch]\nLet it be, let it be\n4. You MUST wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).\n5. Use the timestamps provided to figure out exactly which word the chord falls on, and space the chords out on the top line accordingly.\n6. Ignore long repetitive blocks of chords at the end (outros) if there are no lyrics. Keep it clean.\n7. ONLY output the final formatted chord sheet text. No markdown blocks, no conversational text.`;
        } else {
            prompt += `Since exact audio data is missing, return the most highly-rated guitar chords and lyrics available for this song. \nCRITICAL: Chords MUST be placed on their own line directly ABOVE the lyrics. Wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).\nProvide ONLY the song text with chords. No markdown code blocks or extra text.`;
        }

        const result = await genAI.models.generateContent({
            model: "gemini-1.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });
        const text = result.response.text();
        return text || null;
    } catch (e: any) {
        console.error("Gemini Chords Error:", e.message);
        return null;
    }
}

function formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = (seconds % 60).toFixed(2);
    return `${min < 10 ? '0' : ''}${min}:${sec.padStart(5, '0')}`;
}

async function getLyrics(artist: string, title: string): Promise<any> {
    const cleanTitle = title.split(/[([]/)[0].trim();

    const fetchExact = async (t: string) => {
        try {
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(t)}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    };

    const fetchSearch = async (t: string) => {
        try {
            const q = encodeURIComponent(`${artist} ${t}`);
            const url = `https://lrclib.net/api/search?q=${q}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data: any = await res.json();
            if (data && data.length > 0) {
                return data.find((r: any) => r.plainLyrics || r.syncedLyrics) || null;
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

async function processSong(artist: string, title: string, isrc: string | null, engineChords: any[]): Promise<any> {
    const lrclibData = await getLyrics(artist, title);
    const plainLyrics = lrclibData?.plainLyrics || null;
    const syncedLyrics = lrclibData?.syncedLyrics || null;

    let keyHint = null;
    if (engineChords && engineChords.length > 0) {
        const counts: any = {};
        engineChords.filter(c => !c.is_passing).forEach(c => {
            const root = c.chord.split('/')[0];
            counts[root] = (counts[root] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]);
        if (sorted.length > 0) keyHint = sorted[0][0];
    }

    let chordsSheet = await getUgChords(artist, title, plainLyrics, keyHint);
    let usedGrounding = !!chordsSheet;

    if (!chordsSheet) {
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

async function fallbackToShazam(filePath: string, engineChords: any[]): Promise<any> {
    try {
        const shazam = new Shazam();
        const res: any = await shazam.recognise(filePath, 'en-US');
        if (res && res.track) {
            const artist = res.track.subtitle;
            const title = res.track.title;
            const isrc = res.track.isrc;
            if (artist && title) return await processSong(artist, title, isrc, engineChords);
        }
        throw new Error("Shazam failed");
    } catch (e: any) {
        throw new Error(`Shazam error: ${e.message}`);
    }
}

export async function extractSongData(filePath: string, engineChords: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
        fpcalc(filePath, async (err: any, result: any) => {
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
                const data: any = await response.json();
                const recording = data.results?.[0]?.recordings?.[0];
                
                if (!recording) {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }

                const mbid = recording.id;
                const mbUrl = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=isrcs&fmt=json`;
                const mbRes = await fetch(mbUrl, { headers: { 'User-Agent': 'ISRC_Finder/1.0' } });
                const mbData: any = await mbRes.json();
                const isrc = mbData.isrcs?.[0];

                if (!isrc) {
                     const fallbackResult = await fallbackToShazam(filePath, engineChords);
                     return resolve(fallbackResult);
                 }

                const deezerRes = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
                const deezerData: any = await deezerRes.json();
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
