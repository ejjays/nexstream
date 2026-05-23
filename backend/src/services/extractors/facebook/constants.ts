export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const HEADERS = {
  'User-Agent': DESKTOP_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export const ID_REGEX =
  /(?:v=|fbid=|videos\/|reel\/|reels\/|share\/r\/|stories\/)([a-zA-Z0-9_-]+)/u;

export const STORY_PATTERNS = [
  /"unified_video_url"\s*:\s*"([^"]+)"/u,
  /"playable_url"\s*:\s*"([^"]+)"/u,
  /"playable_url_quality_hd"\s*:\s*"([^"]+)"/u,
];

export const PHOTO_PATTERNS = [
  /"media"\s*:\s*\{"__typename"\s*:\s*"Photo",.*?"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/u,
  /"story_card_info"\s*:\s*\{.*?"story_thumbnail"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/u,
  /"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/u,
];

export const THUMB_PATTERNS = [
  /"preferred_thumbnail"\s*:\s*\{"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/u,
  /"preview_image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/u,
];

export const BASE_URL_GLOBAL_REGEX = /"base_url":"([^"]+)"/u;

export const DASH_PATTERNS = [
  /["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?.{0,2000}?["']?audioUrl["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/u,
  /["']?audioUrl["']?\s*[:=]\s*["']?([^"'\s<]+)["']?.{0,2000}?["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/u,
  /FBQualityClass=\\"hd\\"(?:.{0,1000}?)BaseURL>(.*?)</su,
  /representation_id=\\"\d+v\\"(?:.{0,1000}?)base_url\\":\\"(.*?)\\"/su,
];

export const BASE_URL_REGEX =
  /["'](?:base_url|playable_url|playable_url_quality_hd|browser_native_hd_url|browser_native_sd_url|audioUrl)["']\s*[:=]\s*["']([^"']+)["']/u;

export const METADATA_PATTERNS = {
  bw: /["'](?:bandwidth|bitrate)["']\s*[:=]\s*(\d+)/u,
  h: /["']height["']\s*[:=]\s*(\d+)/u,
  w: /["']width["']\s*[:=]\s*(\d+)/u,
  mime: /"mime_type":"([^"]+)"/u,
  videoId: /["']?video_id["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/u,
};

export const GLOBAL_CDN_AUDIO_REGEX =
  /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+(?:audio|heaac|mp4a)[^"'\s]+\.mp4[^"'\s]*/gu;

export const HD_FALLBACK_PATTERNS = [
  /"browser_native_hd_url"\s*:\s*"([^"]+)"/u,
  /"playable_url_quality_hd"\s*:\s*"([^"]+)"/u,
  /hd_src\s*:\s*"([^"]+)"/u,
];

export const SD_FALLBACK_PATTERNS = [
  /"browser_native_sd_url"\s*:\s*"([^"]+)"/u,
  /"playable_url"\s*:\s*"([^"]+)"/u,
  /sd_src\s*:\s*"([^"]+)"/u,
  /"video_url"\s*:\s*"([^"]+)"/u,
];

export const RECOVERY_PATTERNS = [
  {
    type: 'author',
    p: /"(?:owner|author)":\{"__typename":"(?:User|Page)","name":"([^"]+)"/u,
  },
  {
    type: 'author',
    p: /"(?:story_bucket_owner_name|ownerName|author_name)":"([^"]+)"/u,
  },
  { type: 'author', p: /"story_bucket_owner":\{"name":"([^"]+)"/u },
  { type: 'author', p: /"owner_as_page":\{"name":"([^"]+)"/u },
  { type: 'author', p: /"comet_sections":\{"title":\{"text":"([^"]+)"\}/u },
  { type: 'title', p: /"message":\s*\{"text":"([^"]+)"\}/u },
  { type: 'title', p: /"video_title":"([^"]+)"/u },
  { type: 'title', p: /"accessibility_caption":"([^"]+)"/u },
  {
    type: 'title',
    p: /"(?:message|node|accessibility_caption)":\s*\{"text":"([^"]+)"\}/u,
  },
];

export const CAPTION_REGEX = /"text":"((?:\\.|[^"\\]){3,1500})"/gu;
export const CREATOR_MATCH_REGEX =
  /"name":"([^"]+)"(?=.*?"__typename":"User")/u;
export const GLOBAL_CDN_VIDEO_REGEX =
  /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+\.mp4[^"'\s]*/gu;
