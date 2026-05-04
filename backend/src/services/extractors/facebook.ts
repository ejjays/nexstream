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
    
    // parse ID
    const idRegex = /(?:v=|fbid=|videos\/|reel\/|reels\/|share\/r\/|stories\/)([a-zA-Z0-9_-]+)/;
    const extractedId = targetUrl.match(idRegex)?.[1] || 'fb_video';
    
    console.log(`[JS-FB] info: ${targetUrl} (ID: ${extractedId})${isStory ? ' (STORY)' : ''}`);

    const html = await res.text();
    const $ = load(html);

    let ogTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').replace(/\n/g, ' ').trim();
    let ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();

    const formats: Format[] = [];
    
    const addFormat = (rawUrl: string, id: string, label: string, audioUrl?: string, width?: number, height?: number, mimeType?: string) => {
      if (!rawUrl) return;
      let cleanUrl = rawUrl;
      
      const decode = (s: string) => {
        try {
          if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
          return s.replace(/\\\/|\\\\/g, m => m === '\\\/' ? '/' : '\\')
                  .replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
                  .replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');
        } catch (e) {
          return s.replace(/\\/g, '').replace(/&amp;/g, '&');
        }
      };

      cleanUrl = decode(cleanUrl);
      let cleanAudioUrl = audioUrl ? decode(audioUrl) : undefined;
        
      if (formats.some((f: Format) => f.url === cleanUrl)) return;
      
      const isPhoto = id === 'photo';
      const urlLower = cleanUrl.toLowerCase();
      
      const isMimeAudio = mimeType?.toLowerCase().includes('audio');
      const isMimeVideo = mimeType?.toLowerCase().includes('video');
      
      const isExplicitAudio = isMimeAudio || urlLower.includes('dash_audio') || urlLower.includes('heaac') || urlLower.includes('m4a') || id.toLowerCase().includes('audio');
      const isExplicitVideo = isMimeVideo || (height && height > 0) || urlLower.includes('video') || urlLower.includes('bytestart');
      
      // prioritize mimeType
      let isAudioOnly = isExplicitAudio && !isExplicitVideo;
      let isVideoOnly = isExplicitVideo && !isExplicitAudio && !cleanAudioUrl;
      
      if (isMimeAudio) { isAudioOnly = true; isVideoOnly = false; }
      if (isMimeVideo) { isVideoOnly = true; isAudioOnly = false; }
      
      const isMuxed = !isPhoto && !isAudioOnly && !isVideoOnly && !cleanAudioUrl && !urlLower.includes('fragment') && (isMimeVideo && !id.includes('dash'));

      let finalLabel = label;
      let finalId = id;

      if (width && height) {
          const isHD = width >= 1280 || height >= 720;
          if (isHD && !finalId.includes('hd')) {
              finalId = finalId.replace('sd', 'hd').replace('targeted', 'hd_targeted');
              finalLabel = `${height}p (HD)`;
          }
      }

      console.log(`[JS-FB] Format Trace: ${finalId} | Mime: ${mimeType} | AudioOnly: ${isAudioOnly} | VideoOnly: ${isVideoOnly}`);

      formats.push({
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
      console.log(`[JS-FB] Added format: ${finalId} | Res: ${finalLabel} | Video: ${!isAudioOnly} | Audio: ${!!cleanAudioUrl || isMuxed || isAudioOnly}`);
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
                storyThumbnail = formats.find((f: Format) => f.format_id === 'photo')?.url || null;
            }
        }

        // parse thumbnail
        const thumbMatch = html.match(/"preferred_thumbnail"\s*:\s*\{"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/) ||
                           html.match(/"preview_image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/);
        if (thumbMatch) storyThumbnail = thumbMatch[1].replace(/\\/g, '');
    }

    // pass 1: discovery
    const scriptsSet = $('script').map((i, el) => $(el).html()).get();

    // extract balanced JSON
    const extractObject = (str: string, startIndex: number) => {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = startIndex; i < str.length; i++) {
            const char = str[i];
            if (escape) { escape = false; continue; }
            if (char === '\\') { escape = true; continue; }
            if (char === '"' && !escape) { inString = !inString; continue; }
            if (!inString) {
                if (char === '{') depth++;
                else if (char === '}') {
                    depth--;
                    if (depth === 0) return str.substring(startIndex, i + 1);
                }
            }
        }
        return null;
    };
    
    for (const script of scriptsSet) {
        if (!script) continue;
        
        // ONLY target scripts that contain our extracted ID
        const hasId = extractedId !== 'fb_video' && script.includes(extractedId);
        if (!hasId) continue;

        console.log(`[JS-FB] Found script containing ID: ${extractedId}. Length: ${script.length}`);

        const idIndex = script.indexOf(extractedId);
        // 50k char window
        const neighborhood = script.substring(Math.max(0, idIndex - 25000), Math.min(script.length, idIndex + 25000));
        
        // 0. global audio
        const baseUrlGlobalRegex = /"base_url":"([^"]+)"/g;
        let globalMatch;
        while ((globalMatch = baseUrlGlobalRegex.exec(script)) !== null) {
            const url = globalMatch[1];
            let start = script.lastIndexOf('{', globalMatch.index);
            let end = script.indexOf('}', globalMatch.index);
            if (start === -1) start = Math.max(0, globalMatch.index - 500);
            if (end === -1) end = Math.min(script.length, globalMatch.index + 500);
            const context = script.substring(start, end);
            
            const isAudio = (context.includes('audio') || context.includes('mp4a') || context.includes('heaac')) && 
                            !context.includes('"height":') &&
                            !url.toLowerCase().includes('video') &&
                            !url.toLowerCase().includes('bytestart');

            if (isAudio) {
                addFormat(url, `audio_global_${Math.floor(Math.random()*10000)}`, 'Audio Stream', undefined, undefined, undefined, 'audio/mp4');
            }
        }

        // 1. DASH search
        const dashPatterns = [
            /["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?(?:.*?)["']?audio_url["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/s,
            /["']?audio_url["']?\s*[:=]\s*["']?([^"'\s<]+)["']?(?:.*?)["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/s,
            /FBQualityClass=\\"hd\\".*?BaseURL>(.*?)</s,
            /representation_id=\\"\d+v\\".*?base_url\\":\\"(.*?)\\"/s
        ];

        for (const p of dashPatterns) {
            const m = neighborhood.match(p);
            if (m) {
                // check target id
                const preContext = neighborhood.substring(0, m.index || 0);
                const lastId = [...preContext.matchAll(/["']?video_id["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/g)].pop()?.[1];
                
                if (lastId && lastId !== extractedId) continue;

                const isAudioFirst = p.source.includes('audio_url') && p.source.indexOf('audio_url') < p.source.indexOf('hd_url');
                const v = isAudioFirst ? m[2] : m[1];
                const a = (m.length > 2) ? (isAudioFirst ? m[1] : m[2]) : undefined;
                addFormat(v, 'hd_muxed', '720p (HD)', a, undefined, undefined, 'video/mp4');
            }
        }

        // 2. progressive matches
        const baseUrlRegex = /["'](?:base_url|playable_url|playable_url_quality_hd|browser_native_hd_url|browser_native_sd_url|audio_url)["']\s*[:=]\s*["']([^"']+)["']/g;
        let match;
        while ((match = baseUrlRegex.exec(neighborhood)) !== null) {
            const url = match[1];
            
            // isolate JSON object
            let start = neighborhood.lastIndexOf('{', match.index);
            let end = neighborhood.indexOf('}', match.index);
            
            if (start === -1) start = Math.max(0, match.index - 500);
            if (end === -1) end = Math.min(neighborhood.length, match.index + 500);
            
            const context = neighborhood.substring(start, end);
            
            const preContext = neighborhood.substring(0, match.index);
            const videoIdMatches = [...preContext.matchAll(/["']?video_id["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/g)];
            const lastVideoId = videoIdMatches.length > 0 ? videoIdMatches[videoIdMatches.length - 1][1] : null;
            
            if (lastVideoId && lastVideoId !== extractedId) continue;

            const bwMatch = context.match(/["'](?:bandwidth|bitrate)["']\s*[:=]\s*(\d+)/);
            const hMatch = context.match(/["']height["']\s*[:=]\s*(\d+)/);
            const wMatch = context.match(/["']width["']\s*[:=]\s*(\d+)/);
            const mimeMatch = context.match(/"mime_type":"([^"]+)"/);
            
            const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
            const h = hMatch ? parseInt(hMatch[1], 10) : 0;
            const w = wMatch ? parseInt(wMatch[1], 10) : 0;
            let mime = mimeMatch ? mimeMatch[1] : undefined;
            
            if (!mime) {
                if (context.includes('audio') || context.includes('heaac') || context.includes('mp4a')) mime = 'audio/mp4';
                else if (context.includes('video') || h > 0) mime = 'video/mp4';
            }
            
            if (url) {
                const urlLower = url.toLowerCase();
                const isExplicitAudioMatch = mime?.includes('audio') || urlLower.includes('audio') || urlLower.includes('.m4a');
                
                const isHD = h >= 720 || w >= 1280 || bw > 1500000 || match[0].includes('hd_url') || match[0].includes('quality_hd');
                
                if (isExplicitAudioMatch || (h === 0 && w === 0 && bw > 0 && bw < 300000 && !context.includes('video'))) {
                    addFormat(url, `audio_targeted_${bw || Math.floor(Math.random()*1000)}`, 'Audio Stream', undefined, undefined, undefined, 'audio/mp4');
                } else if (h > 0 || w > 0 || bw > 0) {
                    const uniqueId = isHD ? `hd_targeted_${h}p_${bw}` : `sd_targeted_${h}p_${bw}`;
                    addFormat(url, uniqueId, isHD ? `${h || 720}p (HD)` : `${h || 360}p (SD)`, undefined, w, h, mime);
                } else {
                    const isExplicitHD = context.includes('quality_hd') || context.includes('hd_url');
                    addFormat(url, isExplicitHD ? `hd_fallback_${Math.floor(Math.random()*1000)}` : `sd_fallback_${Math.floor(Math.random()*1000)}`, isExplicitHD ? '720p (HD)' : '360p (SD)');
                }
            }
        }
    }






    // attach orphan audio
    let audioStreams = formats.filter((f: Format) => f.is_audio && !f.is_video);
    
    if (audioStreams.length === 0) {
        // fallback global audio
        const globalCdnRegex = /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+(?:audio|heaac|mp4a)[^"'\s]+\.mp4[^"'\s]*/g;
        const globalMatches = html.match(globalCdnRegex);
        if (globalMatches) {
            globalMatches.forEach((url, i) => {
                addFormat(url, `audio_global_fallback_${i}`, 'Audio Stream', undefined, undefined, undefined, 'audio/mp4');
            });
        }
        audioStreams = formats.filter((f: Format) => f.is_audio && !f.is_video);
    }

    const bestAudio = audioStreams[0];
    
    if (bestAudio) {
        formats.forEach((f: Format) => {
            if (f.is_video && !f.audio_url && !f.is_muxed) {
                f.audio_url = bestAudio.url;
                f.acodec = 'yes';
                f.is_muxed = false;
                console.log(`[JS-FB] Paired video ${f.format_id} with global audio ${bestAudio.format_id}`);
            }
        });
    }

    // final format filter
    formats.forEach((f: Format) => {
        if (f.is_muxed && (f.url.includes('bytestart') || f.url.includes('fragment') || f.format_id.includes('targeted'))) {
            // verify muxed formats
            if (!f.audio_url && bestAudio) {
                f.audio_url = bestAudio.url;
                f.is_muxed = false;
                f.acodec = 'yes';
            }
        }
    });


    // fallback patterns
    if (formats.length === 0) {
        const hdPatterns = [
          /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
          /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
          /hd_src\s*:\s*"([^"]+)"/
        ];
        const sdPatterns = [
          /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
          /"playable_url"\s*:\s*"([^"]+)"/,
          /sd_src\s*:\s*"([^"]+)"/,
          /"video_url"\s*:\s*"([^"]+)"/
        ];

        for (const script of scriptsSet) {
            if (!script || !script.includes(extractedId)) continue;
            
            for (const p of hdPatterns) {
              const m = script.match(p);
              if (m) addFormat(m[1], 'hd_fallback', '720p (HD)');
            }
            for (const p of sdPatterns) {
              const m = script.match(p);
              if (m) addFormat(m[1], 'sd_fallback', '360p (SD)');
            }
        }
    }

    // last resort search
    if (formats.length === 0) {
        // scan entire html
        const hdPatterns = [ /"browser_native_hd_url"\s*:\s*"([^"]+)"/, /"playable_url_quality_hd"\s*:\s*"([^"]+)"/ ];
        for (const p of hdPatterns) {
            const m = html.match(p);
            if (m) addFormat(m[1], 'hd_global', '720p (HD)');
        }
        
        // raw CDN fallback
        const cdnRegex = /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+\.mp4[^"'\s]*/g;
        const cdnMatches = html.match(cdnRegex);
        if (cdnMatches) {
            cdnMatches.forEach((url, i) => {
                addFormat(url, `cdn_fallback_${i}`, '360p (SD)');
            });
        }
    }

    const fullJsonBlob = html + ' ' + scriptsSet.join(' ');

    // pass 2: metadata
    let metaNeighborhood = "";
    for (const script of scriptsSet) {
        if (!script) continue;
        let pos = script.indexOf(extractedId);
        while (pos !== -1) {
            let objStart = -1;
            for (let i = pos; i >= 0; i--) {
                if (script[i] === '{') {
                    const snippet = script.substring(i, i + 200);
                    if (snippet.includes('"video_id"') || snippet.includes('"id"') || snippet.includes('"__typename"')) {
                        objStart = i;
                        break;
                    }
                }
            }
            if (objStart !== -1) {
                const jsonNode = extractObject(script, objStart);
                if (jsonNode && jsonNode.includes(extractedId)) {
                    metaNeighborhood += " " + jsonNode;
                }
            }
            pos = script.indexOf(extractedId, pos + 1);
        }
    }

    const blobToSearch = metaNeighborhood || fullJsonBlob;

    const recoveryPatterns = [
        { type: 'author', p: /"(?:owner|author|actor)":\{"__typename":"(?:User|Page)","name":"([^"]+)"/ },
        { type: 'author', p: /"(?:story_bucket_owner_name|ownerName|author_name)":"([^"]+)"/ },
        { type: 'author', p: /"story_bucket_owner":\{"name":"([^"]+)"/ },
        { type: 'author', p: /"owner_as_page":\{"name":"([^"]+)"/ },
        { type: 'author', p: /"comet_sections":\{"title":\{"text":"([^"]+)"\}/ },
        { type: 'title', p: /"message":\s*\{"text":"([^"]+)"\}/ },
        { type: 'title', p: /"video_title":"([^"]+)"/ },
        { type: 'title', p: /"accessibility_caption":"([^"]+)"/ },
        { type: 'title', p: /"(?:message|node|accessibility_caption)":\s*\{"text":"([^"]+)"\}/ }
    ];

    let author = 'Facebook User';
    let finalTitle = ogTitle;
    const cookieName = options.cookie_name || null;

    // use description
    if ((!finalTitle || finalTitle.toLowerCase() === 'facebook' || finalTitle.toLowerCase() === 'video' || finalTitle.toLowerCase() === 'public') && ogDesc) {
        finalTitle = ogDesc.split('\n')[0].replace(/[^\x20-\x7E]/g, ' ').substring(0, 150).trim();
    }

    // refine title
    if (finalTitle) {
        // decode entities
        const decodedTitle = finalTitle.replace(/&#x([0-9a-fA-F]+);/g, (m, c) => String.fromCharCode(parseInt(c, 16)));
        const parts = decodedTitle.split(' | ').map(p => p.trim());
        if (parts.length >= 2) {
            const potentialAuthor = parts[parts.length - 1];
            const isSelf = (cookieName && potentialAuthor.toLowerCase().includes(cookieName.toLowerCase())) ||
                           (potentialAuthor.toLowerCase() === 'cristel jm verga') || 
                           (potentialAuthor.toLowerCase() === 'critel jm verga');
            if (!isSelf) {
                author = potentialAuthor;
                finalTitle = parts.slice(0, parts.length - 1).join(' | ');
            } else {
                finalTitle = parts.slice(0, parts.length - 1).join(' | ');
            }
        } else {
            finalTitle = decodedTitle;
        }

        // handle self title
        const lowerTitle = finalTitle.toLowerCase();
        const isReelByGeneric = lowerTitle.startsWith('reel by') || lowerTitle.startsWith('video by');
        const matchesBlacklist = lowerTitle.includes('cristel jm verga') || lowerTitle.includes('critel jm verga');

        if (isReelByGeneric && (matchesBlacklist || !cookieName)) {
             finalTitle = 'Facebook Video';
        }
    }

    const titleCandidates: string[] = [];
    
    // scan for caption
    const captionMatches = blobToSearch.match(/"text":"([^"]{10,500})"/g);
    if (captionMatches) {
        captionMatches.forEach(m => {
            const match = m.match(/"text":"([^"]+)"/);
            if (match && match[1] && match[1].includes('#')) {
                 titleCandidates.push(match[1]);
            }
        });
    }

    // pass 2: metadata
    for (const entry of recoveryPatterns) {
        const matches = blobToSearch.match(new RegExp(entry.p, 'g'));
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
                        const isSelf = (cookieName && lowerVal.includes(cookieName.toLowerCase())) || 
                                       (lowerVal === 'cristel jm verga') || 
                                       (lowerVal === 'critel jm verga');
                        if (!isSelf && (author === 'Facebook User' || author.length < 3 || author.toLowerCase().includes('bundle') || author.toLowerCase().includes('worker'))) {
                            author = val;
                        }
                    } else if (entry.type === 'title') {
                        if (lowerVal.includes('video by') || lowerVal.includes('reels')) continue;
                        if (val.length > 5) titleCandidates.push(val.trim());
                    }
                }
            }
        }
    }

    // select smart title
    if (titleCandidates.length > 0) {
        const isGeneric = !finalTitle || 
                         finalTitle.toLowerCase() === 'facebook' || 
                         finalTitle.toLowerCase() === 'facebook video' || 
                         finalTitle.toLowerCase() === 'video' ||
                         finalTitle.toLowerCase() === 'public' ||
                         finalTitle.toLowerCase().startsWith('reel by') ||
                         (cookieName && finalTitle.toLowerCase().includes(cookieName.toLowerCase())) ||
                         (finalTitle.toLowerCase().includes('cristel jm verga')) ||
                         (finalTitle.toLowerCase().includes('critel jm verga'));

        if (isGeneric) {
            // priority hashtags
            const authorIdx = author !== 'Facebook User' ? blobToSearch.indexOf(author) : -1;

            if (authorIdx !== -1) {
                // min distance candidate
                const best = titleCandidates.sort((a, b) => {
                    const distA = Math.abs(blobToSearch.indexOf(a) - authorIdx);
                    const distB = Math.abs(blobToSearch.indexOf(b) - authorIdx);
                    return distA - distB;
                })[0];
                if (best) finalTitle = best.substring(0, 200).trim();
            } else {
                // candidate fallback
                const best = titleCandidates.sort((a, b) => {
                    const aHasHash = a.includes('#') ? 1 : 0;
                    const bHasHash = b.includes('#') ? 1 : 0;
                    if (aHasHash !== bHasHash) return bHasHash - aHasHash;
                    return b.length - a.length;
                })[0];
                if (best) finalTitle = best.substring(0, 200).trim();
            }
        }
    }    // pass 3: cleanup
    if (author === 'Facebook User' || author.toLowerCase().includes('bundle') || author.toLowerCase().includes('worker')) {
        const creatorMatch = blobToSearch.match(/"name":"([^"]+)"(?=.*?"__typename":"User")/);
        if (creatorMatch && creatorMatch[1]) {
            const name = creatorMatch[1];
            const nl = name.toLowerCase();
            if (!nl.includes('bundle') && !nl.includes('worker') && 
                (!cookieName || !nl.includes(cookieName.toLowerCase())) &&
                nl !== 'cristel jm verga' && nl !== 'critel jm verga') {
                author = name;
            }
        }
    }

    // title fallback
    const isStillGeneric = !finalTitle || 
                           finalTitle.toLowerCase() === 'facebook' || 
                           finalTitle.toLowerCase() === 'facebook video' || 
                           finalTitle.toLowerCase() === 'video' ||
                           finalTitle.toLowerCase() === 'public' ||
                           finalTitle.toLowerCase().startsWith('reel by') ||
                           finalTitle.toLowerCase().startsWith('video by') ||
                           (cookieName && finalTitle.toLowerCase().includes(cookieName.toLowerCase())) ||
                           (finalTitle.toLowerCase().includes('cristel jm verga')) ||
                           (finalTitle.toLowerCase().includes('critel jm verga'));

    if (isStillGeneric) finalTitle = `Reel by ${author}`;

    // final filter
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

    // recover thumbnail
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
      id: extractedId,
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
  const format = videoInfo.formats.find((f: Format) => String(f.format_id) === String(options.formatId)) || videoInfo.formats[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  
  return await getQuantumStream(format.url, { 
    'User-Agent': DESKTOP_UA, 
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
