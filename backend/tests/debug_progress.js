const { spawn } = require('child_process');

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Short video
const args = [
    '--newline',
    '--no-colors',
    '--progress',
    '-o', 'test_video.%(ext)s',
    url
];

console.log(`Running: yt-dlp ${args.join(' ')}`);
const p = spawn('yt-dlp', args);

p.stdout.on('data', (data) => {
    console.log(`STDOUT CHUNK: ${JSON.stringify(data.toString())}`);
});

p.stderr.on('data', (data) => {
    console.log(`STDERR CHUNK: ${data.toString()}`);
});

p.on('close', (code) => {
    console.log(`Exit code: ${code}`);
});