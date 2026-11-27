import { expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { withNewUnits } from '../src/stage3/newUnits';
import { quantile } from '../src/stage3/report';
import { unitPower, unitPowerRows, UNIT_POWER_ROUNDS } from '../src/stage3/unitPower';

const d3 = loadGameData('stage3');

test('one unit alone deals damage, and the evolve charm scales it by about evolvedMult', () => {
  const t = d3.economy!.tame!.targets[0]!;
  const bare = unitPower(d3, t.unit, 21);
  const evolved = unitPower(d3, t.unit, 21, true);
  expect(bare).toBeGreaterThan(0);
  // overkill on respawned enemies keeps the gain under the multiplier
  expect(evolved / bare).toBeGreaterThan(t.evolvedMult! * 0.7);
  expect(evolved / bare).toBeLessThan(t.evolvedMult! * 1.02);
});

test('tamed units, evolved units and the exclusive results sit on their targets (two-round mean, within 6.5%)', () => {
  const rows = unitPowerRows(d3).filter(r => r.ratio !== null);
  const keys = [...new Set(rows.map(r => `${r.group}|${r.unit}`))];
  expect(keys).toHaveLength(15);
  for (const k of keys) {
    const rs = rows.filter(r => `${r.group}|${r.unit}` === k);
    const mean = rs.reduce((a, r) => a + r.ratio!, 0) / rs.length;
    // single-target units step with hits-to-kill, so the evolved means land within 6.5% rather than 5%
    expect([k, Math.abs(mean - rs[0]!.target!) <= 0.065], `${k} ${mean.toFixed(3)}`).toEqual([k, true]);
  }
}, 60_000);

test('new normal units are compared with the median of their grade, the new units left out of it', () => {
  const x = withNewUnits(d3, {
    units: [{ id: 'v7g5p', name: '임시5물', grade: 5, damageType: 'physical' }, { id: 'v7g6p', name: '임시6물', grade: 6, damageType: 'physical' }],
    recipes: [{ result: 'v7g5p', materials: ['dwiju', 'sokuri'] }, { result: 'v7g6p', materials: ['v7g5p', 'tteoksiru', 'chaeban'] }],
  });
  const rows = unitPowerRows(x, ['v7g5p', 'v7g6p']);
  const fives = d3.units.filter(u => u.grade === 5 && !u.hidden).map(u => u.id);
  const m21 = quantile(fives.map(id => unitPower(d3, id, 21)), 0.5)!;
  const g5 = rows.filter(r => r.unit === 'v7g5p');
  expect(g5.map(r => r.round)).toEqual([...UNIT_POWER_ROUNDS.early]);
  expect(g5[0]).toMatchObject({ group: 'new', name: '임시5물', target: 1 });
  expect(g5[0]!.ratio!).toBeCloseTo(unitPower(x, 'v7g5p', 21) / m21, 6);
  expect(rows.filter(r => r.unit === 'v7g6p').map(r => r.round)).toEqual([...UNIT_POWER_ROUNDS.late]);
  expect(rows.filter(r => r.round === 21 && r.group === 'normal5').map(r => r.dps)).toEqual([m21]);
  expect(rows.filter(r => r.group !== 'new' && r.ratio !== null)).toEqual(unitPowerRows(d3).filter(r => r.ratio !== null));
  expect(() => unitPowerRows(x, ['dwiju'])).toThrow(/grade 5 or 6/);
}, 120_000);
