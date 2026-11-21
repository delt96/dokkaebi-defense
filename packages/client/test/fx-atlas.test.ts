import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
});

test('directions snap to quarter turns', () => {
  expect(quarterTurn(5, 0.4)).toBe(0);
  expect(quarterTurn(0.2, 3)).toBeCloseTo(Math.PI / 2, 9);
  expect(Math.abs(quarterTurn(-4, 0.1))).toBeCloseTo(Math.PI, 9);
  expect(quarterTurn(0, -2)).toBeCloseTo(-Math.PI / 2, 9);
});
