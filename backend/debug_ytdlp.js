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
            console.log(`Has formats? ${!!json.formats}`);
            console.log(`Has entries? ${!!json.entries}`);
            if (json.entries) {
                console.log(`Entries length: ${json.entries.length}`);
                console.log(`First entry has formats? ${!!json.entries[0].formats}`);
            }
        } catch (e) {
            console.error('JSON parse error');
        }
    });
}

// Test case 1: Standard YouTube
// run('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

// Test case 2: Search query (Simulating the Spotify optimization)
run('ytsearch1:never gonna give you up');
