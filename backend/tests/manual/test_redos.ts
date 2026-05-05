const regex = /["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*[:=]\s*["']?([^"'\s<]+)["']?[^}]*?["']?audio_url["']?\s*[:=]\s*["']?([^"'\s<]+)["']?/;
const badString = '"browser_native_hd_url":"https://fb.com/video_hd.mp4"' + ' '.repeat(100000) + 'xyz';

console.time('regex');
regex.test(badString);
console.timeEnd('regex');
