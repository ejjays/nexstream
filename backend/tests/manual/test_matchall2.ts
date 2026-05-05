import { BASE_URL_REGEX } from '../../src/services/extractors/facebook/constants';

const mockHtml = `{"owner":{"__typename":"User","name":"Actual Creator"}}` + ' '.repeat(50000) +
        `{"video_id":"980670334391314","playable_url_quality_hd":"https://fb.com/video_hd.mp4"}` + ' '.repeat(50000);

console.time('matchAll');
const matches = [...mockHtml.matchAll(new RegExp(BASE_URL_REGEX.source, 'g'))];
console.timeEnd('matchAll');
