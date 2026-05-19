import { getInfo } from '../../src/services/extractors/facebook/index.js';

const reelUrl = 'https://www.facebook.com/reel/980670334391314/';
const mockHtml = `
  <html>
    <head>
      <meta property="og:title" content="Facebook">
      <meta property="og:description" content="Cool Reel Content #trending">
      <meta property="og:image" content="https://fb.com/thumb.jpg">
    </head>
    <body>
      <script>
        {"owner":{"__typename":"User","name":"Actual Creator"}}
        {"message":{"text":"Cool Reel Content #trending"}}
        {"video_id":"980670334391314","playable_url_quality_hd":"https://fb.com/video_hd.mp4"}
        {"video_id":"980670334391314","playable_url":"https://fb.com/video_sd.mp4"}
      </script>
    </body>
  </html>
`;

global.fetch = (url: string): Promise<Response> => {
    if (url.includes('facebook.com')) {
        return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(mockHtml),
            url: reelUrl,
            headers: new Headers()
        } as Response);
    }
    return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
        url,
        headers: new Headers()
    } as Response);
};

async function run() {
    const info = await getInfo(reelUrl, { cookie: 'mock' });
    console.log(info);
}

run();