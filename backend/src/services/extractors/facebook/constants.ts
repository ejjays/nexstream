export const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export const HEADERS = {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

export const ID_REGEX = /(?:v=|fbid=|videos\/|reel\/|reels\/|share\/r\/|stories\/)([a-zA-Z0-9_-]+)/;

export const STORY_PATTERNS = [
    /"unified_video_url"\s*:\s*"([^"]+)"/,
    /"playable_url"\s*:\s*"([^"]+)"/,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/
];

export const PHOTO_PATTERNS = [
    /"media"\s*:\s*\{"__typename"\s*:\s*"Photo",.*?"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/,
    /"story_card_info"\s*:\s*\{.*?"story_thumbnail"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/,
    /"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/
];

export const THUMB_PATTERNS = [
    /"preferred_thumbnail"\s*:\s*\{"image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/,
    /"preview_image"\s*:\s*\{"uri"\s*:\s*"([^"]+)"\}/
];

export const BASE_URL_GLOBAL_REGEX = /"base_url":"([^"]+)"/;

export const DASH_PATTERNS = [
    /["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?.{0,2000}?["']?audio_url["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/,
    /["']?audio_url["']?\s*[:=]\s*["']?([^"'\s<]+)["']?.{0,2000}?["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/,
    /FBQualityClass=\\"hd\\"(?:.{0,1000}?)BaseURL>(.*?)</s,
    /representation_id=\\"\d+v\\"(?:.{0,1000}?)base_url\\":\\"(.*?)\\"/s
];

export const BASE_URL_REGEX = /["'](?:base_url|playable_url|playable_url_quality_hd|browser_native_hd_url|browser_native_sd_url|audio_url)["']\s*[:=]\s*["']([^"']+)["']/;

export const METADATA_PATTERNS = {
    bw: /["'](?:bandwidth|bitrate)["']\s*[:=]\s*(\d+)/,
    h: /["']height["']\s*[:=]\s*(\d+)/,
    w: /["']width["']\s*[:=]\s*(\d+)/,
    mime: /"mime_type":"([^"]+)"/,
    videoId: /["']?video_id["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/
};

export const GLOBAL_CDN_AUDIO_REGEX = /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+(?:audio|heaac|mp4a)[^"'\s]+\.mp4[^"'\s]*/g;

export const HD_FALLBACK_PATTERNS = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
    /hd_src\s*:\s*"([^"]+)"/
];

export const SD_FALLBACK_PATTERNS = [
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
    /"playable_url"\s*:\s*"([^"]+)"/,
    /sd_src\s*:\s*"([^"]+)"/,
    /"video_url"\s*:\s*"([^"]+)"/
];

export const RECOVERY_PATTERNS = [
    { type: 'author', p: /"(?:owner|author)":\{"__typename":"(?:User|Page)","name":"([^"]+)"/ },
    { type: 'author', p: /"(?:story_bucket_owner_name|ownerName|author_name)":"([^"]+)"/ },
    { type: 'author', p: /"story_bucket_owner":\{"name":"([^"]+)"/ },
    { type: 'author', p: /"owner_as_page":\{"name":"([^"]+)"/ },
    { type: 'author', p: /"comet_sections":\{"title":\{"text":"([^"]+)"\}/ },
    { type: 'title', p: /"message":\s*\{"text":"([^"]+)"\}/ },
    { type: 'title', p: /"video_title":"([^"]+)"/ },
    { type: 'title', p: /"accessibility_caption":"([^"]+)"/ },
    { type: 'title', p: /"(?:message|node|accessibility_caption)":\s*\{"text":"([^"]+)"\}/ }
];

export const CAPTION_REGEX = /"text":"((?:\\.|[^"\\]){3,1500})"/g;
export const CREATOR_MATCH_REGEX = /"name":"([^"]+)"(?=.*?"__typename":"User")/;
export const GLOBAL_CDN_VIDEO_REGEX = /https?:\/\/[^"'\s]+\.(?:fbcdn\.net|facebook\.com)\/[^"'\s]+\.mp4[^"'\s]*/g;
