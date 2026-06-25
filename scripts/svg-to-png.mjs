#!/usr/bin/env node
// offline svg -> notification png. node built-ins only.
// usage: node scripts/svg-to-png.mjs <in.svg> <out.png> [--size=256] [--pad=0.5]
//        [--bg=#000000] [--fg=#ffffff] [--no-circle] [--even-odd] [--quiet]
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = new Map(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/u, '').split('=');
      return [k, v ?? true];
    })
);

const [input, output] = positional;
if (!input || !output) {
  console.error(
    'usage: node scripts/svg-to-png.mjs <in.svg> <out.png> [flags]'
  );
  process.exit(1);
}

const SIZE = Number(flags.get('size') ?? 256);
const PAD = Number(flags.get('pad') ?? 0.5);
const SS = 4;
const INTERNAL = SIZE * SS;
const DRAW_CIRCLE = !flags.has('no-circle');
const EVEN_ODD = flags.has('even-odd');
const QUIET = flags.has('quiet');
const BG = parseColor(flags.get('bg') ?? '#000000');
const FG = parseColor(flags.get('fg') ?? '#ffffff');
const BG_STOPS = flags.get('bg-gradient')
  ? parseStops(String(flags.get('bg-gradient')))
  : null;
const [FOCAL_X, FOCAL_Y] = String(flags.get('bg-focal') ?? '0.5,0.5')
  .split(',')
  .map(Number);
const BG_RADIUS = Number(flags.get('bg-radius') ?? 0.75);
const BG_LINEAR = flags.get('bg-linear')
  ? String(flags.get('bg-linear')).split(',').map(Number)
  : null;
const MULTICOLOR = flags.has('multicolor');
const KEEP_BG = flags.has('keep-bg');

function parseColor(hex) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function parseStops(spec) {
  return spec
    .split(',')
    .map((part) => {
      const [off, hex] = part.split(':');
      return { off: Number(off), rgb: parseColor(hex) };
    })
    .sort((a, b) => a.off - b.off);
}

function parseTransform(spec) {
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  const tr = spec.match(/translate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/u);
  if (tr) {
    tx = parseFloat(tr[1]);
    ty = tr[2] !== undefined ? parseFloat(tr[2]) : 0;
  }
  const sc = spec.match(/scale\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/u);
  if (sc) {
    sx = parseFloat(sc[1]);
    sy = sc[2] !== undefined ? parseFloat(sc[2]) : sx;
  }
  return { tx, ty, sx, sy };
}

function applyTransform(subpaths, tf) {
  for (const sp of subpaths)
    for (const pt of sp) {
      pt[0] = tf.tx + tf.sx * pt[0];
      pt[1] = tf.ty + tf.sy * pt[1];
    }
}

function numAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]+)"`, 'iu'));
  return m ? parseFloat(m[1]) : NaN;
}

function circlePolygon(cx, cy, r) {
  const steps = 128;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function gradientColor(t) {
  const stops = BG_STOPS;
  if (t <= stops[0].off) return stops[0].rgb;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.off && t <= b.off) {
      const f = (t - a.off) / (b.off - a.off || 1);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1].rgb;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const svg = fs.readFileSync(input, 'utf8');
// svgrepo exports wrap the real icon in iconCarrier; skip bg blobs unless kept
const iconIdx = KEEP_BG ? -1 : svg.search(/SVGRepo_iconCarrier/u);
const scope = iconIdx >= 0 ? svg.slice(iconIdx) : svg;
const elements = [...scope.matchAll(/<(path|circle)\b[^>]*>/giu)];
const paths = [];
for (const el of elements) {
  const tag = el[0];
  const kind = el[1].toLowerCase();
  const fm = tag.match(/\bfill="([^"]+)"/iu);
  const fill = (fm ? fm[1] : '').trim();
  // url() fills are brand backgrounds we replace with our own shape
  if (/^url\(/iu.test(fill) || fill.toLowerCase() === 'none') continue;
  let sub = [];
  if (kind === 'circle') {
    const r = numAttr(tag, 'r');
    if (!(r > 0)) continue;
    sub = [circlePolygon(numAttr(tag, 'cx') || 0, numAttr(tag, 'cy') || 0, r)];
  } else {
    const dm = tag.match(/\bd="([^"]+)"/iu);
    if (!dm) continue;
    parsePath(dm[1], sub);
  }
  if (sub.length === 0) continue;
  const tm = tag.match(/\btransform="([^"]+)"/iu);
  if (tm) applyTransform(sub, parseTransform(tm[1]));
  const color = MULTICOLOR && /^#/u.test(fill) ? parseColor(fill) : FG;
  paths.push({ subpaths: sub, color });
}
if (paths.length === 0) {
  console.error('no renderable <path> geometry found in svg');
  process.exit(1);
}

function parsePath(d, out) {
  const tokens =
    d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) || [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let pcx = 0;
  let pcy = 0;
  let prev = '';
  let cur = null;
  const num = () => parseFloat(tokens[i++]);
  const start = (x, y) => {
    cur = [[x, y]];
    out.push(cur);
    sx = x;
    sy = y;
  };
  const line = (x, y) => {
    if (!cur) start(x, y);
    else cur.push([x, y]);
  };
  const cubic = (x1, y1, x2, y2, x, y) => {
    const steps = 32;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const px =
        u * u * u * cx +
        3 * u * u * t * x1 +
        3 * u * t * t * x2 +
        t * t * t * x;
      const py =
        u * u * u * cy +
        3 * u * u * t * y1 +
        3 * u * t * t * y2 +
        t * t * t * y;
      line(px, py);
    }
    pcx = x2;
    pcy = y2;
  };
  const quad = (x1, y1, x, y) => {
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const px = u * u * cx + 2 * u * t * x1 + t * t * x;
      const py = u * u * cy + 2 * u * t * y1 + t * t * y;
      line(px, py);
    }
    pcx = x1;
    pcy = y1;
  };
  const arc = (rx, ry, rot, laf, sf, x, y) => {
    if (rx === 0 || ry === 0) {
      line(x, y);
      return;
    }
    const phi = (rot * Math.PI) / 180;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const dx = (cx - x) / 2;
    const dy = (cy - y) / 2;
    const x1p = cp * dx + sp * dy;
    const y1p = -sp * dx + cp * dy;
    let rxa = Math.abs(rx);
    let rya = Math.abs(ry);
    const lambda = (x1p * x1p) / (rxa * rxa) + (y1p * y1p) / (rya * rya);
    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rxa *= s;
      rya *= s;
    }
    const num =
      rxa * rxa * rya * rya - rxa * rxa * y1p * y1p - rya * rya * x1p * x1p;
    const den = rxa * rxa * y1p * y1p + rya * rya * x1p * x1p;
    const co = (laf !== sf ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
    const cxp = (co * (rxa * y1p)) / rya;
    const cyp = co * -((rya * x1p) / rxa);
    const ccx = cp * cxp - sp * cyp + (cx + x) / 2;
    const ccy = sp * cxp + cp * cyp + (cy + y) / 2;
    const ang = (ux, uy, vx, vy) => {
      const dot = ux * vx + uy * vy;
      const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
      const a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
      return ux * vy - uy * vx < 0 ? -a : a;
    };
    const ux = (x1p - cxp) / rxa;
    const uy = (y1p - cyp) / rya;
    const t1 = ang(1, 0, ux, uy);
    let dt = ang(ux, uy, (-x1p - cxp) / rxa, (-y1p - cyp) / rya);
    if (!sf && dt > 0) dt -= 2 * Math.PI;
    if (sf && dt < 0) dt += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 32)));
    for (let s = 1; s <= steps; s++) {
      const th = t1 + (dt * s) / steps;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      line(
        cp * rxa * ct - sp * rya * st + ccx,
        sp * rxa * ct + cp * rya * st + ccy
      );
    }
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/u.test(tokens[i])) {
      cmd = tokens[i++];
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';

    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? cx : 0;
    const by = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        cx = bx + num();
        cy = by + num();
        start(cx, cy);
        break;
      case 'L':
        cx = bx + num();
        cy = by + num();
        line(cx, cy);
        break;
      case 'H':
        cx = bx + num();
        line(cx, cy);
        break;
      case 'V':
        cy = by + num();
        line(cx, cy);
        break;
      case 'C': {
        const x1 = bx + num();
        const y1 = by + num();
        const x2 = bx + num();
        const y2 = by + num();
        const x = bx + num();
        const y = by + num();
        cubic(x1, y1, x2, y2, x, y);
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        const rfx =
          prev.toUpperCase() === 'C' || prev.toUpperCase() === 'S'
            ? 2 * cx - pcx
            : cx;
        const rfy =
          prev.toUpperCase() === 'C' || prev.toUpperCase() === 'S'
            ? 2 * cy - pcy
            : cy;
        const x2 = bx + num();
        const y2 = by + num();
        const x = bx + num();
        const y = by + num();
        cubic(rfx, rfy, x2, y2, x, y);
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        const x1 = bx + num();
        const y1 = by + num();
        const x = bx + num();
        const y = by + num();
        quad(x1, y1, x, y);
        cx = x;
        cy = y;
        break;
      }
      case 'T': {
        const rfx =
          prev.toUpperCase() === 'Q' || prev.toUpperCase() === 'T'
            ? 2 * cx - pcx
            : cx;
        const rfy =
          prev.toUpperCase() === 'Q' || prev.toUpperCase() === 'T'
            ? 2 * cy - pcy
            : cy;
        const x = bx + num();
        const y = by + num();
        quad(rfx, rfy, x, y);
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const laf = num();
        const sf = num();
        const x = bx + num();
        const y = by + num();
        arc(rx, ry, rot, laf, sf, x, y);
        cx = x;
        cy = y;
        break;
      }
      case 'Z':
        if (cur) cur.push([sx, sy]);
        cur = null;
        cx = sx;
        cy = sy;
        break;
      default:
        i++;
    }
    prev = cmd;
  }
}

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const p of paths)
  for (const sp of p.subpaths)
    for (const [x, y] of sp) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
const bw = maxX - minX;
const bh = maxY - minY;
const bcx = (minX + maxX) / 2;
const bcy = (minY + maxY) / 2;
const scaleI = ((PAD * SIZE) / Math.max(bw, bh)) * SS;
const centerI = INTERNAL / 2;

const polys = paths.map((p) => ({
  color: p.color,
  poly: p.subpaths.map((sp) =>
    sp.map(([x, y]) => [
      (x - bcx) * scaleI + centerI,
      (y - bcy) * scaleI + centerI,
    ])
  ),
}));

const internal = Buffer.alloc(INTERNAL * INTERNAL * 4);
const setI = (x, y, r, g, b) => {
  const idx = (y * INTERNAL + x) * 4;
  internal[idx] = r;
  internal[idx + 1] = g;
  internal[idx + 2] = b;
  internal[idx + 3] = 255;
};

if (DRAW_CIRCLE) {
  const R = INTERNAL / 2;
  const R2 = R * R;
  const fx = FOCAL_X * INTERNAL;
  const fy = FOCAL_Y * INTERNAL;
  const gradR = BG_RADIUS * INTERNAL;
  for (let y = 0; y < INTERNAL; y++) {
    const dy = y + 0.5 - centerI;
    for (let x = 0; x < INTERNAL; x++) {
      const dx = x + 0.5 - centerI;
      if (dx * dx + dy * dy > R2) continue;
      if (BG_STOPS) {
        let t;
        if (BG_LINEAR) {
          const x1 = BG_LINEAR[0] * INTERNAL;
          const y1 = BG_LINEAR[1] * INTERNAL;
          const ax = BG_LINEAR[2] * INTERNAL - x1;
          const ay = BG_LINEAR[3] * INTERNAL - y1;
          t =
            ((x + 0.5 - x1) * ax + (y + 0.5 - y1) * ay) /
            (ax * ax + ay * ay || 1);
        } else {
          t = Math.hypot(x + 0.5 - fx, y + 0.5 - fy) / gradR;
        }
        const [r, g, b] = gradientColor(Math.max(0, Math.min(1, t)));
        setI(x, y, r, g, b);
      } else setI(x, y, BG[0], BG[1], BG[2]);
    }
  }
}

function fillPath(poly, color) {
  for (let y = 0; y < INTERNAL; y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const sp of poly) {
      for (let k = 0; k < sp.length - 1; k++) {
        const [x0, y0] = sp[k];
        const [x1, y1] = sp[k + 1];
        let dir = 0;
        if (y0 <= sy && y1 > sy) dir = 1;
        else if (y1 <= sy && y0 > sy) dir = -1;
        else continue;
        const t = (sy - y0) / (y1 - y0);
        xs.push({ x: x0 + t * (x1 - x0), dir });
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a.x - b.x);
    let w = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      w += xs[k].dir;
      const inside = EVEN_ODD ? (k + 1) % 2 === 1 : w !== 0;
      if (!inside) continue;
      const a = Math.max(0, Math.round(xs[k].x));
      const bxe = Math.min(INTERNAL, Math.round(xs[k + 1].x));
      for (let x = a; x < bxe; x++) setI(x, y, color[0], color[1], color[2]);
    }
  }
}

for (const p of polys) fillPath(p.poly, p.color);

const out = Buffer.alloc(SIZE * SIZE * 4);
for (let oy = 0; oy < SIZE; oy++) {
  for (let ox = 0; ox < SIZE; ox++) {
    let sa = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const idx = ((oy * SS + dy) * INTERNAL + (ox * SS + dx)) * 4;
        const a = internal[idx + 3];
        sa += a;
        sr += internal[idx] * a;
        sg += internal[idx + 1] * a;
        sb += internal[idx + 2] * a;
      }
    }
    const o = (oy * SIZE + ox) * 4;
    out[o + 3] = Math.round(sa / (SS * SS));
    if (sa > 0) {
      out[o] = Math.round(sr / sa);
      out[o + 1] = Math.round(sg / sa);
      out[o + 2] = Math.round(sb / sa);
    }
  }
}

fs.writeFileSync(output, encodePNG(SIZE, SIZE, out));

if (!QUIET) {
  preview(out, SIZE);
  console.log(
    `\nwrote ${output} (${SIZE}x${SIZE}, ${fs.statSync(output).size} bytes)`
  );
}

function preview(buf, size) {
  const cols = 48;
  const rows = 24;
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = Math.floor((c / cols) * size);
      const py = Math.floor((r / rows) * size);
      const i = (py * size + px) * 4;
      const a = buf[i + 3];
      if (a < 40) s += ' ';
      else {
        const lum = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
        s += lum > 140 ? '#' : '.';
      }
    }
    s += '\n';
  }
  process.stdout.write(s);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunkPNG('IHDR', ihdr),
    chunkPNG('IDAT', idat),
    chunkPNG('IEND', Buffer.alloc(0)),
  ]);
}

function chunkPNG(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
