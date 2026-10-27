// Generates the source artwork for the application icon (1024x1024 PNG).
// Run with: node scripts/make-icon.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 1024;
const SS = 3; // supersampling factor for smooth edges

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

const TOP = [0x24, 0x2c, 0x44];
const BOTTOM = [0x0d, 0x0f, 0x18];
const CREAM = [0xf3, 0xef, 0xe6];
const ORANGE = [0xe8, 0x63, 0x1f];

function roundedRectDistance(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function render() {
  const width = SIZE * SS;
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const cx = width / 2;
  const cy = width / 2;
  const ringOuter = width * 0.305;
  const ringInner = width * 0.215;
  const knobRadius = width * 0.052;
  const gapHalf = (34 * Math.PI) / 180;
  const gapCenter = -Math.PI / 2;
  const handAngle = (38 * Math.PI) / 180;

  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = px - cx;
      const y = py - cy;
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);

      let colour = null;
      let alpha = 0;

      // rounded square backdrop
      const plate = roundedRectDistance(x, y, width * 0.47, width * 0.22);
      if (plate <= 0) {
        const t = (py / width) ** 0.9;
        colour = mix(TOP, BOTTOM, t);
        alpha = 255;
      }

      // knob on top of the ring
      const knobX = x;
      const knobY = y + ringOuter + width * 0.075;
      if (Math.hypot(knobX, knobY) <= knobRadius) {
        colour = CREAM;
        alpha = 255;
      } else if (Math.hypot(knobX, knobY) <= knobRadius + width * 0.016 && colour) {
        colour = mix(colour, CREAM, 0.25);
      }

      // the ring itself, with a gap at the top
      if (radius >= ringInner && radius <= ringOuter) {
        let delta = angle - gapCenter;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) > gapHalf) {
          colour = CREAM;
          alpha = 255;
        }
      }

      // countdown hand
      const hx = Math.cos(handAngle);
      const hy = Math.sin(handAngle);
      const along = x * hx + y * hy;
      const across = -x * hy + y * hx;
      if (along >= 0 && along <= ringInner && Math.abs(across) <= width * 0.022) {
        colour = ORANGE;
        alpha = 255;
      }

      if (alpha > 0) {
        const tx = Math.floor(px / SS);
        const ty = Math.floor(py / SS);
        const index = (ty * SIZE + tx) * 4;
        rgba[index] = colour[0];
        rgba[index + 1] = colour[1];
        rgba[index + 2] = colour[2];
        rgba[index + 3] = alpha;
      }
    }
  }
  return rgba;
}

const output = path.resolve("scripts/icon-source.png");
fs.writeFileSync(output, encodePng(SIZE, SIZE, render()));
console.log(`wrote ${output}`);
