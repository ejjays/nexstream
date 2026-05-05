import { BASE_URL_REGEX } from '../../src/services/extractors/facebook/constants';

const mockHtml = `{"owner":{"__typename":"User","name":"Actual Creator"}}
        {"message":{"text":"Cool Reel Content #trending"}}
        {"video_id":"980670334391314","playable_url_quality_hd":"https://fb.com/video_hd.mp4"}
        {"video_id":"980670334391314","playable_url":"https://fb.com/video_sd.mp4"}`;

const matches = [...mockHtml.matchAll(new RegExp(BASE_URL_REGEX.source, 'g'))];
for (const match of matches) {
    console.log('url:', match[1], 'index:', match.index);
    let start = mockHtml.lastIndexOf('{', match.index);
    let end = mockHtml.indexOf('}', match.index);
    console.log('context:', mockHtml.substring(Math.max(0, start), Math.min(mockHtml.length, end + 100)));
}
