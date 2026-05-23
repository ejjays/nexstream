import { load, CheerioAPI } from 'cheerio';
import { Format } from '../../../types/index.js';

export interface RawInstagramData {
  extractedId: string;
  title: string;
  finalTitle?: string;
  ogTitle?: string;
  ogDesc?: string;
  author: string;
  thumbnail: string | null;
  formats: Format[];
  isRestricted?: boolean;
}

interface InstagramMedia {
  video_url?: string;
  display_url?: string;
  display_src?: string;
  isVideo?: boolean;
  edge_sidecar_to_children?: {
    edges: Array<{
      node: InstagramMedia;
    }>;
  };
  owner?: {
    username?: string;
  };
  thumbnail_src?: string;
  edge_media_to_caption?: {
    edges: Array<{
      node: {
        text: string;
      };
    }>;
  };
}

interface InstagramOembedData {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

export function parseOembed(
  data: InstagramOembedData,
  existing: RawInstagramData
): RawInstagramData {
  const newData = { ...existing };
  if (data.title) newData.title = data.title;
  if (data.author_name) newData.author = data.author_name;
  if (data.thumbnail_url) newData.thumbnail = data.thumbnail_url;
  return newData;
}

export function parseGraphql(
  data: Record<string, unknown>,
  existing: RawInstagramData
): RawInstagramData {
  const newData = { ...existing };
  const media = (data.shortcode_media ||
    data.xdt_shortcode_media ||
    (data.data as Record<string, unknown>)
      ?.xdt_shortcode_media) as InstagramMedia;
  if (!media) return newData;

  if (media.owner?.username) newData.author = media.owner.username;

  if (media.edge_media_to_caption?.edges?.[0]?.node?.text) {
    newData.title = media.edge_media_to_caption.edges[0].node.text;
  }

  if (media.video_url) {
    newData.formats.push({
      formatId: 'video',
      url: media.video_url,
      extension: 'mp4',
      resolution: 'unknown',
      isVideo: true,
      isAudio: true,
      isMuxed: true,
    });
  }

  if (media.display_url && !newData.thumbnail) {
    newData.thumbnail = media.display_url;
  }

  return newData;
}

function extractCaption(
  html: string,
  jsonData: Record<string, unknown> | null,
  $: CheerioAPI
): string {
  const media = (jsonData?.shortcode_media || jsonData?.xdt_shortcode_media) as
    | InstagramMedia
    | undefined;
  if (media?.edge_media_to_caption?.edges?.[0]?.node?.text) {
    return media.edge_media_to_caption.edges[0].node.text;
  }

  const caption =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  if (caption) return caption;

  // search scripts
  const captionMatch = html.match(
    /"edge_media_to_caption":\s*\{\s*"edges":\s*\[\s*\{\s*"node":\s*\{\s*"text":\s*"([^"]+)"/
  );
  if (captionMatch) return captionMatch[1];

  return '';
}

export function parseEmbed(
  html: string,
  existing: RawInstagramData
): RawInstagramData {
  const newData = { ...existing };
  const cheerioDoc = load(html);

  let jsonData: { shortcode_media?: InstagramMedia } | null = null;
  try {
    const scriptContent = cheerioDoc('script')
      .filter((_i, el) => {
        const text = cheerioDoc(el).text();
        return (
          text.includes('window.__additionalDataLoaded') ||
          text.includes('_sharedData')
        );
      })
      .first()
      .text();

    if (scriptContent) {
      const jsonStr = scriptContent.match(/\{.*\}/)?.[0];
      if (jsonStr) jsonData = JSON.parse(jsonStr);
    }
  } catch {
    console.debug('[JS-IG] Failed to parse embed JSON');
  }

  const videoUrl =
    jsonData?.shortcode_media?.video_url ||
    html.match(/"video_url":\s*"([^"]+)"/)?.[1] ||
    cheerioDoc('meta[property="og:video"]').attr('content');

  const displayUrl =
    jsonData?.shortcode_media?.display_url ||
    html.match(/"display_url":\s*"([^"]+)"/)?.[1] ||
    cheerioDoc('meta[property="og:image"]').attr('content');

  if (videoUrl) {
    if (!newData.formats.some((f) => f.url === videoUrl)) {
      newData.formats.push({
        formatId: 'video',
        url: videoUrl,
        extension: 'mp4',
        resolution: 'hd',
        isVideo: true,
        isAudio: true,
        isMuxed: true,
      });
    }
  }

  if (displayUrl) {
    if (!newData.formats.some((f) => f.url === displayUrl)) {
      newData.formats.push({
        formatId: 'photo',
        url: displayUrl,
        extension: 'jpg',
        resolution: 'hd',
        isVideo: false,
        isAudio: false,
        isMuxed: false,
      });
    }
  }

  if (!videoUrl && !displayUrl) {
    console.debug('[JS-IG] No video_url or display_url found in embed page');
  }

  const embedAuthor = cheerioDoc('.UsernameText').text().trim();
  if (embedAuthor) newData.author = embedAuthor;

  const caption = extractCaption(html, jsonData, cheerioDoc);

  const possibleTitles = [
    caption,
    cheerioDoc('meta[property="og:title"]').attr('content'),
    cheerioDoc('meta[property="og:description"]').attr('content'),
    cheerioDoc('meta[name="description"]').attr('content'),
    cheerioDoc('link[rel="alternate"][title]').attr('title'),
  ].filter((title): title is string =>
    Boolean(
      title &&
      title !== 'Instagram Video' &&
      !title.includes('See Instagram photos and videos')
    )
  );

  if (possibleTitles.length > 0) {
    newData.title =
      caption ||
      possibleTitles.reduce((prev, curr) =>
        prev.length > curr.length ? prev : curr
      );
  }

  if (!newData.thumbnail) {
    newData.thumbnail =
      jsonData?.shortcode_media?.display_url ||
      cheerioDoc('meta[property="og:image"]').attr('content') ||
      cheerioDoc('.EmbeddedMediaImage').attr('src') ||
      null;
  }

  return newData;
}
