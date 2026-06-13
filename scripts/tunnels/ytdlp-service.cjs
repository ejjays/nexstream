'use strict';

/**
 * residential extraction and media proxy.
 *
 * handles yt-dlp calls and googlevideo relaying
 * to bypass ip-based speed limits.
 * uses hmac for signed media access.
 */
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const SECRET = process.env.YTDLP_REMOTE_SECRET || '';
const PORT = Number(process.env.YTDLP_SERVICE_PORT) || 5055;
const COOKIES = process.env.YTDLP_COOKIES_FILE || '';
const YTDLP = process.env.YTDLP_BIN || 'yt-dlp';
const MEDIA_CHUNK = 8 * 1024 * 1024;
const MAX_MEDIA_RETRIES = 5;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// prevent rce and credential leaks
const FORBIDDEN = new Set([
  '--exec',
  '--exec-before-download',
  '--external-downloader',
  '--external-downloader-args',
  '--batch-file',
  '-a',
  '--load-info-json',
  '--load-info',
  '--cookies-from-browser',
  '--postprocessor-args',
  '--ppa',
  '--config-locations',
]);

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ensures requests originated from backend
function verifyMediaSig(rawUrl, exp, sig) {
  if (!SECRET || !sig || !exp) return false;
  if (Date.now() > Number(exp)) return false;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${rawUrl}\n${exp}`)
    .digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// restrict proxying to trusted domains
function isGooglevideo(rawUrl) {
  try {
    return /(^|\.)googlevideo\.com$/iu.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

function parseRange(rangeHeader) {
  let start = 0;
  let end = Infinity;
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/u.exec(rangeHeader);
    if (m) {
      start = Number(m[1]);
      end = m[2] ? Number(m[2]) : Infinity;
    }
  }
  return { start, end };
}

// bypasses per-connection speed limits
async function handleMedia(parsed, req, res) {
  const rawUrl = parsed.searchParams.get('u') || '';
  const exp = parsed.searchParams.get('e') || '';
  const sig = parsed.searchParams.get('s') || '';

  if (!verifyMediaSig(rawUrl, exp, sig)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!isGooglevideo(rawUrl)) {
    res.writeHead(400);
    res.end('bad target');
    return;
  }

  const { start, end } = parseRange(req.headers.range);

  try {
    await relayChunks(rawUrl, start, end, req, res);
    if (!res.writableEnded) res.end();
  } catch {
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
  }
}

// finalizes the response for a failed/blocked chunk.
// returns true when handled, signalling the relay loop to stop.
function writeChunkError(res, chunk) {
  if (!chunk) {
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
    return true;
  }
  if (chunk.status === 403) {
    if (!res.headersSent) res.writeHead(403);
    res.end();
    return true;
  }
  return false;
}

// derives the total size from the first upstream chunk, clamps the range end,
// and writes the response head. returns the resolved { total, currentEnd }.
function initRelayResponse(req, res, chunkHeaders, start, currentEnd) {
  const cr = chunkHeaders.get('content-range');
  const match = cr ? /\/(\d+)\s*$/u.exec(cr) : null;
  const total = match
    ? Number(match[1])
    : Number(chunkHeaders.get('content-length')) || 0;

  let resolvedEnd = currentEnd;
  if (total > 0 && (currentEnd === Infinity || currentEnd >= total)) {
    resolvedEnd = total - 1;
  }

  const status = req.headers.range && total > 0 ? 206 : 200;
  const headers = {
    'Content-Type':
      chunkHeaders.get('content-type') || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  if (total > 0) {
    headers['Content-Length'] = String(resolvedEnd - start + 1);
    if (req.headers.range) {
      headers['Content-Range'] = `bytes ${start}-${resolvedEnd}/${total}`;
    }
  }
  res.writeHead(status, headers);
  console.log(`[media] relaying ${total || '?'} bytes`);
  return { total, currentEnd: resolvedEnd };
}

async function relayChunks(rawUrl, start, end, req, res) {
  const upstreamHeaders = {
    'user-agent': UA,
    accept: '*/*',
    referer: 'https://www.youtube.com/',
    origin: 'https://www.youtube.com',
  };

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let total = null;
  let pos = start;
  let currentEnd = end;

  while (total === null || pos <= currentEnd) {
    if (aborted) break;
    const sliceEnd =
      currentEnd === Infinity
        ? pos + MEDIA_CHUNK - 1
        : Math.min(pos + MEDIA_CHUNK - 1, currentEnd);

    const chunk = await fetchChunk(
      rawUrl,
      pos,
      sliceEnd,
      upstreamHeaders,
      aborted
    );
    if (writeChunkError(res, chunk)) return;

    const { chunkBuf, chunkHeaders } = chunk;

    if (total === null) {
      ({ total, currentEnd } = initRelayResponse(
        req,
        res,
        chunkHeaders,
        start,
        currentEnd
      ));
    }

    if (chunkBuf?.length && !aborted) {
      if (!res.write(chunkBuf)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    if (total <= 0) break;
    pos = sliceEnd + 1;
  }
}

async function fetchChunk(rawUrl, pos, sliceEnd, headers, aborted) {
  for (let attempt = 0; attempt < MAX_MEDIA_RETRIES; attempt += 1) {
    if (aborted) return null;
    try {
      const upstream = await fetch(rawUrl, {
        headers: { ...headers, range: `bytes=${pos}-${sliceEnd}` },
      });
      if (upstream.status === 403) return { status: 403 };
      if (upstream.status !== 200 && upstream.status !== 206) {
        throw new Error(`upstream status ${upstream.status}`);
      }
      return {
        chunkHeaders: upstream.headers,
        chunkBuf: Buffer.from(await upstream.arrayBuffer()),
      };
    } catch {
      if (aborted) return null;
      console.warn(
        `[media] transient drop, retry ${attempt + 1}/${MAX_MEDIA_RETRIES}`
      );
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return null;
}

function handleYtdlp(req, res) {
  if (!SECRET || req.headers['x-ytdlp-secret'] !== SECRET) {
    res.writeHead(401);
    res.end('unauthorized');
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 200000) req.destroy();
  });
  req.on('end', () => {
    let args = null;
    try {
      args = JSON.parse(body).args;
    } catch {
      sendJson(res, 400, { error: 'bad json' });
      return;
    }
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      sendJson(res, 400, { error: 'bad args' });
      return;
    }
    if (args.some((a) => FORBIDDEN.has(a))) {
      sendJson(res, 403, { error: 'forbidden arg' });
      return;
    }
    const finalArgs = [];
    if (COOKIES && fs.existsSync(COOKIES)) finalArgs.push('--cookies', COOKIES);
    finalArgs.push(...args);
    const child = spawn(YTDLP, finalArgs);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) =>
      sendJson(res, 200, {
        stdout: '',
        stderr: String(err.message || err),
        code: 1,
      })
    );
    child.on('close', (code) => sendJson(res, 200, { stdout, stderr, code }));
    res.on('close', () => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://127.0.0.1');
  const path = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.method === 'GET' && path === '/media') {
    handleMedia(parsed, req, res);
    return;
  }
  if (req.method === 'POST' && path === '/ytdlp') {
    handleYtdlp(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ytdlp-service] listening on 127.0.0.1:${PORT}`);
});
