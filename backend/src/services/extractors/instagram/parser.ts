import { load, CheerioAPI } from 'cheerio';
import { decode } from '../facebook/utils.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseJson(jsonData: any): unknown {
  const items = (jsonData?.items || []) as any[];
  if (items.length === 0) return null;

  const item = items[0];
  const videoVersions = (item.video_versions || []) as any[];
  const user = item.user;

  return {
    id: item.pk || item.id,
    title: item.caption?.text || 'Instagram Post',
    uploader: user?.full_name || user?.username,
    thumbnail: item.image_versions2?.candidates?.[0]?.url,
    formats: videoVersions.map((version) => ({
      id: version.id,
      video_url: version.url,
      width: version.width,
      height: version.height,
    })),
  };
}

const _extractThumbnailFromCheerio = (cheerioInstance: CheerioAPI) => {
  return (
    cheerioInstance('meta[property="og:image"]').attr('content') ||
    cheerioInstance('img.EmbeddedMediaImage').attr('src')
  );
};

const _extractVideoUrlFromHtml = (html: string) => {
  const videoMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/u);
  return videoMatch ? decode(videoMatch[1]) : null;
};

export function parseEmbed(html: string): unknown {
  const cheerioInstance = load(html);
  const title =
    cheerioInstance('meta[property="og:title"]').attr('content') ||
    cheerioInstance('.Caption').text() ||
    'Instagram Video';

  const uploader =
    cheerioInstance('.Username').text() ||
    cheerioInstance('.UsernameText').text() ||
    'Instagram User';

  const thumbnail = _extractThumbnailFromCheerio(cheerioInstance);
  const videoUrl = _extractVideoUrlFromHtml(html);

  const formats = videoUrl
    ? [
        {
          id: 'hd',
          video_url: videoUrl,
        },
      ]
    : [];

  return {
    id: null,
    title,
    uploader,
    thumbnail,
    formats,
  };
}
