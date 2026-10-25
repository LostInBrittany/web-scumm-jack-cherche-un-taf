// Generates public/icons/icon-192.png, icon-512.png and public/og.png with no dependency (minimal PNG encoder).
// Texts come from games/<id>/site.json (`title`, optional `ogLines`: up to three lines drawn above the title).
import { readlinkSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** The game `.cache/game` links to (npm run game), else package.json's config.game, else demo (tools/game.ts' rule). */
function currentGame() {
  try {
    return readlinkSync('.cache/game').split(/[\\/]/).filter(Boolean).pop();
  } catch {
    return JSON.parse(readFileSync('package.json', 'utf8')).config?.game;
  }
}
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
const GAME = process.env.GAME || currentGame() || 'demo';
let site = {};
try {
  site = JSON.parse(readFileSync(`games/${GAME}/site.json`, 'utf8'));
} catch {
  /* no site.json */
}
const clean = (t) =>
  String(t)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[^A-Z0-9 ']/g, '');

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
// minimal 5x7 font
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
};
function textPx(str, x0, y0, scale, w, h, set) {
  let x = x0;
  for (const ch of str) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '1')
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) set(x + c * scale + dx, y0 + r * scale + dy);
    x += 6 * scale;
  }
}
function makeIcon(size) {
  const buf = new Map();
  const set = (x, y, rgb) => buf.set(y * size + x, rgb);
  const s = size / 32;
  // floppy disk
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, [10, 10, 18]);
  for (let y = 3 * s; y < 29 * s; y++) for (let x = 3 * s; x < 29 * s; x++) set(x | 0, y | 0, [58, 63, 94]);
  for (let y = 5 * s; y < 13 * s; y++) for (let x = 8 * s; x < 24 * s; x++) set(x | 0, y | 0, [242, 239, 230]);
  for (let y = 7 * s; y < 11 * s; y++) for (let x = 10 * s; x < 22 * s; x++) set(x | 0, y | 0, [184, 58, 44]);
  for (let y = 19 * s; y < 29 * s; y++) for (let x = 10 * s; x < 22 * s; x++) set(x | 0, y | 0, [194, 195, 201]);
  for (let y = 21 * s; y < 27 * s; y++) for (let x = 13 * s; x < 16 * s; x++) set(x | 0, y | 0, [10, 10, 18]);
  return png(size, size, (x, y) => buf.get(y * size + x) ?? [10, 10, 18]);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', makeIcon(192));
writeFileSync('public/icons/icon-512.png', makeIcon(512));
// OG image 1200x630, neutral
{
  const W = 1200,
    H = 630;
  const buf = new Map();
  const set = (x, y, rgb) => {
    if (x >= 0 && y >= 0 && x < W && y < H) buf.set(y * W + x, rgb);
  };
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x++) set(x, y, [16, 16, 26]);
  for (let y = 60; y < 570; y++)
    for (let x = 100; x < 1100; x++) if (y < 66 || y > 563 || x < 106 || x > 1093) set(x, y, [240, 192, 64]);
  const lines = (site.ogLines ?? ['A POINT AND CLICK', 'ADVENTURE']).slice(0, 2);
  const colors = [
    [240, 192, 64],
    [184, 58, 44],
  ];
  lines.forEach((t, i) => {
    const txt = clean(t);
    textPx(txt, Math.max(40, (W - txt.length * 6 * 9) / 2), 150 + i * 110, 9, W, H, (x, y) => set(x, y, colors[i]));
  });
  const title = clean(site.title ?? 'QUEST N CLICK');
  textPx(title, Math.max(40, (W - title.length * 6 * 7) / 2), 420, 7, W, H, (x, y) => set(x, y, [242, 239, 230]));
  writeFileSync(
    'public/og.png',
    png(W, H, (x, y) => buf.get(y * W + x) ?? [10, 10, 18]),
  );
}
console.log('icons generated');
