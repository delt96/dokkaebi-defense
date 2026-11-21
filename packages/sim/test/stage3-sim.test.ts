import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { makeData } from '@dorandi/logic/testing';
import { combineGainCase } from '../src/stage3/combineGain';
import { controlTrial } from '../src/stage3/control';

const d3 = loadGameData('stage3');

describe('stage 3 sim checks', () => {
  test('combine gain case calibrates A to a partial clear and passes for hwaetbul', () => {
    const row = combineGainCase(d3, d3.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
    expect(row.aMean).toBeGreaterThanOrEqual(5); expect(row.aMean).toBeLessThanOrEqual(25);
    expect(row.pass).toBe(row.worstDelta <= 0);
  }, 60_000);

  test('a deliberately bad recipe fails', () => {
    const bad = makeData(d => { d.recipes.find(r => r.result === 'hwaetbul')!.materials = ['top', 'top']; }, 'stage3');
    const row = combineGainCase(bad, bad.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
    expect([row.pass, row.worstDelta > 0]).toEqual([false, true]);
  }, 60_000);

  test('control trial with cap3 stays under 30% and none stops at least as long', () => {
    const capped = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'cap3', seed: 1 });
    const free = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'none', seed: 1 });
    expect(capped.stoppedShare).toBeLessThanOrEqual(0.3); expect(capped.pass).toBe(true);
    expect(free.stoppedTicks).toBeGreaterThanOrEqual(capped.stoppedTicks); expect(free.pass).toBeNull();
  }, 60_000);
});
