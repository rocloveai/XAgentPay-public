/**
 * NexusPay OG Image — Programmatic PNG generator.
 *
 * Generates a branded 400×400 PNG logo for Telegram link preview cards.
 * Pure Node.js — no external image libraries required.
 */
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Brand palette
// ---------------------------------------------------------------------------

const BG_R = 0x63; // indigo-500 #6366f1
const BG_G = 0x66;
const BG_B = 0xf1;

const FG_R = 0xff; // white
const FG_G = 0xff;
const FG_B = 0xff;

const WIDTH = 400;
const HEIGHT = 400;

// ---------------------------------------------------------------------------
// Bitmap font — "N" letter (20×24 grid, scaled 8× to 160×192)
// ---------------------------------------------------------------------------

// prettier-ignore
const N_BITMAP: readonly number[] = [
  0b11000000000000000011,
  0b11100000000000000011,
  0b11110000000000000011,
  0b11111000000000000011,
  0b11011100000000000011,
  0b11001110000000000011,
  0b11000111000000000011,
  0b11000011100000000011,
  0b11000001110000000011,
  0b11000000111000000011,
  0b11000000011100000011,
  0b11000000001110000011,
  0b11000000000111000011,
  0b11000000000011100011,
  0b11000000000001110011,
  0b11000000000000111011,
  0b11000000000000011111,
  0b11000000000000001111,
  0b11000000000000000111,
  0b11000000000000000011,
];

const CHAR_W = 20;
const CHAR_H = N_BITMAP.length;
const SCALE = 8;
const GLYPH_W = CHAR_W * SCALE; // 160px
const GLYPH_H = CHAR_H * SCALE; // 160px

// Center the glyph
const OFFSET_X = Math.floor((WIDTH - GLYPH_W) / 2);
const OFFSET_Y = Math.floor((HEIGHT - GLYPH_H) / 2);

// ---------------------------------------------------------------------------
// PNG primitives
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function write32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  write32(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);

  // CRC covers type + data
  const crcData = new Uint8Array(4 + data.length);
  crcData[0] = chunk[4];
  crcData[1] = chunk[5];
  crcData[2] = chunk[6];
  crcData[3] = chunk[7];
  crcData.set(data, 4);
  write32(chunk, 8 + data.length, crc32(crcData));

  return chunk;
}

// ---------------------------------------------------------------------------
// Generate the PNG
// ---------------------------------------------------------------------------

function generateOgPng(): Buffer {
  // Build raw scanlines: each row = filter byte (0) + WIDTH * 3 bytes (RGB)
  const rowBytes = 1 + WIDTH * 3;
  const raw = new Uint8Array(HEIGHT * rowBytes);

  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: None

    for (let x = 0; x < WIDTH; x++) {
      const px = rowStart + 1 + x * 3;

      // Check if this pixel is within the glyph bounds
      const gx = x - OFFSET_X;
      const gy = y - OFFSET_Y;
      let isForeground = false;

      if (gx >= 0 && gx < GLYPH_W && gy >= 0 && gy < GLYPH_H) {
        const charX = Math.floor(gx / SCALE);
        const charY = Math.floor(gy / SCALE);
        if (charY < CHAR_H) {
          // Read bit from bitmap (MSB = left)
          const bit = (N_BITMAP[charY] >>> (CHAR_W - 1 - charX)) & 1;
          isForeground = bit === 1;
        }
      }

      if (isForeground) {
        raw[px] = FG_R;
        raw[px + 1] = FG_G;
        raw[px + 2] = FG_B;
      } else {
        raw[px] = BG_R;
        raw[px + 1] = BG_G;
        raw[px + 2] = BG_B;
      }
    }
  }

  // Compress scanlines
  const compressed = deflateSync(Buffer.from(raw));

  // IHDR
  const ihdr = new Uint8Array(13);
  write32(ihdr, 0, WIDTH);
  write32(ihdr, 4, HEIGHT);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", new Uint8Array(compressed));
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  // Concatenate all parts
  const total =
    signature.length +
    ihdrChunk.length +
    idatChunk.length +
    iendChunk.length;
  const png = Buffer.alloc(total);
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}

/** Cached PNG buffer — generated once at module load time. */
export const NEXUSPAY_OG_PNG: Buffer = generateOgPng();
