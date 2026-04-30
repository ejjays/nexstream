import { load } from 'cheerio';
import { getQuantumStream } from '../../utils/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const HEADERS = {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    const cookie = typeof options.cookie === 'string' ? options.cookie : null;

    
    // fetch html
    const res = await fetch(url, {
      headers: { 
        ...HEADERS,
        ...(cookie && { 'Cookie': cookie })
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const targetUrl = res.url;
    const isStory = targetUrl.includes('/stories/');
    console.log(`[JS-FB] info: ${targetUrl}${isStory ? ' (STORY)' : ''}`);

    const html = await res.text();
    const $ = load(html);

    let ogTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\n/g, ' ').trim();
    let ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();

    const formats: Format[] = [];
    
    const addFormat = (rawUrl: string, id: string, label: string) => {
      if (!rawUrl) return;
      let cleanUrl = rawUrl;
      
      // decode unicode
      try {
        if (cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) {
            cleanUrl = JSON.parse(cleanUrl);
        } else {
            const safeString = cleanUrl.replace(/"/g, '\\"');
            cleanUrl = JSON.parse(`"${safeString}"`);
        }
      } catch (e) {
        cleanUrl = cleanUrl
            .replace(/\u0026/g, '&')
            .replace(/\u003d/g, '=')
            .replace(/\\/g, '');
      }
        
      if (formats.some(f => f.url === cleanUrl)) return;
      
      const isPhoto = id === 'photo';
      const urlLower = cleanUrl.toLowerCase();
      
      // Refined detection for split components vs muxed
      const isAudioOnly = urlLower.includes('dash_audio') || urlLower.includes('heaac') || urlLower.includes('m4a') || id.includes('audio');
      const isVideoOnly = !isAudioOnly && (urlLower.includes('dash-video') || id.includes('video') || urlLower.includes('bytestart') || urlLower.includes('fragment'));
      
      // Progressive streams (muxed) typically have nc_cat and NO dash/fragment markers
      const isMuxed = !isPhoto && !isAudioOnly && !isVideoOnly && !urlLower.includes('fragment');

      formats.push({
        format_id: id,
        url: cleanUrl,
        ext: isPhoto ? 'jpg' : 'mp4',
        resolution: label,
        vcodec: isPhoto || isAudioOnly ? 'none' : 'yes',
        acodec: isPhoto || isVideoOnly ? 'none' : 'yes',
        is_muxed: isMuxed,
        is_video: !isPhoto && !isAudioOnly,
        is_audio: !isPhoto && !isVideoOnly
      });
    };

    let storyThumbnail: string | null = null;
    
    // extract story
    if (isStory) {
        const storyPatterns = [
            /"unified_video_url"\s*:\s*"([^"]+)"/,
            /"playable_url"\s*:\s*"([^"]+)"/,
            /"playable_url_quality_hd"\s*:\s*"([^"]+)"/
        ];

        for (const p of storyPatterns) {
            const matches = html.match(new RegExp(p, 'g'));
            if (matches) {
                matches.forEach(m => {
                    const urlMatch = m.match(p);
                    if (urlMatch && urlMatch[1]) {
                        const isHD = m.includes('quality_hd') || m.includes('unified_video_url');
                        addFormat(urlMatch[1], isHD ? 'hd' : 'sd', isHD ? '720p (HD)' : '360p (SD)');
                    }
                });
            }
        }

        // extract photo
        if (formats.length === 0) {
            const photoMatch = html.match(/"media"\s*:\s*\{"__typename"\s*:\s*"Photo",.*?"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/) ||
                               html.match(/"story_card_info"\s*:\s*\{.*?"story_thumbnail"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/) ||
                               html.match(/"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/);
            if (photoMatch) {
                addFormat(photoMatch[1], 'photo', 'Original Photo');
                storyThumbnail = formats.find(f => f.format_id === 'photo')?.url || null;
            }
        }

        // parse thumbnail
        const thumbMatch = html.match(/"preferred_thumbnail"\s*:\s*\{"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/) ||
                           html.match(/"preview_image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/);
        if (thumbMatch) storyThumbnail = thumbMatch[1].replace(/\\/g, '');
    }

    // match hd patterns
    const hdPatterns = [
      /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
      /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
      /hd_src\s*:\s*"([^"]+)"/
    ];
    
    // match sd patterns
    const sdPatterns = [
      /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
      /"playable_url"\s*:\s*"([^"]+)"/,
      /sd_src\s*:\s*"([^"]+)"/,
      /"video_url"\s*:\s*"([^"]+)"/
    ];

    let hdUrl: string | null = null;
    for (const p of hdPatterns) {
      const m = html.match(p);
      if (m) { hdUrl = m[1]; break; }
    }

    let sdUrl: string | null = null;
    for (const p of sdPatterns) {
      const m = html.match(p);
      if (m) { sdUrl = m[1]; break; }
    }

    if (hdUrl) addFormat(hdUrl, 'hd', '720p (HD)');
    if (sdUrl) addFormat(sdUrl, 'sd', '360p (SD)');

    // Filter out formats that are definitely not video if we have hd/sd tags
    const filteredFormats = formats.filter(f => f.is_video || f.is_muxed || f.format_id === 'photo');
    if (filteredFormats.length > 0) {
        formats.length = 0;
        formats.push(...filteredFormats);
    }

    // Combined deep search across all scripts
    const scriptsSet = $('script').map((i, el) => $(el).html()).get();
    const fullJsonBlob = scriptsSet.join(' ');

    const recoveryPatterns = [
        { type: 'author', p: /"(?:owner|author|actor)":\{"__typename":"(?:User|Page)","name":"([^"]+)"/ },
        { type: 'author', p: /"(?:story_bucket_owner_name|ownerName|author_name)":"([^"]+)"/ },
        { type: 'author', p: /"story_bucket_owner":\{"name":"([^"]+)"/ },
        { type: 'title', p: /"(?:message|node|accessibility_caption)":\s*\{"text":"([^"]+)"\}/ },
        { type: 'title', p: /\{"text":"([^"]+)"\}/ },
        { type: 'title', p: /"(?:description|accessibility_caption)":"([^"]+)"/ }
    ];

    let author = 'Facebook User';
    let finalTitle = ogTitle;
    const cookieName = options.cookie_name || null;

    // Pass 1: Formats discovery (discovery via deep-scan)
    for (const script of scriptsSet) {
        if (!script) continue;
        // Find Audio (HEAAC / dash_audio / m4a)
        const audioMatches = script.match(/"audio_url"\s*:\s*"([^"]+)"/g) || 
                            script.match(/"base_url"\s*:\s*"([^"]+heaac[^"]+)"/g) ||
                            script.match(/"base_url"\s*:\s*"([^"]+dash_audio[^"]+)"/g);
        if (audioMatches) {
            audioMatches.forEach((m, idx) => {
                const urlMatch = m.match(/:\s*"([^"]+)"/);
                if (urlMatch && urlMatch[1]) addFormat(urlMatch[1], `audio_${idx}`, 'Audio Stream');
            });
        }

        // Find Video / Muxed
        const videoMatches = script.match(/"base_url"\s*:\s*"([^"]+)"/g) ||
                             script.match(/"browser_native_[sh]d_url"\s*:\s*"([^"]+)"/g);
        if (videoMatches) {
            videoMatches.forEach((m, idx) => {
                const urlMatch = m.match(/:\s*"([^"]+)"/);
                if (urlMatch && urlMatch[1]) {
                    const val = urlMatch[1];
                    if (val.includes('dash_audio') || val.includes('heaac')) return;
                    const isHD = val.includes('quality_hd') || val.includes('_hd') || val.includes('native_hd');
                    addFormat(val, isHD ? `hd_${idx}` : `sd_${idx}`, isHD ? '720p (HD)' : '360p (SD)');
                }
            });
        }
    }

    // Pass 2: Metadata discovery
    for (const entry of recoveryPatterns) {
        const matches = fullJsonBlob.match(new RegExp(entry.p, 'g'));
        if (matches) {
            for (const m of matches) {
                const match = m.match(entry.p);
                if (match && match[1]) {
                    const val = match[1]
                        .replace(/\\u([0-9a-fA-F]{4})/g, (un, grp) => String.fromCharCode(parseInt(grp, 16)))
                        .replace(/\n/g, ' ')
                        .replace(/\\/g, '');
                    
                    const lowerVal = val.toLowerCase();
                    if (lowerVal.includes('facebook') || lowerVal.includes('bundle') || lowerVal.includes('entrypoint') || 
                        lowerVal.includes('worker') || lowerVal.includes('messenger') || lowerVal.includes('recorder') ||
                        lowerVal.includes('opus') || lowerVal.includes('script') ||
                        lowerVal === 'public' || lowerVal === 'video' || lowerVal.length < 3) continue;

                    if (entry.type === 'author') {
                        const isSelf = cookieName && lowerVal.includes(cookieName.toLowerCase());
                        if (!isSelf && (author === 'Facebook User' || author.length < 3 || author.toLowerCase().includes('bundle') || author.toLowerCase().includes('worker'))) {
                            author = val;
                        }
                    } else if (entry.type === 'title') {
                        if (lowerVal.includes('facebook') || lowerVal.includes('video by')) continue;
                        const isGeneric = !finalTitle || finalTitle === ogTitle || 
                                         finalTitle.toLowerCase() === 'facebook' || 
                                         finalTitle.toLowerCase() === 'video' ||
                                         finalTitle.toLowerCase() === 'public';
                        if (isGeneric && val.length > 5 && !lowerVal.includes('reels')) {
                            finalTitle = val.substring(0, 100).trim();
                        }
                    }
                }
            }
        }
    }

    // Pass 3: Explicit author cleanup if still generic or technical
    if (author === 'Facebook User' || author.toLowerCase().includes('bundle') || author.toLowerCase().includes('worker')) {
        const creatorMatch = fullJsonBlob.match(/"name":"([^"]+)"(?=.*?"__typename":"User")/);
        if (creatorMatch && creatorMatch[1]) {
            const name = creatorMatch[1];
            const nl = name.toLowerCase();
            if (!nl.includes('bundle') && !nl.includes('worker') && (!cookieName || !nl.includes(cookieName.toLowerCase()))) {
                author = name;
            }
        }
    }

    if ((!finalTitle || finalTitle.toLowerCase() === 'facebook' || finalTitle.toLowerCase() === 'video' || finalTitle.toLowerCase() === 'public') && ogDesc) {
        finalTitle = ogDesc.split('\n')[0].replace(/#\w+/g, '').replace(/[^\x20-\x7E]/g, ' ').substring(0, 100).trim();
    }

    // Final Fallback for title
    if (!finalTitle || finalTitle.toLowerCase() === 'facebook' || finalTitle.toLowerCase() === 'public') finalTitle = `Reel by ${author}`;

    // FINAL FILTER: Ensure we only return video-capable formats, photos, or identified audio streams
    const finalFormats = formats.filter(f => f.is_video || f.is_muxed || f.is_audio || f.format_id === 'photo');
    if (finalFormats.length > 0) {
        formats.length = 0;
        formats.push(...finalFormats);
    }

    if (formats.length === 0) return null;

    // fetch sizes in small batches to avoid timeouts
    for (let i = 0; i < formats.length; i += 3) {
      const batch = formats.slice(i, i + 3);
      await Promise.all(batch.map(async f => {
        try {
          const hRes = await fetch(f.url, { 
              method: 'HEAD', 
              headers: { 'User-Agent': DESKTOP_UA },
              signal: AbortSignal.timeout(5000) 
          });
          if (hRes.ok) {
              const len = hRes.headers.get('content-length');
              if (len) f.filesize = parseInt(len, 10);
          }
        } catch (e) {}
      }));
    }

    // parse ID
    const idRegex = /(?:v=|fbid=|videos\/|reel\/|reels\/|share\/r\/|stories\/)([a-zA-Z0-9_-]+)/;

    // thumbnail recovery
    let thumbnail: string | null = storyThumbnail || 
                    $('meta[property="og:image"]').attr('content') || 
                    html.match(/"preferred_thumbnail"\s*:\s*\{"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"/)?.[1] ||
                    html.match(/"thumbnail"\s*:\s*"([^"]+)"/)?.[1] ||
                    null;

    if (thumbnail && thumbnail.startsWith('"')) {
        try { thumbnail = JSON.parse(thumbnail); } catch(e) {}
    }
    if (thumbnail) thumbnail = (thumbnail as string).replace(/\\/g, '');

    return {
      id: targetUrl.match(idRegex)?.[1] || 'fb_video',
      extractor_key: 'facebook',
      is_js_info: true,
      title: finalTitle || ogTitle,
      uploader: author,
      author: author,
      thumbnail: thumbnail || '',
      webpage_url: targetUrl,
      formats: formats
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[JS-FB] Error extracting ${url}: ${error.message}`);
    return null;
  }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  
  return await getQuantumStream(format.url, { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.facebook.com/' });
}
