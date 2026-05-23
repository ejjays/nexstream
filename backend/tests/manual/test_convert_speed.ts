import axios from 'axios';

async function testConvert() {
  console.log('Testing /convert speed...');
  const url =
    'http://127.0.0.1:5000/convert?url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F1d1A5Sx5dK%2F&format=mp4&formatId=1644708646864639v&id=test1234';

  const start = Date.now();
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
    });

    let totalBytes = 0;
    let lastBytes = 0;
    let lastTime = Date.now();

    response.data.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
    });

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      const bytesSinceLast = totalBytes - lastBytes;
      const speedMB = bytesSinceLast / (1024 * 1024) / elapsed;
      console.log(
        `Speed: ${speedMB.toFixed(2)} MB/s | Total: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
      );
      lastBytes = totalBytes;
      lastTime = now;
    }, 1000);

    response.data.on('end', () => {
      clearInterval(timer);
      const duration = (Date.now() - start) / 1000;
      console.log(`Done! Total Time: ${duration.toFixed(2)}s`);
    });
  } catch (e: unknown) {
    console.error('Error:', (e as Error).message);
  }
}
testConvert();
