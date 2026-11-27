import { expect, test } from 'vitest';
import { buildGameData, dataSources, loadGameData, unitDef, validateData } from '@dorandi/logic';
import { assertKnownUnits, goal6, recipesFile, v7Goals, withNewUnits, type NewUnitOverlay } from '../src/stage3/newUnits';
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
