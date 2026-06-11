#!/usr/bin/env node
'use strict';

/**
 * phone-side yt-dlp service.
 *
 * runs yt-dlp on residential IP for the backend.
 * listens on loopback; exposed via cloudflare tunnel.
 * dangerous flags are rejected; local cookies injected.
 */
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const SECRET = process.env.YTDLP_REMOTE_SECRET || '';
const PORT = Number(process.env.YTDLP_SERVICE_PORT) || 5055;
const COOKIES = process.env.YTDLP_COOKIES_FILE || '';
const YTDLP = process.env.YTDLP_BIN || 'yt-dlp';

// prevent malicious flag execution
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

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/ytdlp') {
    res.writeHead(404);
    res.end();
    return;
  }
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
      sendJson(res, 200, { stdout: '', stderr: String(err.message || err), code: 1 })
    );
    child.on('close', (code) => sendJson(res, 200, { stdout, stderr, code }));
    res.on('close', () => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ytdlp-service] listening on 127.0.0.1:${PORT}`);
});
