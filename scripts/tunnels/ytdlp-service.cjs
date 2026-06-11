#!/usr/bin/env node
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
const { Readable } = require('node:stream');

const SECRET = process.env.YTDLP_REMOTE_SECRET || '';
const PORT = Number(process.env.YTDLP_SERVICE_PORT) || 5055;
const COOKIES = process.env.YTDLP_COOKIES_FILE || '';
const YTDLP = process.env.YTDLP_BIN || 'yt-dlp';
const MEDIA_CHUNK = 8 * 1024 * 1024;
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

  const upstreamHeaders = {
    'user-agent': UA,
    accept: '*/*',
    referer: 'https://www.youtube.com/',
    origin: 'https://www.youtube.com',
  };

  let start = 0;
  let end = Infinity;
  const clientRange = req.headers.range;
  if (clientRange) {
    const m = /bytes=(\d+)-(\d*)/u.exec(clientRange);
    if (m) {
      start = Number(m[1]);
      end = m[2] ? Number(m[2]) : Infinity;
    }
  }

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let total = null;
  let pos = start;
  try {
    while (total === null || pos <= end) {
      if (aborted) break;
      const sliceEnd =
        end === Infinity
          ? pos + MEDIA_CHUNK - 1
          : Math.min(pos + MEDIA_CHUNK - 1, end);
      const upstream = await fetch(rawUrl, {
        headers: { ...upstreamHeaders, range: `bytes=${pos}-${sliceEnd}` },
      });
      if (upstream.status !== 200 && upstream.status !== 206) {
        if (!res.headersSent)
          res.writeHead(upstream.status === 403 ? 403 : 502);
        res.end();
        return;
      }
      if (total === null) {
        const cr = upstream.headers.get('content-range');
        const match = cr ? /\/(\d+)\s*$/u.exec(cr) : null;
        total = match
          ? Number(match[1])
          : Number(upstream.headers.get('content-length')) || 0;
        if (total > 0 && (end === Infinity || end >= total)) end = total - 1;
        const status = clientRange && total > 0 ? 206 : 200;
        const headers = {
          'Content-Type':
            upstream.headers.get('content-type') || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        };
        if (total > 0) {
          headers['Content-Length'] = String(end - start + 1);
          if (clientRange) {
            headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
          }
        }
        res.writeHead(status, headers);
        console.log(`[media] relaying ${total || '?'} bytes`);
      }
      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body);
        await new Promise((resolve, reject) => {
          nodeStream.on('error', reject);
          nodeStream.on('end', resolve);
          nodeStream.pipe(res, { end: false });
        });
      }
      if (total <= 0) break;
      pos = sliceEnd + 1;
    }
    if (!res.writableEnded) res.end();
  } catch {
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
  }
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
    let args;
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
