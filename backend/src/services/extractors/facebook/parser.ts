import {
  ID_REGEX,
  THUMB_PATTERNS,
  DASH_PATTERNS,
  RECOVERY_PATTERNS,
  STORY_PATTERNS,
  PHOTO_PATTERNS,
  HD_FALLBACK_PATTERNS,
  SD_FALLBACK_PATTERNS,
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

  // dash
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
    // hd: browser_native first (cobalt), else story unified_video_url
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
    if (formats.length === 0) {
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
    }

    // sd progressive (also covers story playable_url)
    for (const pattern of SD_FALLBACK_PATTERNS) {
      const match = html.match(pattern);
      if (match) {
        formats.push({
          url: decode(match[1]),
          format_id: 'sd',
          ext: 'mp4',
        });
        break;
      }
    }

    // photo only when no video found
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
  }
  return {
    id: videoId,
    title,
    uploader,
    thumbnail,
    formats,
  };
}
