import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { loadGameData } from '@dorandi/logic';
import { describe, expect, test } from 'vitest';
import { FX_KEYS, areaSheet, hitKey, pierceSheet, quarterTurn, statusKey, textureKey } from '../src/fx/atlas';
import { FX_SHEETS } from '../src/fx/manifest';

const PUBLIC = join(__dirname, '..', 'public', 'fx');

describe('baked sheets', () => {
  test('every manifest entry has its PNG and a JSON atlas whose frames match the manifest', () => {
    for (const key of FX_KEYS) {
      const sheet = FX_SHEETS[key];
      expect(existsSync(join(PUBLIC, `${key}.png`)), key).toBe(true);
      const json = JSON.parse(readFileSync(join(PUBLIC, `${key}.json`), 'utf8')) as { frames: { filename: string; frame: { w: number; h: number } }[] };
      expect(json.frames.map(f => f.filename), key).toEqual(Array.from({ length: sheet.frames }, (_, i) => String(i)));
      expect(json.frames.every(f => f.frame.w === sheet.w && f.frame.h === sheet.h), key).toBe(true);
    }
  });

  test('every pivot sits inside its frame or, for a status drawn over a sprite, at most a sprite height below it', () => {
    for (const key of FX_KEYS) {
      const s = FX_SHEETS[key];
      expect(s.fps, key).toBeGreaterThanOrEqual(10);
      expect(s.fps, key).toBeLessThanOrEqual(30);
      expect(s.px, key).toBeGreaterThan(-s.w);
      expect(s.px, key).toBeLessThan(s.w * 2);
      expect(s.py, key).toBeGreaterThan(-s.h);
      expect(s.py, key).toBeLessThan(s.h + 64);
    }
  });

  test('texture keys are prefixed so they never clash with a unit sprite', () => {
    expect(textureKey('hit')).toBe('fx:hit');
  });
});

describe('hit by grade and damage type', () => {
  test('grades 1 to 3 get a spark, grade 4 a heavier hit; magical damage has its own colour', () => {
    expect(hitKey({ grade: 1, magical: false })).toBe('hit');
    expect(hitKey({ grade: 3, magical: true })).toBe('hit-mag');
    expect(hitKey({ grade: 4, magical: false })).toBe('hit-heavy');
    expect(hitKey({ grade: 4, magical: true })).toBe('hit-heavy-mag');
  });
});

describe('areas at their real size', () => {
  const radii = (kind: string) => {
    const out = new Set<number>();
    for (const data of [loadGameData(), loadGameData('stage2')]) {
      for (const u of data.units) {
        for (const s of u.skills) {
          for (const e of s.effects) {
            if (kind === 'ring' && e.kind === 'splash') out.add(e.radius);
            if (kind === 'ring' && e.kind === 'allInRange' && s.trigger.kind === 'periodic') out.add(u.range);
            if (kind === 'frost' && e.kind === 'slow' && e.radius) out.add(e.radius);
            if (kind === 'blast' && e.kind === 'onKillExplode') out.add(e.radius);
            if (kind === 'pierce' && e.kind === 'pierce') out.add(e.length);
          }
        }
      }
    }
    return [...out];
  };

  test.each(['ring', 'frost', 'blast', 'pierce'] as const)('every %s radius in the data has a sheet drawn at scale 1', kind => {
    const list = radii(kind);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) expect(kind === 'pierce' ? pierceSheet(r) : areaSheet(kind, r), `${kind} ${r}`).toEqual({ key: `${kind}-${Math.round(r * 32)}`, scale: 1 });
  });

  test('a radius with no sheet takes the nearest one, scaled to fit', () => {
    const s = areaSheet('blast', 2)!;
    expect(s.key).toBe('blast-48');
    expect(s.scale).toBeCloseTo(64 / 48, 9);
  });
});

describe('statuses regenerated per enemy sprite', () => {
  test('each enemy with a sprite has its own stun and frost sheet', () => {
    for (const id of ['japgwi', 'geuseundae', 'dueoksini', 'jinegaksi', 'gangcheori']) {
      expect(statusKey('stun', id)).toBe(`stun-${id}`);
      expect(statusKey('frozen', id)).toBe(`frozen-${id}`);
    }
  });

  test('an enemy with no sheet gets a stand-in stun and no frost (it is tinted instead)', () => {
    expect(statusKey('stun', 'nobody')).toBe('stun-japgwi');
    expect(statusKey('frozen', 'nobody')).toBeNull();
  });

  test('the frost sheet leaves the inside of the body clear, so a slowed enemy still reads as itself', () => {
    for (const id of ['japgwi', 'geuseundae', 'dueoksini', 'jinegaksi', 'gangcheori']) {
      const key = `frozen-${id}` as keyof typeof FX_SHEETS;
      const s = FX_SHEETS[key];
      const sprite = readPng(join(__dirname, '..', 'public', 'sprites', `${id}.png`));
      const sheet = readPng(join(PUBLIC, `${key}.png`));
      const json = JSON.parse(readFileSync(join(PUBLIC, `${key}.json`), 'utf8')) as { frames: { frame: { x: number; y: number } }[] };
      const on = (x: number, y: number) => x >= 0 && y >= 0 && x < sprite.w && y < sprite.h && sprite.alpha(x, y) > 0;
      let inside = 0, covered = 0;
      for (const { frame } of json.frames) {
        for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
          if (!(on(x, y) && on(x - 1, y) && on(x + 1, y) && on(x, y - 1))) continue;
          // the sheet's pivot is the sprite's feet: the bottom centre of its image
          const fx = s.px - Math.floor(sprite.w / 2) + x, fy = s.py - sprite.h + y;
          inside++;
          if (fx >= 0 && fy >= 0 && fx < s.w && fy < s.h && sheet.alpha(frame.x + fx, frame.y + fy) >= 128) covered++;
        }
      }
      expect(covered / inside, id).toBeLessThan(0.1);
    }
  });
});

/** Alpha of an 8-bit RGBA PNG (the format the bake writes and the sprites use). */
function readPng(file: string): { w: number; h: number; alpha(x: number, y: number): number } {
  const buf = readFileSync(file);
  let pos = 8, w = 0, h = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error(`${file}: not 8-bit RGBA`);
    }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4]! : 0, b = y > 0 ? out[(y - 1) * stride + x]! : 0, c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth : 0;
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + add) & 255;
    }
  }
  return { w, h, alpha: (x, y) => out[(y * w + x) * 4 + 3]! };
}

test('directions snap to quarter turns', () => {
  expect(quarterTurn(5, 0.4)).toBe(0);
  expect(quarterTurn(0.2, 3)).toBeCloseTo(Math.PI / 2, 9);
  expect(Math.abs(quarterTurn(-4, 0.1))).toBeCloseTo(Math.PI, 9);
  expect(quarterTurn(0, -2)).toBeCloseTo(-Math.PI / 2, 9);
});
