// Rasterizes the app icon to PNG (no dependencies). Run: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function png(size) {
  const s = size / 512;
  const px = new Uint8ClampedArray(size * size * 4);
  const blend = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4, k = a, ik = 1 - k;
    px[i] = px[i] * ik + r * k; px[i + 1] = px[i + 1] * ik + g * k; px[i + 2] = px[i + 2] * ik + b * k; px[i + 3] = Math.min(255, px[i + 3] + 255 * k);
  };
  const disc = (cx, cy, r, col, a = 1) => {
    cx *= s; cy *= s; r *= s;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + .5 - cx, y + .5 - cy);
      const cov = Math.max(0, Math.min(1, r - d + .5));
      if (cov > 0) blend(x, y, col, cov * a);
    }
  };
  // background rounded rect
  const R = 112 * s, bg = [15, 61, 62];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = Math.max(R - x - .5, x + .5 - (size - R), 0), dy = Math.max(R - y - .5, y + .5 - (size - R), 0);
    const cov = Math.max(0, Math.min(1, R - Math.hypot(dx, dy) + .5));
    if (cov > 0) blend(x, y, bg, cov);
  }
  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]; };
  const stroke = (seg, w, col, a = 1) => { for (let t = 0; t <= 1; t += 0.002) { const [x, y] = bez(...seg, t); disc(x, y, w / 2, col, a); } };
  const seg1 = [[96, 400], [156, 390], [166, 280], [256, 280]];
  const seg2 = [[256, 280], [346, 280], [356, 170], [416, 150]];
  stroke(seg2, 34, [255, 255, 255], 0.9);
  stroke(seg1, 34, [255, 194, 61]);
  disc(96, 400, 38, [255, 194, 61]); disc(256, 280, 38, [255, 194, 61]); disc(416, 150, 38, [255, 107, 74]);
  // flag
  for (let y = 70; y <= 150; y += 1) disc(402, y, 6, [255, 255, 255]);
  for (let y = 72; y <= 112; y++) { const half = 20 - Math.abs(y - 92); for (let x = 402; x <= 458 - (y > 72 && y < 112 ? Math.max(0, 14 - half * 0.7) * 0 : 0); x++) { if (x > 444 + Math.abs(y - 92) * 0.7) continue; blend(Math.round(x * s), Math.round(y * s), [255, 255, 255]); disc(x, y, .8, [255, 255, 255]); } }
  // encode
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const n of [180, 192, 512]) fs.writeFileSync(`public/icons/icon-${n}.png`, png(n));
console.log('icons ok');
