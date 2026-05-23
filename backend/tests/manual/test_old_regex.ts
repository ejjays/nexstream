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

const OLD_DASH_PATTERNS = [
    /["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?(?:.*?)["']?audioUrl["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/s,
    /["']?audioUrl["']?\s*[:=]\s*["']?([^"'\s<]+)["']?(?:.*?)["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/s,
    /FBQualityClass=\\"hd\\".*?BaseURL>(.*?)</s,
    /representation_id=\\"\d+v\\".*?base_url\\":\\"(.*?)\\"/s
];

for (const pattern of OLD_DASH_PATTERNS) {
    const match = mockHtml.match(pattern);
    if (match) {
        console.log('OLD MATCHED:', pattern, match[1], match[2]);
    }
}
