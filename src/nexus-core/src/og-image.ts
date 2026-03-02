/**
 * NexusPay OG Image — Programmatic PNG generator.
 *
 * Generates a branded 400×400 PNG logo for Telegram link preview cards.
 * Dark background with cyan 4-pointed sparkle star (Nexus brand).
 * Pure Node.js — no external image libraries required.
 */
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Brand palette (matches Nexus logo: dark bg + cyan sparkle)
// ---------------------------------------------------------------------------

// Background: very dark navy
const BG_R = 0x0c;
const BG_G = 0x12;
const BG_B = 0x22;

// Star: bright cyan (#22d3ee → cyan-400)
const STAR_R = 0x22;
const STAR_G = 0xd3;
const STAR_B = 0xee;

// Glow: softer cyan for glow halo
const GLOW_R = 0x06;
const GLOW_G = 0xb6;
const GLOW_B = 0xd4;

const WIDTH = 400;
const HEIGHT = 400;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

// Rounded corner radius (for icon-style appearance)
const CORNER_R = 64;

// Star geometry
const STAR_MAX_R = 120; // length of main points
const STAR_MIN_R = 18; // width at narrowest
const STAR_SHARP = 3; // exponent — higher = sharper points
const GLOW_RADIUS = 160; // outer glow reach

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
// Shape helpers
// ---------------------------------------------------------------------------

/** Is (x,y) inside the rounded rectangle? */
function insideRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): boolean {
  // Inner cross (no rounding needed)
  if (x >= r && x <= w - r) return y >= 0 && y < h;
  if (y >= r && y <= h - r) return x >= 0 && x < w;
  // Corners
  const corners = [
    [r, r],
    [w - r, r],
    [r, h - r],
    [w - r, h - r],
  ];
  for (const [cx, cy] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/**
 * 4-pointed star radius at angle theta.
 * r(θ) = min + (max - min) * |cos(2θ)|^n
 */
function starRadius(theta: number): number {
  const cos2t = Math.cos(2 * theta);
  const factor = Math.pow(Math.abs(cos2t), STAR_SHARP);
  return STAR_MIN_R + (STAR_MAX_R - STAR_MIN_R) * factor;
}

/** Clamp to [0, 255] */
function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Generate the PNG
// ---------------------------------------------------------------------------

function generateOgPng(): Buffer {
  const rowBytes = 1 + WIDTH * 3;
  const raw = new Uint8Array(HEIGHT * rowBytes);

  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: None

    for (let x = 0; x < WIDTH; x++) {
      const px = rowStart + 1 + x * 3;

      // Outside rounded rect → pure black
      if (!insideRoundedRect(x, y, WIDTH, HEIGHT, CORNER_R)) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        continue;
      }

      // Distance from center
      const dx = x - CX;
      const dy = y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      const sr = starRadius(theta);

      let r: number;
      let g: number;
      let b: number;

      if (dist <= sr) {
        // Inside star — solid cyan with bright center
        const centerFade = 1 - dist / sr;
        const brightness = 0.85 + 0.15 * centerFade;
        r = clamp(STAR_R * brightness + 255 * centerFade * 0.3);
        g = clamp(STAR_G * brightness + 255 * centerFade * 0.15);
        b = clamp(STAR_B * brightness + 255 * centerFade * 0.08);
      } else if (dist <= GLOW_RADIUS) {
        // Glow zone — fade from cyan glow to background
        const t = (dist - sr) / (GLOW_RADIUS - sr);
        const fade = Math.pow(1 - t, 2.5); // smooth falloff
        r = clamp(lerp(BG_R, GLOW_R, fade));
        g = clamp(lerp(BG_G, GLOW_G, fade));
        b = clamp(lerp(BG_B, GLOW_B, fade));
      } else {
        // Background
        r = BG_R;
        g = BG_G;
        b = BG_B;
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
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

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", new Uint8Array(compressed));
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

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
