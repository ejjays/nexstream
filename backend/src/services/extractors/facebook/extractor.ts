import { load } from 'cheerio';
import { getQuantumStream } from '../../../utils/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../../types/index.js';
import { Readable } from 'node:stream';
import * as Constants from './constants.js';
import * as Utils from './utils.js';

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo | null> {
  try {
    const cookie = typeof options.cookie === 'string' ? options.cookie : null;

    // fetch html
    const res = await fetch(url, {
      headers: { 
        ...Constants.HEADERS,
        ...(cookie && { 'Cookie': cookie })
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const targetUrl = res.url;
    const isStory = targetUrl.includes('/stories/');
    const isReel = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/share/r/');
    
    // parse id
    const extractedId = targetUrl.match(Constants.ID_REGEX)?.[1] || 'fb_video';
    
    console.log(`[JS-FB] info: ${targetUrl} (ID: ${extractedId})${isStory ? ' (STORY)' : ''}${isReel ? ' (REEL)' : ''}`);

    const html = await res.text();
    const $ = load(html);
    const scriptsSet = $('script').map((i, el) => $(el).html()).get();

    let ogTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\n/g, ' ').trim();
    let ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();

    const formats: Format[] = [];
    
    // add format
    const createFormatAdder = (localFormats: Format[]) => {
        return (rawUrl: string, id: string, label: string, audioUrl?: string, width?: number, height?: number, mimeType?: string) => {
          if (!rawUrl) return;
          
          let cleanUrl = Utils.decode(rawUrl);
          let cleanAudioUrl = audioUrl ? Utils.decode(audioUrl) : undefined;
            
          if (localFormats.some((f: Format) => f.url === cleanUrl)) return;
          
          const isPhoto = id === 'photo';
          const urlLower = cleanUrl.toLowerCase();
          
          const isMimeAudio = mimeType?.toLowerCase().includes('audio');
          const isMimeVideo = mimeType?.toLowerCase().includes('video');
          
          const isExplicitAudio = isMimeAudio || urlLower.includes('dash_audio') || urlLower.includes('heaac') || urlLower.includes('m4a') || id.toLowerCase().includes('audio');
          const isExplicitVideo = isMimeVideo || (height && height > 0) || urlLower.includes('video') || urlLower.includes('bytestart');
          
          const isMuxed = isMimeVideo && !id.includes('dash') && !urlLower.includes('fragment') && !urlLower.includes('bytestart') && !cleanAudioUrl;
          const isAudioOnly = isMimeAudio || (isExplicitAudio && !isExplicitVideo);
          const isVideoOnly = (isExplicitVideo && !isExplicitAudio && !cleanAudioUrl) && !isMuxed;
          let finalLabel = label;
          let finalId = id;

          if (width && height) {
              const isHD = width >= 1280 || height >= 720;
              if (isHD && !finalId.includes('hd')) {
                  finalId = finalId.replace('sd', 'hd').replace('targeted', 'hd_targeted');
                  finalLabel = `${height}p (HD)`;
              }
          }

          localFormats.push({
            format_id: finalId,
            url: cleanUrl,
            audio_url: cleanAudioUrl,
            ext: isPhoto ? 'jpg' : 'mp4',
            resolution: finalLabel,
            width: width || (finalId.includes('hd') ? 720 : undefined),
            height: height,
            vcodec: isPhoto || isAudioOnly ? 'none' : 'yes',
            acodec: isPhoto || (isVideoOnly && !cleanAudioUrl) ? 'none' : 'yes',
            is_muxed: isMuxed,
            is_video: !isPhoto && !isAudioOnly,
            is_audio: !isPhoto && !isVideoOnly
          });
        };
    };

    let storyThumbnail: string | null = null;
    
    // extract story
    if (isStory) {
        const storyFormats: Format[] = [];
        const storyAdd = createFormatAdder(storyFormats);
        for (const p of Constants.STORY_PATTERNS) {
            const matches = html.match(new RegExp(p, 'g'));
            if (matches) {
                matches.forEach(m => {
                    const urlMatch = m.match(p);
                    if (urlMatch && urlMatch[1]) {
                        const isHD = m.includes('quality_hd') || m.includes('unified_video_url');
                        storyAdd(urlMatch[1], isHD ? 'hd' : 'sd', isHD ? '720p (HD)' : '360p (SD)');
                    }
                });
            }
        }
        formats.push(...storyFormats);

        if (formats.length === 0) {
            for (const p of Constants.PHOTO_PATTERNS) {
                const photoMatch = html.match(p);
                if (photoMatch) {
                    createFormatAdder(formats)(photoMatch[1], 'photo', 'Original Photo');
                    storyThumbnail = formats.find((f: Format) => f.format_id === 'photo')?.url || null;
                    break;
                }
            }
        }

        for (const p of Constants.THUMB_PATTERNS) {
            const thumbMatch = html.match(p);
            if (thumbMatch) {
                storyThumbnail = thumbMatch[1].replace(/\\/g, '');
                break;
            }
        }
    }

    const fullSource = html + ' ' + scriptsSet.join(' ');
    const uniqueFormats = new Map<string, Format>(); 

    // extract dash
    const dashMatches = [...fullSource.matchAll(/dash_manifest(?:\\)*"\s*:\s*(?:\\)*"((?:\\.|[^"\\])+)/g)];
    for (const m of dashMatches) {
        try {
            const contextStart = Math.max(0, m.index! - 25000);
            const contextEnd = Math.min(fullSource.length, m.index! + 25000);
            const context = fullSource.substring(contextStart, contextEnd);
            
            if (!context.includes(extractedId)) continue;

            const rawXml = m[1].replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const unescapedXml = Utils.decodeFull(rawXml);
            
            const audioRegex = /mimeType="audio\/[^"]+"(?:(?!mimeType=).)*?<BaseURL>([^<]+)<\/BaseURL>/s;
            const audioMatch = unescapedXml.match(audioRegex);
            const audioUrl = audioMatch ? Utils.decodeFull(audioMatch[1]) : undefined;

            const videoRegex = /<Representation[^>]+width="(\d+)"[^>]+height="(\d+)"(?:(?!<\/Representation>).)*?<BaseURL>([^<]+)<\/BaseURL>/gs;
            const vMatches = [...unescapedXml.matchAll(videoRegex)];
            
            for (const v of vMatches) {
                const width = parseInt(v[1], 10);
                const height = parseInt(v[2], 10);
                const vUrl = Utils.decodeFull(v[3]);
                
                if (vUrl && height > 0) {
                     const isHD = height >= 720;
                     const formatId = `hd_${height}p_dash`;
                     
                     if (!uniqueFormats.has(formatId) || (audioUrl && !uniqueFormats.get(formatId)!.audio_url)) {
                         uniqueFormats.set(formatId, {
                             format_id: formatId,
                             url: Utils.decode(vUrl),
                             audio_url: audioUrl ? Utils.decode(audioUrl) : undefined,
                             ext: 'mp4',
                             resolution: `${height}p ${isHD ? '(HD)' : '(SD)'}`,
                             width: width,
                             height: height,
                             vcodec: 'yes',
                             acodec: audioUrl ? 'yes' : 'none',
                             is_muxed: !audioUrl,
                             is_video: true,
                             is_audio: false
                         });
                     }
                }
            }
        } catch (e) {}
    }

    // extract fallback
    const idMatches = [...fullSource.matchAll(new RegExp(extractedId, 'g'))];
    for (const match of idMatches) {
        const localCtx = fullSource.substring(Math.max(0, match.index! - 5000), Math.min(fullSource.length, match.index! + 25000));
        
        const hdMatch = localCtx.match(/(?:playable_url_quality_hd|browser_native_hd_url)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\])+)/);
        const sdMatch = localCtx.match(/(?:playable_url|browser_native_sd_url|video_url)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\])+)/);

        if (hdMatch && hdMatch[1] && !uniqueFormats.has('hd_720p_muxed')) {
            uniqueFormats.set('hd_720p_muxed', {
                format_id: 'hd_720p_muxed',
                url: Utils.decode(hdMatch[1]),
                ext: 'mp4',
                resolution: '720p (HD Muxed)',
                width: 1280,
                height: 720,
                vcodec: 'yes',
                acodec: 'yes',
                is_muxed: true,
                is_video: true,
                is_audio: false
            });
        }

        if (sdMatch && sdMatch[1] && !uniqueFormats.has('sd_360p_muxed')) {
            uniqueFormats.set('sd_360p_muxed', {
                format_id: 'sd_360p_muxed',
                url: Utils.decode(sdMatch[1]),
                ext: 'mp4',
                resolution: '360p (SD Muxed)',
                width: 640,
                height: 360,
                vcodec: 'yes',
                acodec: 'yes',
                is_muxed: true,
                is_video: true,
                is_audio: false
            });
        }
    }

    formats.push(...Array.from(uniqueFormats.values()));

    // recover metadata
    let author = 'Facebook User';
    let finalTitle = '';

    if (ogTitle.includes(' | ')) author = ogTitle.split(' | ')[0].trim();
    else if (ogTitle.includes(' on Facebook')) author = ogTitle.split(' on Facebook')[0].trim();

    for (const match of idMatches) {
        const localCtx = fullSource.substring(Math.max(0, match.index! - 5000), Math.min(fullSource.length, match.index! + 25000));
        
        const authorMatch = localCtx.match(/(?:owner|author|owner_as_page|short_form_video_owner)[^\:]*\:\{[^}]*?name[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\])+)/);
        if (authorMatch && author === 'Facebook User') {
            const foundAuthor = Utils.decodeFull(authorMatch[1]);
            if (!foundAuthor.toLowerCase().includes('facebook') && (!options.cookie_name || foundAuthor.toLowerCase() !== options.cookie_name.toLowerCase())) {
                author = foundAuthor;
            }
        }
        
        const textMatch = localCtx.match(/(?:message|text|accessibility_caption)[^\:]*\:\s*(?:\\)*"((?:\\.|[^"\\]){5,500})/);
        if (textMatch && !finalTitle) {
            const foundText = Utils.decodeFull(textMatch[1]).trim();
            const lower = foundText.toLowerCase();
            if (!['like','comment','share','send','reply','meta ai'].some(s => lower.includes(s))) {
                finalTitle = foundText;
            }
        }
    }

    author = Utils.decodeFull(author);
    finalTitle = Utils.decodeFull(finalTitle);

    if (formats.length === 0) return null;

    // filter formats
    const finalFormats = formats.filter((f: Format) => f.is_video || f.is_muxed || f.is_audio || f.format_id === 'photo');
    if (finalFormats.length > 0) {
        formats.length = 0;
        formats.push(...finalFormats);
    }

    if (formats.length === 0) return null;

    // fetch sizes
    for (let i = 0; i < formats.length; i += 3) {
      const batch = formats.slice(i, i + 3);
      await Promise.all(batch.map(async (f: Format) => {
        try {
          const hRes = await fetch(f.url, { 
              method: 'HEAD', 
              headers: { 'User-Agent': Constants.DESKTOP_UA },
              signal: AbortSignal.timeout(5000) 
          });
          if (hRes.ok) {
              const len = hRes.headers.get('content-length');
              if (len) f.filesize = parseInt(len, 10);
          }
        } catch (e) {}
      }));
    }

    // recover thumbnail
    let thumbnail: string | null = storyThumbnail || 
                    $('meta[property="og:image"]').attr('content') || 
                    html.match(Constants.THUMB_PATTERNS[0])?.[1] ||
                    html.match(Constants.THUMB_PATTERNS[1])?.[1] ||
                    null;

    if (thumbnail && thumbnail.startsWith('"')) {
        try { thumbnail = JSON.parse(thumbnail); } catch(e) {}
    }
    if (thumbnail) thumbnail = (thumbnail as string).replace(/\\/g, '');

    return {
      id: extractedId,
      extractor_key: 'facebook',
      is_js_info: true,
      title: finalTitle || ogTitle,
      uploader: author,
      author: author,
      description: finalTitle || ogDesc || ogTitle,
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
  const format = videoInfo.formats.find((f: Format) => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  
  return await getQuantumStream(format.url, { 
    'User-Agent': Constants.DESKTOP_UA, 
    'Referer': 'https://www.facebook.com/',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Range': 'bytes=0-',
    'Origin': 'https://www.facebook.com',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  });
}

