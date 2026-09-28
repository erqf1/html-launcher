'use strict';

// Erzeugt assets/icon.png, icon.ico (Windows) und icon.icns (macOS) ohne externe Abhängigkeiten.
// Aufruf: npm run icon

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const COLOR_A = [99, 102, 241]; // indigo
const COLOR_B = [168, 85, 247]; // violett

/** pad: transparenter Rand als Anteil der Kantenlänge (macOS-Icons haben ~10 % Rand). */
function render(size, pad = 0) {
  const SS = 4; // Supersampling für glatte Kanten
  const box = size * (1 - 2 * pad);
  const offset = size * pad;
  const radius = box * 0.25;
  const half = box / 2;
  const center = size / 2;
  const tri = [[0.38, 0.28], [0.38, 0.72], [0.74, 0.5]].map(([x, y]) => [offset + x * box, offset + y * box]);

  const inRoundRect = (x, y) => {
    const dx = Math.max(Math.abs(x - center) - (half - radius), 0);
    const dy = Math.max(Math.abs(y - center) - (half - radius), 0);
    return dx * dx + dy * dy <= radius * radius;
  };
  const inTriangle = (x, y) => {
    const side = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const s = [side(tri[0], tri[1]), side(tri[1], tri[2]), side(tri[2], tri[0])];
    return s.every((v) => v >= 0) || s.every((v) => v <= 0);
  };

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          if (!inRoundRect(fx, fy)) continue;
          covered++;
          if (inTriangle(fx, fy)) {
            r += 255; g += 255; b += 255;
          } else {
            const t = (fx + fy - 2 * offset) / (2 * box);
            r += COLOR_A[0] + (COLOR_B[0] - COLOR_A[0]) * t;
            g += COLOR_A[1] + (COLOR_B[1] - COLOR_A[1]) * t;
            b += COLOR_A[2] + (COLOR_B[2] - COLOR_A[2]) * t;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (covered) {
        pixels[i] = Math.round(r / covered);
        pixels[i + 1] = Math.round(g / covered);
        pixels[i + 2] = Math.round(b / covered);
        pixels[i + 3] = Math.round((covered / (SS * SS)) * 255);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Bit-Tiefe
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // Typ: Icon
  head.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = head.length + entries.length;
  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    entries[e] = size >= 256 ? 0 : size;
    entries[e + 1] = size >= 256 ? 0 : size;
    entries.writeUInt16LE(1, e + 4); // Farbebenen
    entries.writeUInt16LE(32, e + 6); // Bits pro Pixel
    entries.writeUInt32LE(png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, entries, ...images.map((i) => i.png)]);
}

// ICNS: PNG-Einträge. Typ -> Pixelkante (…@2x nutzt die doppelte Kante).
const ICNS_TYPES = { ic11: 32, ic12: 64, ic07: 128, ic13: 256, ic08: 256, ic14: 512, ic09: 512, ic10: 1024 };

function encodeIcns() {
  const cache = new Map();
  const pngFor = (size) => {
    if (!cache.has(size)) cache.set(size, encodePng(size, render(size, 0.098)));
    return cache.get(size);
  };
  const entries = Object.entries(ICNS_TYPES).map(([type, size]) => {
    const png = pngFor(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const images = ICO_SIZES.map((size) => ({ size, png: encodePng(size, render(size)) }));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), images[images.length - 1].png);
fs.writeFileSync(path.join(OUT, 'icon.ico'), encodeIco(images));
fs.writeFileSync(path.join(OUT, 'icon.icns'), encodeIcns());
console.log(`Icons geschrieben nach ${OUT}`);
