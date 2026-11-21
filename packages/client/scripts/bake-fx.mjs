#!/usr/bin/env node
// Bakes the game's effects from pixelfx (https://github.com/patch-gg/pixelfx, MIT) into sprite sheets:
//   npm run bake:fx -w @dorandi/client
// Writes public/fx/<key>.png + .json (a Phaser JSON-array atlas, every frame cropped to one box) and
// src/fx/manifest.ts (size, pivot, fps of each sheet). The game only loads the PNGs; Node is needed only here.
//
// Stock effects are played at 1 px = 1 lane px (the lane draws 32 px cells at integer zoom, the scale pixelfx
// effects are drawn at). Effects that paint a character (stunned, frozen) are regenerated against our own enemy
// sprites; area rings are our own top-down effects in scripts/fx-src, baked once per radius the data uses.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..');
const require = createRequire(import.meta.url);
const PIXELFX = join(dirname(require.resolve('pixelfx')), '..', '..');
const { renderFrames, loadEffect } = await import(pathToFileURL(join(PIXELFX, 'tools/lib/fxlib.mjs')).href);
const { encodePNG } = await import(pathToFileURL(join(PIXELFX, 'tools/lib/png.mjs')).href);
const LOGIC_DATA = join(CLIENT, '..', 'logic', 'data');
const OUT_PNG = join(CLIENT, 'public', 'fx');
const OUT_TS = join(CLIENT, 'src', 'fx', 'manifest.ts');
const CELL = 32;

// --- palettes (dark to bright) ---
const PAL = {
  zap: ['#120a33', '#2a1b78', '#4630c0', '#5a62f0', '#58a6ff', '#9ed8ff', '#e4f6ff', '#ffffff'],
  blood: ['#1a0208', '#4a0610', '#8a0c1c', '#d01828', '#ff4a4a', '#ff9a9a', '#ffe0e0', '#ffffff'],
  gold: ['#3b1d0a', '#7a4a12', '#c4801e', '#f0b040', '#ffd25e', '#fff0a0', '#fffbe0', '#ffffff'],
  ice: ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff'],
  doom: ['#12040a', '#3a0a14', '#6e1220', '#a81c2a', '#e0303a', '#ff7a6a', '#ffd0c4', '#ffffff'],
  mist: ['#1c0608', '#4a0e14', '#7e1a22', '#b03038', '#d86a6a', '#f2b0a8', '#ffffff'],
};

// --- radii the data uses (one sheet each, so every ring is drawn at its real size) ---
function unitsOf(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}
const allUnits = [...unitsOf(join(LOGIC_DATA, 'units.json')), ...unitsOf(join(LOGIC_DATA, 'stage2', 'units.json'))];
const radii = { ring: new Set(), frost: new Set(), blast: new Set(), pierce: new Set() };
for (const u of allUnits) {
  for (const s of u.skills) {
    for (const e of s.effects) {
      if (e.kind === 'splash') radii.ring.add(e.radius);
      if (e.kind === 'slow' && e.radius) radii.frost.add(e.radius);
      if (e.kind === 'onKillExplode') radii.blast.add(e.radius);
      if (e.kind === 'pierce') radii.pierce.add(e.length);
      if (e.kind === 'allInRange' && s.trigger.kind === 'periodic') radii.ring.add(u.range);
    }
  }
}
const px = (cells) => Math.round(cells * CELL);

// --- our enemy sprites as pixelfx actors, so status effects wrap their real silhouettes ---
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, type = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || type !== 6) throw new Error('only 8-bit RGBA PNGs are supported');
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      const pr = f === 4 ? (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })() : 0;
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? pr : 0;
      out[y * stride + x] = (row[x] + add) & 255;
    }
  }
  return { w, h, rgba: out };
}

/** A pixelfx actor from a sprite: feet at (0, 0), the sprite's full box (so the sheet lines up with the image). */
function spriteActor(file) {
  const { w, h, rgba } = decodePNG(readFileSync(file));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0) continue;
    const x = i % w, y = Math.floor(i / w);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // the mask is the sprite's opaque box, placed where it sits in the image (feet = bottom centre of the image)
  const mw = x1 - x0 + 1, mh = y1 - y0 + 1, data = new Uint8Array(mw * mh), pixels = new Uint32Array(mw * mh), src = new Uint32Array(rgba.buffer);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = (y0 + y) * w + x0 + x;
    if (rgba[i * 4 + 3] > 0) { data[y * mw + x] = 1; pixels[y * mw + x] = src[i] | 0xff000000; }
  }
  const x = -Math.floor(w / 2) + x0, y = -h + y0;
  return { mask: { w: mw, h: mh, data }, pixels, x, y, w: mw, h: mh, k: 2, head: [x + mw / 2, y], chest: [x + mw / 2, y + Math.round(mh * 0.55)] };
}
/** A character with no pixels: effects that light the head (halo) find nothing to paint. */
function emptyActor(w = 24, h = 32) {
  return { mask: { w, h, data: new Uint8Array(w * h) }, pixels: new Uint32Array(w * h), x: -w / 2, y: -h, w, h, k: 2, head: [0, -h], chest: [0, -h * 0.55] };
}

const enemies = JSON.parse(readFileSync(join(LOGIC_DATA, 'enemies.json'), 'utf8'));
const spriteDir = join(CLIENT, 'public', 'sprites');
const sprites = new Set(readdirSync(spriteDir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
const enemyIds = enemies.filter(e => sprites.has(e.id)).map(e => e.id);

// --- what gets baked ---
// until: cut a one-shot here (s); fps: sample rate; pivot: the effect's origin unless 'center' (of what is drawn)
// or 'thrust' (where the thrust leaves the hand)
const JOBS = [
  { key: 'hit', src: 'impacts/hit-spark', opts: { height: 10 }, until: 0.4, fps: 24 },
  { key: 'hit-mag', src: 'impacts/hit-spark', opts: { palette: PAL.zap, height: 10 }, until: 0.4, fps: 24 },
  { key: 'hit-heavy', src: 'impacts/blunt-hit', opts: { height: 10 }, until: 0.36, fps: 24 },
  { key: 'hit-heavy-mag', src: 'impacts/blunt-hit', opts: { height: 10, palette: PAL.zap, warm: '#9ed8ff', dust: '#6a7ab8', clod: '#2a3a78', seed: 3 }, until: 0.36, fps: 24 },
  { key: 'crit', src: 'impacts/crit-hit', opts: { height: 12 }, until: 0.6, fps: 24 },
  { key: 'execute', src: 'impacts/crit-hit', opts: { palette: PAL.blood, seed: 11, height: 12 }, until: 0.6, fps: 24 },
  { key: 'knock', src: 'impacts/heavy-landing', until: 0.7, fps: 20, actor: emptyActor() },
  { key: 'big', src: 'pickups/collect-burst', opts: { palette: PAL.gold }, until: 1.0, fps: 20, pivot: 'center' },
  { key: 'boss', src: 'spawn/spawn-portal', opts: { palette: PAL.doom, width: 30 }, until: 1.6, fps: 15 },
  { key: 'poof', src: 'spawn/poof', opts: { palette: PAL.mist, stars: ['#ff6a5a', '#ffb0a0', '#ffffff'] }, until: 1.1, fps: 20, pivot: 'center' },
  { key: 'firework', src: 'explosions/firework-burst', opts: { palette: PAL.gold, seed: 4 }, until: 1.9, fps: 15 },
  { key: 'halo', src: 'holy/halo', fps: 12, actor: emptyActor() },
  ...[...radii.ring].sort().map(r => ({ key: `ring-${px(r)}`, local: 'ring-burst', opts: { reach: px(r) }, size: px(r) })),
  ...[...radii.frost].sort().map(r => ({ key: `frost-${px(r)}`, local: 'ring-burst', opts: { reach: px(r), palette: PAL.ice, flakes: 12 }, size: px(r) })),
  ...[...radii.blast].sort().map(r => ({ key: `blast-${px(r)}`, local: 'blast', opts: { reach: px(r) }, size: px(r) })),
  ...[...radii.pierce].sort().map(r => ({ key: `pierce-${px(r)}`, src: 'melee/thrust', opts: { reach: px(r) }, until: 0.45, fps: 24, actor: emptyActor(), pivot: 'thrust' })),
  ...enemyIds.flatMap(id => [
    { key: `stun-${id}`, src: 'status/stunned', fps: 12, actor: spriteActor(join(spriteDir, `${id}.png`)) },
    { key: `frozen-${id}`, src: 'status/frozen', fps: 12, actor: spriteActor(join(spriteDir, `${id}.png`)) },
  ]),
];

async function effectFor(job) {
  if (job.src) return loadEffect(job.src, join(PIXELFX, 'src', 'fx'));
  const file = join(HERE, 'fx-src', `${job.local}.js`);
  const mod = await import(pathToFileURL(file).href);
  const pad = 14, side = job.size * 2 + pad * 2;
  const meta = { ...mod.meta, size: [side, side], origin: [side / 2, side / 2] };
  return { id: `local/${job.local}`, file, mod: { ...mod, meta }, meta };
}

/** Bounding box of every non-transparent pixel over all frames. */
function bbox(frames, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const f of frames) {
    const a = f.clear;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
}

/** Where the thrust starts (leftmost lit column, at the height of its brightest row there). */
function thrustPivot(frames, w, h) {
  let best = { x: w, y: 0 };
  for (const f of frames.slice(0, 4)) {
    for (let x = 0; x < w && x < best.x; x++) {
      for (let y = 0; y < h; y++) if (f.clear[(y * w + x) * 4 + 3] > 128) { best = { x, y }; break; }
    }
  }
  return [best.x, best.y];
}

mkdirSync(OUT_PNG, { recursive: true });
for (const f of readdirSync(OUT_PNG)) rmSync(join(OUT_PNG, f));
const manifest = {};
let bytes = 0;
for (const job of JOBS) {
  const fx = await effectFor(job);
  const r = renderFrames(fx, { fps: job.fps ?? fx.meta.fps, bg: 'none', options: { ...(job.opts ?? {}), ...(job.actor ? { actor: job.actor } : {}) } });
  let frames = r.frames;
  if (!fx.meta.loop && job.until !== undefined) frames = frames.filter(f => f.t <= job.until + 1e-9);
  if (!fx.meta.loop && frames.length > 1) {
    // a one-shot's last frame is blank by contract; drop trailing blanks
    while (frames.length > 1 && frames[frames.length - 1].clear.every((v, i) => i % 4 !== 3 || v < 8)) frames = frames.slice(0, -1);
  }
  const { w, h } = r;
  const b = bbox(frames, w, h);
  const fw = b.x1 - b.x0 + 1, fh = b.y1 - b.y0 + 1, n = frames.length;
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * fh) / fw)))), rows = Math.ceil(n / cols);
  const sheet = new Uint8ClampedArray(cols * fw * rows * fh * 4);
  const json = { frames: [], meta: { app: 'pixelfx (https://github.com/patch-gg/pixelfx, MIT) via scripts/bake-fx.mjs', image: `${job.key}.png`, format: 'RGBA8888', size: { w: cols * fw, h: rows * fh }, scale: '1' } };
  frames.forEach((f, i) => {
    const ox = (i % cols) * fw, oy = Math.floor(i / cols) * fh;
    for (let y = 0; y < fh; y++) {
      const s = ((b.y0 + y) * w + b.x0) * 4, d = ((oy + y) * cols * fw + ox) * 4;
      sheet.set(f.clear.subarray(s, s + fw * 4), d);
    }
    json.frames.push({ filename: String(i), frame: { x: ox, y: oy, w: fw, h: fh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: fw, h: fh }, sourceSize: { w: fw, h: fh } });
  });
  const pivot = job.pivot === 'thrust' ? thrustPivot(frames, w, h) : job.pivot === 'center' ? [(b.x0 + b.x1 + 1) / 2, (b.y0 + b.y1 + 1) / 2] : fx.meta.origin;
  const png = encodePNG(cols * fw, rows * fh, sheet);
  bytes += png.length;
  writeFileSync(join(OUT_PNG, `${job.key}.png`), png);
  writeFileSync(join(OUT_PNG, `${job.key}.json`), JSON.stringify(json));
  manifest[job.key] = { src: job.src ?? `local:${job.local}`, w: fw, h: fh, frames: n, fps: job.fps ?? fx.meta.fps, loop: !!fx.meta.loop, px: pivot[0] - b.x0, py: pivot[1] - b.y0 };
  console.log(`${job.key.padEnd(18)} ${String(n).padStart(3)}f ${fw}x${fh}  ${(png.length / 1024).toFixed(1)} KB`);
}

const lines = Object.entries(manifest).map(([k, v]) => `  '${k}': ${JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace(/"/g, "'")},`);
writeFileSync(OUT_TS, `// Generated by scripts/bake-fx.mjs from pixelfx (MIT). Do not edit: run \`npm run bake:fx -w @dorandi/client\`.
// w, h: frame size; px, py: the effect's anchor inside the frame; fps and loop for the animation.

export interface FxSheet { src: string; w: number; h: number; frames: number; fps: number; loop: boolean; px: number; py: number }

export const FX_SHEETS = {
${lines.join('\n')}
} as const satisfies Record<string, FxSheet>;

export type FxKey = keyof typeof FX_SHEETS;
`);
console.log(`${Object.keys(manifest).length} sheets, ${(bytes / 1024).toFixed(0)} KB`);
