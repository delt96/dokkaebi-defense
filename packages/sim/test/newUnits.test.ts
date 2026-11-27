import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { stage3Data } from '../src/stage3/cli';
import { buildGameData, dataSources, loadGameData, unitDef, validateData } from '@dorandi/logic';
import {
  assertKnownUnits, goal6, grade5Candidates, grade6Candidates, recipesFile, v7Goals, withNewUnits, type NewUnitOverlay,
} from '../src/stage3/newUnits';
import { applySwaps, grade1Balance } from '../src/stage3/spread';
import type { SummonReport } from '../src/stage3/summonSim';

const d = loadGameData('stage3');
// a new grade 5 alone fails validateData (not used in any recipe), so the fixture carries a grade 6 that uses it
const six: NewUnitOverlay = {
  units: [{ id: 'v7g5p', name: '임시5물', grade: 5, damageType: 'physical' }, { id: 'v7g6p', name: '임시6물', grade: 6, damageType: 'physical' }],
  recipes: [{ result: 'v7g5p', materials: ['dwiju', 'sokuri'], cost: { buckwheat: 1 } },
    { result: 'v7g6p', materials: ['v7g5p', 'tteoksiru', 'chaeban'], cost: { buckwheat: 1, coins: 60 } }],
};
test('withNewUnits adds the units with median stats and no skills', () => {
  const x = withNewUnits(d, six);
  expect(unitDef(x, 'v7g5p')).toMatchObject({ grade: 5, damageType: 'physical', skills: [] });
  expect(validateData(x).errors).toEqual([]);
  expect(withNewUnits(d, { units: [], recipes: [] })).toEqual(d);
});
test('an overlay unit that carries its own stats, skills and onBasicHit keeps them', () => {
  const skills = [{ trigger: { kind: 'nth' as const, n: 4 }, effects: [{ kind: 'crit' as const, mult: 2.3 }] }];
  const own: NewUnitOverlay = {
    ...six,
    units: [{ ...six.units[0]!, range: 1.5, interval: 1.2, factor: 1.08, skills, onBasicHit: { targetPct: 0, splashPct: 0.1 } }, six.units[1]!],
  };
  const x = withNewUnits(d, own);
  expect(unitDef(x, 'v7g5p')).toMatchObject({ range: 1.5, interval: 1.2, factor: 1.08, skills, onBasicHit: { targetPct: 0, splashPct: 0.1 } });
  expect(unitDef(x, 'v7g6p').skills).toEqual([]);
  expect(unitDef(x, 'v7g6p').onBasicHit).toBeUndefined();
  expect(validateData(x).errors).toEqual([]);
  skills[0]!.effects[0]!.mult = 9;
  expect(unitDef(x, 'v7g5p').skills[0]!.effects[0]).toEqual({ kind: 'crit', mult: 2.3 });
});
test('goals count the overlay grade 6 units', () => {
  const g = v7Goals(withNewUnits(d, six), ['v7g5p', 'v7g6p']);
  expect(g.g3.map(x => x.id)).toEqual(['v7g5p', 'v7g6p']);
  expect(g.g1.maxRatio).not.toBeCloseTo(grade1Balance(d).maxRatio, 5);
  expect(g.g2.over10).toContain('v7g6p');
  expect(() => v7Goals(d, ['v7g6p'])).toThrow(/v7g6p/);
  expect(() => v7Goals(d, [d.units.find(u => u.hidden && u.grade === 6)!.id])).toThrow(/normal grade 5 or 6/);
});
test('v6 data fails g1 and g2', () => {
  const g = v7Goals(d, []);
  expect([g.g1.pass, g.g2.pass, g.g4.pass]).toEqual([false, false, true]);
  expect(g.g2.over10.length).toBe(13);
});

test('a written recipes file plus the overlay rebuilds the searched data', () => {
  const searched = applySwaps(withNewUnits(d, six), [
    { result: 'v7g6p', from: 'chaeban', to: 'tteongme' },
    { result: 'samtaegi', from: 'ki', to: 'buchae' },
  ]);
  const src = dataSources();
  src.stage3.recipes = JSON.parse(JSON.stringify(recipesFile(searched, six)));
  const rebuilt = withNewUnits(buildGameData('stage3', src), six);
  expect(rebuilt).toEqual(searched);
  expect(rebuilt.recipes.filter(r => r.result === 'v7g5p')).toHaveLength(1);
  expect(rebuilt.recipes.find(r => r.result === 'v7g6p')!.materials).toContain('tteongme');
  expect(rebuilt.recipes.find(r => r.result === 'samtaegi')!.materials).toContain('buchae');
});

test('the stage 3 command line reads --recipes and --new-units and refuses recipes without their units', () => {
  const searched = applySwaps(withNewUnits(d, six), [{ result: 'samtaegi', from: 'ki', to: 'buchae' }]);
  const dir = mkdtempSync(join(tmpdir(), 'newunits-'));
  const recipes = join(dir, 'recipes.json');
  const overlay = join(dir, 'overlay.json');
  writeFileSync(recipes, JSON.stringify(recipesFile(searched, six)));
  writeFileSync(overlay, JSON.stringify(six));
  const argOf = (args: Record<string, string>) => (name: string, fallback: string) => args[name] ?? fallback;
  const cli = stage3Data(argOf({ recipes, 'new-units': overlay }));
  expect(cli.data).toEqual(searched);
  expect(cli.newIds).toEqual(['v7g5p', 'v7g6p']);
  expect(() => stage3Data(argOf({ recipes }))).toThrow(/--new-units/);
  expect(stage3Data(argOf({})).data).toEqual(d);
});

test('goal6 passes only below 40% on top with five picks over 5%', () => {
  const report = (shares: number[]): SummonReport => ({
    perUnit: [], byFamily: { physical: 0, magical: 0 },
    pickAt30: shares.map((share, i) => ({ id: `u${i}`, share })),
    second: { mean: 0, p10: 0, p90: 0, runs: 0, failed: 0 },
  });
  expect(goal6(report([0.4, 0.2, 0.15, 0.1, 0.1, 0.05]))).toEqual({ topShare: 0.4, over5pct: 5, pass: true });
  expect(goal6(report([0.41, 0.2, 0.15, 0.1, 0.09, 0.05])).pass).toBe(false);
  expect(goal6(report([0.3, 0.3, 0.2, 0.1, 0.05, 0.05])).pass).toBe(false);
});

test('a recipes file with new recipes needs the overlay', () => {
  const src = dataSources();
  src.stage3.recipes = JSON.parse(JSON.stringify(recipesFile(withNewUnits(d, six), six)));
  const bare = buildGameData('stage3', src);
  expect(() => assertKnownUnits(bare)).toThrow(/--new-units/);
  expect(() => assertKnownUnits(withNewUnits(bare, six))).not.toThrow();
  expect(() => assertKnownUnits(d)).not.toThrow();
});

test('grade5Candidates meet the share and top limits', () => {
  const xs = grade5Candidates(d, { minShare: 0.6, maxTop: 4 });
  expect(xs.length).toBeGreaterThan(0);
  for (const x of xs) { expect(x.share).toBeGreaterThanOrEqual(0.6); expect(x.top).toBeLessThanOrEqual(4); }
});
test('skips a material set that already exists', () => {
  const existing = new Set(d.recipes.map(r => [...r.materials].sort().join('+')));
  for (const x of grade5Candidates(d, { minShare: 0, maxTop: 99 })) expect(existing.has([...x.materials].sort().join('+'))).toBe(false);
});
test('grade5Candidates pair two different normal grade 4 units', () => {
  const units = new Map(d.units.map(u => [u.id, u]));
  const xs = grade5Candidates(d, { minShare: 0, maxTop: 99 });
  const g4 = d.units.filter(u => u.grade === 4 && !u.hidden).length;
  const taken = d.recipes.filter(r => r.materials.length === 2 && r.materials.every(m => units.get(m)?.grade === 4 && !units.get(m)?.hidden)).length;
  expect(xs.length).toBe((g4 * (g4 - 1)) / 2 - taken);
  for (const x of xs) {
    expect(x.materials[0]).not.toBe(x.materials[1]);
    for (const m of x.materials) expect(units.get(m)).toMatchObject({ grade: 4 });
  }
});
test('grade5Candidates reports the misses the pair adds, not the new unit itself', () => {
  const chaeban = grade5Candidates(d, { minShare: 0, maxTop: 99 }).filter(x => x.materials.includes('chaeban'));
  expect(chaeban.length).toBeGreaterThan(0);
  for (const x of chaeban) expect(x.misses.some(m => m.startsWith('chaeban '))).toBe(true);
  for (const x of grade5Candidates(d, { minShare: 0, maxTop: 99 })) expect(x.misses.join()).not.toMatch(/grade 5/);
});
test('grade6Candidates take a new grade 5 and a grade 3 or 4 third material', () => {
  const five = grade5Candidates(d, { minShare: 0.6, maxTop: 4 })[0]!;
  const x = withNewUnits(d, { units: [six.units[0]!], recipes: [{ result: 'v7g5p', materials: five.materials, cost: { buckwheat: 1 } }] });
  const units = new Map(x.units.map(u => [u.id, u]));
  const xs = grade6Candidates(x, ['v7g5p'], { minShare: 0.6, maxTop: 7 });
  expect(xs.length).toBeGreaterThan(0);
  const existing = new Set(x.recipes.map(r => [...r.materials].sort().join('+')));
  for (const c of xs) {
    expect(c.share).toBeGreaterThanOrEqual(0.6);
    expect(c.top).toBeLessThanOrEqual(7);
    expect(c.materials[0]).toBe('v7g5p');
    expect(units.get(c.materials[1])!.grade).toBe(5);
    expect(units.get(c.materials[1])!.hidden).toBeFalsy();
    expect(c.materials[1]).not.toBe('v7g5p');
    expect([3, 4]).toContain(units.get(c.materials[2])!.grade);
    expect(existing.has([...c.materials].sort().join('+'))).toBe(false);
  }
});
