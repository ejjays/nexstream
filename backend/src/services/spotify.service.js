const { spawn, exec } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDetails } = require('spotify-url-info')(fetch);

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' 
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) 
    : null;

// Simple in-memory cache to save Gemini quota
const aiCache = new Map();

/**
 * Helper to fetch an image and convert to base64 for Gemini
 */
async function getBase64Image(url) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
    } catch (e) {
        return null;
    }
}

async function refineSearchWithAI(metadata) {
    if (!genAI) return { query: null, confidence: 0 };
    
    const { title, artist, album, year, isrc, duration, imageUrl } = metadata;
    const cacheKey = `${title}-${artist}`.toLowerCase();
    
    // Check cache first to save tokens
    if (aiCache.has(cacheKey)) {
        console.log(`[AI] Using Cache for: ${title}`);
        return aiCache.get(cacheKey);
    }

    const modelsToTry = ["gemini-3-flash-preview", "gemini-3-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    
    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const promptParts = [
                `Act as a high-end music archivist. I need to find the 100% correct YouTube video for this Spotify track.
                
                DATA PROVIDED:
                - Title: "${title}"
                - Artist: "${artist}"
                - Album: "${album}"
                - Release Year: "${year}"
                - ISRC: "${isrc}"
                - Duration: ${Math.round(duration / 1000)} seconds`,
                
                "TASK:",
                "1. Analyze the metadata.",
                "2. Create the perfect YouTube search query for the OFFICIAL high-quality studio audio.",
                "3. Provide a Confidence Score (0-100%) for this match.",
                "4. Return ONLY a JSON object with keys 'query' and 'confidence'. No other text."
            ];

            const contents = [{
                role: 'user',
                parts: [ { text: promptParts.join('\n') } ]
            }];

            const result = await model.generateContent({ contents });
            const response = await result.response;
            const text = response.text().trim().replace(/```json|```/g, '');
            const parsed = JSON.parse(text);
            
            console.log(`[AI] Model: ${modelName} | Confidence: ${parsed.confidence}%`);
            console.log(`[AI] Optimized Query: "${parsed.query}"`);
            
            aiCache.set(cacheKey, parsed);
            return parsed;
        } catch (error) {
            console.warn(`[AI] Model ${modelName} failed: ${error.message}`);
        }
    }
    return { query: null, confidence: 0 };
}

async function resolveSpotifyToYoutube(videoURL, cookieArgs = []) {
    if (!videoURL.includes('spotify.com')) return { targetUrl: videoURL };

    try {
        console.log('[Spotify] Deep-scanning metadata: ' + videoURL);
        const details = await getDetails(videoURL);
        
        if (!details || !details.preview) {
            throw new Error('Could not fetch Spotify details');
        }

        const metadata = {
            title: details.preview.title,
            artist: details.preview.artist,
            album: details.preview.album || '',
            imageUrl: details.preview.image || '',
            duration: details.duration_ms || 0,
            year: details.release_date ? details.release_date.split('-')[0] : 'Unknown',
            isrc: details.isrc || details.preview.isrc || ''
        };

        if (!metadata.isrc && details.tracks && details.tracks[0]) {
            metadata.isrc = details.tracks[0].isrc || '';
        }
        
        console.log(`[Spotify] Found: "${metadata.title}" by "${metadata.artist}" (${metadata.year})`);

        const aiResult = await refineSearchWithAI(metadata);
        
        let searchQuery = aiResult.query;
        if (!searchQuery) {
            // HIGH-ACCURACY FALLBACK
            searchQuery = `${metadata.title} ${metadata.artist} official studio audio topic`.trim();
            console.log(`[Spotify] Resolved (Smart Fallback): "${searchQuery}"`);
        } else {
            console.log(`[Spotify] Resolved (AI Accuracy: ${aiResult.confidence}%): "${searchQuery}"`);
        }

        const finalUrl = await searchOnYoutube(searchQuery, cookieArgs);
        
        return {
            targetUrl: finalUrl || videoURL,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            imageUrl: metadata.imageUrl,
            isrc: metadata.isrc,
            year: metadata.year
        };
        
    } catch (err) {
        console.error('[Spotify] Deep resolution failed:', err.message);
        const trackId = videoURL.split('/track/')[1]?.split('?')[0];
        const fallback = trackId ? await searchOnYoutube(`spotify track ${trackId} official audio`, cookieArgs) : videoURL;
        return { targetUrl: fallback, title: 'Spotify Track', artist: '' };
    }
}

async function searchOnYoutube(query, cookieArgs) {
    const cleanQuery = query.replace(/on Spotify/g, '').replace(/-/g, ' ').trim();
    console.log(`[Spotify] YouTube Search: "${cleanQuery}"`);

    const searchProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--get-id',
        '--ignore-config',
        '--js-runtimes', 'deno',
        '--js-runtimes', 'node',
        `ytsearch1:${cleanQuery} music`
    ]);
    
    let youtubeId = '';
    await new Promise((resolve) => {
        searchProcess.stdout.on('data', (data) => youtubeId += data.toString());
        searchProcess.on('close', resolve);
    });

    if (youtubeId.trim()) {
        const finalUrl = `https://www.youtube.com/watch?v=${youtubeId.trim().split('\n')[0]}`;
        console.log(`[Spotify] Converted: ${finalUrl}`);
        return finalUrl;
    }
    return null;
}

module.exports = { resolveSpotifyToYoutube };