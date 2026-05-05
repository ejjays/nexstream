import * as facebookExtractor from '../../src/services/extractors/facebook/index';

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

global.fetch = async (url) => {
    if (url.includes('facebook.com')) {
        return {
            ok: true,
            text: async () => mockHtml,
            url: reelUrl
        } as any;
    }
};

async function run() {
    const info = await facebookExtractor.getInfo(reelUrl, { cookie: 'mock' });
    console.log(info);
}

run();