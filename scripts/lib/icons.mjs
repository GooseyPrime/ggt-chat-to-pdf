// Generates the extension's PNG icons (no image dependencies): a rounded Iris tile with a white
// "page" and text lines, drawn with 4x supersampling.
import zlib from "node:zlib";
import { crc32 } from "./zip.mjs";

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

export function iconPng(size, accent = [75, 63, 184]) {
  const SS = 4;
  const S = size * SS;
  const px = Buffer.alloc(size * size * 4);
  const u = (v) => (v / 100) * S;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = x * SS + sx + 0.5, Y = y * SS + sy + 0.5;
          if (!inRoundRect(X, Y, 0, 0, S, S, u(22))) continue;
          let col = accent;
          // page with folded corner
          if (inRoundRect(X, Y, u(24), u(14), u(76), u(86), u(6))) {
            col = [255, 255, 255];
            if (X > u(60) && Y < u(30) && X - u(60) + (u(30) - Y) > u(16) * 1.0 && X - u(60) > u(30) - Y) col = [214, 209, 245];
            if (Y > u(38) && Y < u(45) && X > u(32) && X < u(68)) col = accent;
            if (Y > u(52) && Y < u(59) && X > u(32) && X < u(68)) col = accent;
            if (Y > u(66) && Y < u(73) && X > u(32) && X < u(54)) col = accent;
          }
          r += col[0]; g += col[1]; b += col[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      if (a) {
        px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
