import { expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { unitPower, unitPowerRows } from '../src/stage3/unitPower';

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
