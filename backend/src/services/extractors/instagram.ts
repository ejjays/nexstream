import { load } from 'cheerio';
import { getQuantumStream } from '../../utils/proxy.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
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
  const onProgress = options.onProgress || (() => {});

  try {
    const shortcode = url.split('/p/')[1]?.split('/')[0] || 
                      url.split('/reel/')[1]?.split('/')[0] || 
                      url.split('/reels/')[1]?.split('/')[0];
    
    if (!shortcode) return null;
    console.log(`[JS-IG] info: ${shortcode}`);
    onProgress('fetching_info', 15, 'Scanning Instagram Embeds...', 'NETWORK: INITIALIZING_IG_HANDSHAKE');

    const formats: Format[] = [];
    let title = '';
    let author = 'Instagram User';
    let thumbnail: string | null = null;

    // try oembed api
    try {
        const oembedUrl = `https://api.instagram.com/oembed/?url=https://www.instagram.com/p/${shortcode}/`;
        const ores = await fetch(oembedUrl, { headers: HEADERS });
        if (ores.ok) {
            const odata: any = await ores.json();
            title = odata.title;
            author = odata.author_name || author;
            thumbnail = odata.thumbnail_url || thumbnail;
            onProgress('fetching_info', 18, 'Extracting OEmbed Meta...', 'API: RESOLVING_IG_OE_SIGNATURES');
        }
    } catch (e) {}

    // try embed page
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const res = await fetch(embedUrl, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000)
      });
      
      if (res.ok) {
        onProgress('fetching_info', 22, 'Decoding GraphQL streams...', 'PARSER: ANALYZING_JS_DOM_STRUCTURE');
        const html = await res.text();
        const $ = load(html);
        
        let jsonData: any = null;
        try {
          // json data
          const jsonMatch = html.match(/window\.__additionalDataLoaded\s*\(.*,\s*({.*})\s*\);/) || 
                          html.match(/window\._sharedData\s*=\s*({.*});/);
          
          if (jsonMatch) {
            jsonData = JSON.parse(jsonMatch[1]);
          } else {
            // fallback json
            const scriptBlocks = $('script').toArray();
            for (const script of scriptBlocks) {
              const content = $(script).html();
              if (content && content.includes('video_url')) {
                // parse objects
                const jsonMatches = content.match(/({.*?})/g) || [content.match(/{.*}/)?.[0]];
                
                for (const matchStr of jsonMatches) {
                  if (!matchStr) continue;
                  try {
                    const parsed = JSON.parse(matchStr);
                    const media = parsed.shortcode_media || parsed.graphql?.shortcode_media || parsed;
                    
                    // carousel
                    let targetMedia = media;
                    if (media.edge_sidecar_to_children?.edges?.length > 0) {
                        const firstVideo = media.edge_sidecar_to_children.edges.find((e: any) => e.node?.is_video || e.node?.video_url);
                        if (firstVideo) targetMedia = firstVideo.node;
                    }

                    if (targetMedia.video_url) {
                      jsonData = parsed;
                      jsonData._extractedMedia = targetMedia; // tag media
                      break;
                    }
                  } catch (e) {}
                }
                if (jsonData) break;
              }
            }
          }
        } catch (e: unknown) {
          const error = e as Error;
          console.debug(`[JS-IG] JSON Parse Error: ${error.message}`);
        }

        // video url
        let videoUrl: string | null = null;
        if (jsonData) {
          const media = jsonData._extractedMedia || jsonData.shortcode_media || jsonData.graphql?.shortcode_media || jsonData;
          videoUrl = media.video_url || jsonData.video_url;
        }

        // regex fallback
        if (!videoUrl) {
          const videoMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/\\"video_url\\":\\"(.*?)\\"/);
          if (videoMatch) {
              videoUrl = videoMatch[1]
                  .replace(/\u0026/g, '&')
                  .replace(/\\u0026/g, '&')
                  .replace(/\\/g, '');
          }
        }

        if (videoUrl) {
            formats.push({
                format_id: 'best',
                url: videoUrl,
                ext: 'mp4',
                resolution: 'Source (HD)',
                vcodec: 'yes',
                acodec: 'yes',
                is_muxed: true,
                is_video: true,
                is_audio: true
            });
        }

        // extract metadata
        const embedAuthor = $('.UsernameText').text().trim();
        if (embedAuthor) author = embedAuthor;
        
        // caption
        let scriptCaption = '';
        if (jsonData) {
           scriptCaption = jsonData.caption || 
                           jsonData.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
                           jsonData.graphql?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        }

        if (!scriptCaption) {
          const captionMatch = html.match(/\"caption\":\"(.*?)\"/) || html.match(/"caption":"([^"]+)"/);
          if (captionMatch) {
              scriptCaption = captionMatch[1]
                  .replace(/\\u([0-9a-fA-F]{4})/g, (match: any, grp: string) => String.fromCharCode(parseInt(grp, 16)))
                  .replace(/\\n/g, '\n')
                  .replace(/\n/g, '\n')
                  .replace(/\"/g, '"');
          }
        }

        const possibleTitles = [
            scriptCaption,
            $('.CaptionText').text().trim(),
            $('meta[property="og:title"]').attr('content'),
            $('link[rel="alternate"][title]').attr('title')
        ].filter(t => t && t !== 'Instagram Video');

        if (possibleTitles.length > 0) {
            title = possibleTitles.reduce((a, b) => a.length > b.length ? a : b) as string;
        }

        if (!thumbnail) {
            thumbnail = jsonData?.display_url || 
                        jsonData?.shortcode_media?.display_url ||
                        $('meta[property="og:image"]').attr('content') || 
                        $('.EmbeddedMediaImage').attr('src') || null;
        }
      } else {
        console.warn(`[JS-IG] Embed page fetch failed with status: ${res.status}`);
      }
    } catch (e: any) {
      console.error(`[JS-IG] Embed parser exception: ${e.message}`);
    }

    if (formats.length === 0) return null;

    // clean title
    if (title) {
        title = title.split(' | ')[0].trim();
        title = title.split(' • ')[0].trim();
        title = title.split(' \u00b7 ')[0].trim();
        title = title.replace(/\\\/|\\\\\/|\\|\//g, (match) => {
            if (match.includes('/')) return '/';
            return match;
        });
    }

    // get file sizes
    await Promise.all(formats.map(async f => {
        try {
          const hRes = await fetch(f.url, { 
              method: 'HEAD', 
              headers: { 'User-Agent': MOBILE_UA },
              signal: AbortSignal.timeout(2000) 
          });
          const len = hRes.headers.get('content-length');
          if (len) f.filesize = parseInt(len);
        } catch (e) {}
    }));

    return {
      id: shortcode,
      extractor_key: 'instagram',
      is_js_info: true,
      title: title || 'Instagram Video',
      uploader: author || 'Instagram User',
      author: author || 'Instagram User',
      thumbnail: thumbnail || '',
      webpage_url: url,
      formats: formats
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[JS-IG] Error: ${error.message}`);
    return null;
  }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  const format = videoInfo.formats.find(f => String(f.format_id) === String(options.formatId)) || videoInfo.formats?.[0];
  if (!format || !format.url) throw new Error('No stream URL found');
  
  return await getQuantumStream(format.url, { 'User-Agent': MOBILE_UA, 'Referer': 'https://www.instagram.com/' });
}
