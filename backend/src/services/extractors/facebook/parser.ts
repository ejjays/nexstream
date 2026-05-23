import {
  ID_REGEX,
  THUMB_PATTERNS,
  DASH_PATTERNS,
  RECOVERY_PATTERNS,
  STORY_PATTERNS,
  PHOTO_PATTERNS,
  HD_FALLBACK_PATTERNS,
} from './constants.js';
import { decode } from './utils.js';

export function parseHtml(html: string, url: string): unknown {
  const idMatch = url.match(ID_REGEX);
  const videoId = idMatch ? idMatch[1] : null;

  let title = '';
  let uploader = '';
  let thumbnail = '';

  // recover metadata
  for (const recovery of RECOVERY_PATTERNS) {
    const match = html.match(recovery.pattern);
    if (match) {
      if (recovery.type === 'title' && !title) title = decode(match[1]);
      if (recovery.type === 'author' && !uploader) uploader = decode(match[1]);
    }
  }

  // thumbnail
  for (const pattern of THUMB_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      thumbnail = decode(match[1]);
      break;
    }
  }

  const formats: unknown[] = [];

  // DASH
  for (const pattern of DASH_PATTERNS) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[2]) {
        formats.push({
          url: decode(match[1]),
          format_id: 'hd',
          ext: 'mp4',
        });
        formats.push({
          url: decode(match[2]),
          format_id: 'audio',
          ext: 'm4a',
          acodec: 'aac',
        });
      } else if (match[1]) {
        formats.push({
          url: decode(match[1]),
          format_id: 'sd',
          ext: 'mp4',
        });
      }
    }
  }

  if (formats.length === 0) {
    // stories fallback
    for (const pattern of STORY_PATTERNS) {
      const match = html.match(pattern);
      if (match) {
        formats.push({
          url: decode(match[1]),
          format_id: 'hd',
          ext: 'mp4',
        });
        break;
      }
    }

    // photo fallback
    if (formats.length === 0) {
      for (const pattern of PHOTO_PATTERNS) {
        const match = html.match(pattern);
        if (match) {
          formats.push({
            url: decode(match[1]),
            format_id: 'photo',
            resolution: 'Original Photo',
          });
          break;
        }
      }
    }

    // HD fallback
    if (formats.length === 0) {
      for (const pattern of HD_FALLBACK_PATTERNS) {
        const match = html.match(pattern);
        if (match) {
          formats.push({
            url: decode(match[1]),
            format_id: 'hd',
            ext: 'mp4',
          });
          break;
        }
      }
    }
  }
  return {
    id: videoId,
    title,
    uploader,
    thumbnail,
    formats,
  };
}

export function parseDash(dashXml: string): unknown[] {
  const dashManifests: Array<{ bandwidth: string; url: string }> = [];

  const matches = dashXml.matchAll(
    /<Representation[^>]*>(.*?)<\/Representation>/gsu
  );
  for (const match of matches) {
    const content = match[1];
    const bandwidthMatch = match[0].match(/bandwidth="(\d+)"/u);
    const urlMatch = content.match(/<BaseURL[^>]*>(.*?)<\/BaseURL>/u);

    if (bandwidthMatch && urlMatch) {
      dashManifests.push({
        bandwidth: bandwidthMatch[1],
        url: decode(urlMatch[1]),
      });
    }
  }

  const sortedManifests = dashManifests.sort((formatA, formatB) => {
    const bandwidthA = parseInt(formatA.bandwidth || '0', 10);
    const bandwidthB = parseInt(formatB.bandwidth || '0', 10);
    return bandwidthB - bandwidthA;
  });

  const formats: unknown[] = [];
  if (sortedManifests.length > 0) {
    formats.push({
      url: sortedManifests[0].url,
      format_id: 'hd',
      bandwidth: sortedManifests[0].bandwidth,
    });
  }

  return formats;
}
