import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const WIDTH = 32;
const HEIGHT = 32;

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const stride = WIDTH * 4 + 1;
const raw = Buffer.alloc(stride * HEIGHT, 0);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const row = y * stride;
  const idx = row + 1 + x * 4;
  raw[idx] = r;
  raw[idx + 1] = g;
  raw[idx + 2] = b;
  raw[idx + 3] = a;
}

function fillRect(x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      setPixel(x, y, r, g, b, a);
    }
  }
}

// Transparent background, then draw a simple in-house pixel mascot.
fillRect(7, 4, 18, 3, 25, 28, 34);     // antenna top
fillRect(11, 7, 10, 2, 40, 46, 56);    // antenna base
fillRect(6, 9, 20, 14, 78, 97, 120);   // head
fillRect(7, 10, 18, 12, 108, 132, 162);
fillRect(10, 13, 4, 3, 22, 28, 34);    // left eye
fillRect(18, 13, 4, 3, 22, 28, 34);    // right eye
fillRect(12, 18, 8, 2, 245, 190, 72);  // mouth light
fillRect(9, 23, 14, 5, 62, 78, 96);    // body
fillRect(11, 24, 10, 3, 90, 112, 138);
fillRect(5, 24, 3, 5, 62, 78, 96);     // left arm
fillRect(24, 24, 3, 5, 62, 78, 96);    // right arm
fillRect(10, 28, 4, 3, 38, 48, 60);    // left leg
fillRect(18, 28, 4, 3, 38, 48, 60);    // right leg
fillRect(6, 9, 20, 1, 190, 214, 240);  // top highlight

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outputPath = path.resolve("src/assets/mascot_pixelbot.png");
fs.writeFileSync(outputPath, png);
console.log(`Generated ${outputPath}`);
