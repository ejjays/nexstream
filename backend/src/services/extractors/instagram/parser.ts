import { load } from 'cheerio';
import { decode } from '../facebook/utils.js';
import { IgParsed, IgMedia } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// highest pixel-count rendition wins
function bestVideo(versions: any[]): any {
  return versions.reduce((prev, next) =>
    (prev.width ?? 0) * (prev.height ?? 0) <
    (next.width ?? 0) * (next.height ?? 0)
      ? next
      : prev
  );
}

function mediaFromMobile(node: any): IgMedia | null {
  const videos = node?.video_versions;
  if (Array.isArray(videos) && videos.length > 0) {
    const best = bestVideo(videos);
    return {
      url: best.url,
      isVideo: true,
      width: best.width,
      height: best.height,
    };
  }
  const candidate = node?.image_versions2?.candidates?.[0];
  if (candidate?.url) {
    return {
      url: candidate.url,
      isVideo: false,
      width: candidate.width,
      height: candidate.height,
    };
  }
  return null;
}

function mediaFromGql(node: any): IgMedia | null {
  if (node?.video_url) {
    return {
      url: node.video_url,
      isVideo: true,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  if (node?.display_url) {
    return {
      url: node.display_url,
      isVideo: false,
      width: node.dimensions?.width,
      height: node.dimensions?.height,
    };
  }
  return null;
}

// mobile api items[0], single or carousel
export function parseMobileItem(item: any): IgParsed | null {
  if (!item) return null;

  const carousel = item.carousel_media;
  const media: IgMedia[] = Array.isArray(carousel)
    ? (carousel.map(mediaFromMobile).filter(Boolean) as IgMedia[])
    : ([mediaFromMobile(item)].filter(Boolean) as IgMedia[]);

  if (media.length === 0) return null;

  return {
    id: item.code || item.pk || item.id || null,
    title: item.caption?.text || 'Instagram Post',
    uploader: item.user?.full_name || item.user?.username || 'Instagram User',
    thumbnail: item.image_versions2?.candidates?.[0]?.url,
    media,
  };
}

// graphql shortcode_media, single or sidecar
export function parseGraphqlMedia(node: any): IgParsed | null {
  if (!node) return null;

  const sidecar = node.edge_sidecar_to_children?.edges;
  const media: IgMedia[] = Array.isArray(sidecar)
    ? (sidecar.map((edge: any) => mediaFromGql(edge?.node)).filter(Boolean) as IgMedia[])
    : ([mediaFromGql(node)].filter(Boolean) as IgMedia[]);

  if (media.length === 0) return null;

  return {
    id: node.shortcode || node.id || null,
    title: node.edge_media_to_caption?.edges?.[0]?.node?.text || 'Instagram Post',
    uploader: node.owner?.full_name || node.owner?.username || 'Instagram User',
    thumbnail: node.display_url,
    media,
  };
}

// embed bundles a graphql node in contextJSON
function extractEmbedContext(html: string): any {
  try {
    const initMatch = html.match(/"init",\[\],\[(.*?)\]\],/u);
    if (!initMatch) return null;
    const init = JSON.parse(initMatch[1]);
    if (!init?.contextJSON) return null;
    const ctx = JSON.parse(init.contextJSON);
    return ctx?.gql_data?.shortcode_media || ctx?.gql_data?.xdt_shortcode_media || null;
  } catch {
    return null;
  }
}

export function parseEmbed(html: string): IgParsed | null {
  const ctx = extractEmbedContext(html);
  if (ctx) {
    const structured = parseGraphqlMedia(ctx);
    if (structured) return structured;
  }

  // degraded regex path for older embeds
  const videoMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/u);
  const url = videoMatch ? decode(videoMatch[1]) : null;
  if (!url) return null;

  const page = load(html);
  return {
    id: null,
    title:
      page('meta[property="og:title"]').attr('content') ||
      page('.Caption').text() ||
      'Instagram Video',
    uploader: page('.Username').text() || 'Instagram User',
    thumbnail: page('meta[property="og:image"]').attr('content'),
    media: [{ url, isVideo: true }],
  };
}
