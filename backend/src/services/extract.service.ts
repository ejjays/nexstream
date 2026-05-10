import fpcalc from 'fpcalc';
import { Shazam } from 'node-shazam';
import { getUgChords } from "./ug-grounding.service.js";
import { z } from 'zod';

const ACOUSTID_API_KEY = 'vdzQhu1sWI';

const AcoustidResponseSchema = z.object({
    results: z.array(z.object({
        recordings: z.array(z.object({
            id: z.string()
        })).optional()
    })).optional()
}).catchall(z.unknown());

const MusicBrainzResponseSchema = z.object({
    isrcs: z.array(z.string()).optional()
}).catchall(z.unknown());

const DeezerResponseSchema = z.object({
    error: z.object({
        type: z.string(),
        message: z.string(),
        code: z.number()
    }).optional(),
    artist: z.object({ name: z.string() }).optional(),
    title: z.string().optional()
}).catchall(z.unknown());

type LyricsData = {
    plainLyrics?: string;
    syncedLyrics?: string;
    [key: string]: unknown;
};

type SongData = {
    artist: string;
    title: string;
    isrc: string | null;
    lyrics: string | null;
    chordsSheet: string | null;
    chordsLink: string;
    grounded: boolean;
};

async function getGeminiChords(
    artist: string,
    title: string,
    syncedLyrics: string | null,
    engineChords: { is_passing: boolean; time: number; chord: string }[]
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VERTEX_API_KEY;
    if (!apiKey) return null;

    try {
        const { GoogleGenAI } = await import("@google/genai");
        type GetModelFn = (options: { model: string }) => {
            generateContent: (prompt: string) => Promise<{
                get response(): { text(): string }
            }>
        };

        const genAIInstance = new (GoogleGenAI as unknown as { new(key: string): { getGenerativeModel: GetModelFn } })(apiKey);
        
        let prompt = `Act as an expert music transcriber. Your task is to merge raw audio-extracted chords with synchronized lyrics to create a highly accurate Ultimate-Guitar style chord sheet.\n\nSong: "${title}" by "${artist}"\n\n`;

        if (syncedLyrics && engineChords && engineChords.length > 0) {
            prompt += `Here are the timestamped lyrics (in [mm:ss.xx] format):\n${syncedLyrics}\n\n`;
            
            const chordsSummary = engineChords
                .filter(c => !c.is_passing)
                .map(c => `[${formatTime(c.time)}] ${c.chord}`)
                .join('\n');
            
            prompt += `Here are the exact chords detected in the audio by our engine at specific timestamps:\n${chordsSummary}\n\n`;
            prompt += "CRITICAL INSTRUCTIONS:\n1. You MUST format this EXACTLY like an Ultimate Guitar text file.\n2. Chords MUST be placed on their own dedicated line directly ABOVE the lyrics, NOT inline with the text.\n3. Example of correct formatting:\n[ch]C[/ch]                  [ch]G[/ch]\nLet it be, let it be\n4. You MUST wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).\n5. Use the timestamps provided to figure out exactly which word the chord falls on, and space the chords out on the top line accordingly.\n6. Ignore long repetitive blocks of chords at the end (outros) if there are no lyrics. Keep it clean.\n7. ONLY output the final formatted chord sheet text. No markdown blocks, no conversational text.";
        } else {
            prompt += "Since exact audio data is missing, return the most highly-rated guitar chords and lyrics available for this song. \nCRITICAL: Chords MUST be placed on their own line directly ABOVE the lyrics. Wrap every single chord in [ch] brackets (e.g., [ch]Am7[/ch]).\nProvide ONLY the song text with chords. No markdown code blocks or extra text.";
        }

        const model = genAIInstance.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text || null;
    } catch (e: unknown) {
        const error = e as Error;
        console.error("Gemini Chords Error:", error.message);
        return null;
    }
}

function formatTime(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = (seconds % 60).toFixed(2);
    return `${min < 10 ? '0' : ''}${min}:${sec.padStart(5, '0')}`;
}

async function getLyrics(artist: string, title: string): Promise<LyricsData | null> {
    const cleanTitle = title.split(/[([]/)[0].trim();

    const fetchExact = async (t: string): Promise<LyricsData | null> => {
        try {
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(t)}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const json = await res.json() as LyricsData;
            return json;
        } catch (_e) {
            return null;
        }
    };

    const fetchSearch = async (t: string): Promise<LyricsData | null> => {
        try {
            const q = encodeURIComponent(`${artist} ${t}`);
            const url = `https://lrclib.net/api/search?q=${q}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = (await res.json()) as LyricsData[];
            if (data.length > 0) {
                return data.find((r) => r.plainLyrics !== undefined || r.syncedLyrics !== undefined) || null;
            }
        } catch (_e) {
            return null;
        }
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

async function processSong(
    artist: string,
    title: string,
    isrc: string | null,
    engineChords: Array<{ chord: string; is_passing: boolean; time?: number }>
): Promise<SongData> {
    const lrclibData = await getLyrics(artist, title);
    const plainLyrics = lrclibData?.plainLyrics || null;
    const syncedLyrics = lrclibData?.syncedLyrics || null;

    let keyHint: string | null = null;
    if (engineChords && engineChords.length > 0) {
        const counts: Record<string, number> = {};
        engineChords.filter(c => !c.is_passing).forEach(c => {
            const root = c.chord.split('/')[0];
            counts[root] = (counts[root] || 0) + 1;
        });
        const sorted: Array<[string, number]> = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) keyHint = sorted[0][0];
    }

    let chordsSheet = await getUgChords(artist, title, plainLyrics, keyHint);
    let usedGrounding = !!chordsSheet;

    if (!chordsSheet) {
        const validChords = engineChords
            .filter((c): c is { chord: string; is_passing: boolean; time: number } => typeof c.time === 'number');
        chordsSheet = await getGeminiChords(artist, title, syncedLyrics, validChords);
    }

    const cleanTitle = title.split('(')[0].trim();
    const ugLink = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
        artist + " " + cleanTitle
    )}`;
    
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

async function fallbackToShazam(
    filePath: string,
    engineChords: Array<{ chord: string; is_passing: boolean }>
): Promise<SongData> {
    try {
        const shazam = new Shazam();
        const res = await shazam.recognise(filePath, 'en-US') as { track?: { subtitle: string; title: string; isrc: string } };
        if (res && res.track) {
            const track = res.track;
            const artist = track.subtitle;
            const title = track.title;
            const isrc = track.isrc;
            if (artist && title) return await processSong(artist, title, isrc, engineChords);
        }
        throw new Error("Shazam failed");
    } catch (e: unknown) {
        const error = e as Error;
        throw new Error(`Shazam error: ${error.message}`);
    }
}

export async function extractSongData(
    filePath: string,
    engineChords: Array<{ chord: string; is_passing: boolean }> = []
): Promise<SongData> {
    return new Promise((resolve, reject) => {
        fpcalc(filePath, async (err: Error | null, result: { fingerprint: string; duration: number } | undefined) => {
            if (err || !result) {
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
                const rawAcoustidData = await response.json();
                const parsedAcoustid = AcoustidResponseSchema.safeParse(rawAcoustidData);
                if (!parsedAcoustid.success) {
                    console.debug('[ExtractService] Acoustid validation failed:', parsedAcoustid.error.message);
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }
                const data = parsedAcoustid.data;
                const recording = data.results?.[0]?.recordings?.[0];
                
                if (!recording) {
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }

                const mbid = recording.id;
                const mbUrl = `https://musicbrainz.org/ws/2/recording/${mbid}?inc=isrcs&fmt=json`;
                const mbRes = await fetch(mbUrl, { headers: { 'User-Agent': 'ISRC_Finder/1.0' } });
                const rawMbData = await mbRes.json();
                const parsedMb = MusicBrainzResponseSchema.safeParse(rawMbData);
                if (!parsedMb.success) {
                     console.debug('[ExtractService] MusicBrainz validation failed:', parsedMb.error.message);
                     const fallbackResult = await fallbackToShazam(filePath, engineChords);
                     return resolve(fallbackResult);
                }
                const mbData = parsedMb.data;
                const isrc = mbData.isrcs?.[0];

                if (!isrc) {
                     const fallbackResult = await fallbackToShazam(filePath, engineChords);
                     return resolve(fallbackResult);
                 }

                const deezerRes = await fetch(`https://api.deezer.com/track/isrc:${isrc}`);
                const rawDeezerData = await deezerRes.json();
                const parsedDeezer = DeezerResponseSchema.safeParse(rawDeezerData);
                if (!parsedDeezer.success) {
                    console.debug('[ExtractService] Deezer validation failed:', parsedDeezer.error.message);
                    const fallbackResult = await fallbackToShazam(filePath, engineChords);
                    return resolve(fallbackResult);
                }
                const deezerData = parsedDeezer.data;
                if (deezerData.error || !deezerData.artist || !deezerData.title) {
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
