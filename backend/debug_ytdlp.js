const { spawn } = require('child_process');

function run(url) {
    console.log(`Running for: ${url}`);
    const p = spawn('yt-dlp', [
        '--dump-json',
        '--no-playlist',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        url
    ]);

    let data = '';
    p.stdout.on('data', d => data += d);
    p.stderr.on('data', d => console.error(`stderr: ${d}`));
    p.on('close', code => {
        console.log(`Exit code: ${code}`);
        try {
            const json = JSON.parse(data);
            console.log("Main Thumbnail:", json.thumbnail);
            if (json.thumbnails) {
                console.log("Thumbnails Array Length:", json.thumbnails.length);
                json.thumbnails.forEach((t, i) => {
                    console.log(`[${i}] ID: ${t.id} | Res: ${t.resolution || t.width + 'x' + t.height} | URL: ${t.url}`);
                });
            } else {
                console.log("No thumbnails array found.");
            }
        } catch (e) {
            console.error('JSON parse error or invalid output');
        }
    });
}

// Public IG Reel (NASA) - Note: IG links expire/rotate often, testing generic structure
run('https://www.instagram.com/p/C2s_x_xL_J-/'); 
