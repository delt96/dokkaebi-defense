import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, unitDefFast } from '@dorandi/logic';
import { makeData, placeUnitForTest } from '@dorandi/logic/testing';
import { grade6Run, grade6Summary } from '../src/stage3/grade6';
import { expandTree, targetBot } from '../src/stage3/targetBot';
import { combineGainAll, combineGainCase, parseCombinePlacement, parseUpgradeLevels, prepareRound } from '../src/stage3/combineGain';
import { laneOf } from '@dorandi/logic';
import { controlTrial } from '../src/stage3/control';

const d3 = loadGameData('stage3');

describe('stage 3 sim checks', () => {
  test('combine gain case calibrates A to a partial clear and passes for hwaetbul', () => {
    const row = combineGainCase(d3, d3.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
    expect(row.aMean).toBeGreaterThanOrEqual(5); expect(row.aMean).toBeLessThanOrEqual(25);
    expect(row.pass).toBe(row.worstDelta <= 0);
  }, 60_000);

  test('skewed upgrades: both sides play at the given levels and the row says which', () => {
    expect(parseUpgradeLevels('10/0')).toEqual({ physical: 10, magical: 0 });
    expect(() => parseUpgradeLevels('ten')).toThrow();
    const recipe = d3.recipes.find(r => r.result === 'hwaetbul')!;
    expect(prepareRound(d3, recipe.materials, 1, recipe.result, 'fit', { physical: 0, magical: 10 }).upgrades).toMatchObject({ physical: 0, magical: 10 });
    const row = combineGainCase(d3, recipe, 'flow128', { seeds: 1, steps: 10, upgrades: { physical: 10, magical: 0 } });
    expect(row.upgrades).toBe('10/0');
  }, 60_000);

  test('a deliberately bad recipe fails', () => {
    const bad = makeData(d => { d.recipes.find(r => r.result === 'hwaetbul')!.materials = ['top', 'top']; }, 'stage3');
    const row = combineGainCase(bad, bad.recipes.find(r => r.result === 'hwaetbul')!, 'flow128', { seeds: 1, steps: 10 });
    expect([row.pass, row.worstDelta > 0]).toEqual([false, true]);
  }, 60_000);

  test('B keeps a melee result on a material cell at the edge (indupan)', () => {
    const recipe = d3.recipes.find(r => r.result === 'indupan')!;
    const row = combineGainCase(d3, recipe, 'flow128', { seeds: 1, steps: 10 });
    expect(row.bMean).toBeLessThan(30);
  }, 60_000);

  test('B moves a melee result to an edge cell when every material sat inside (maksabal)', () => {
    const recipe = d3.recipes.find(r => r.result === 'maksabal')!;
    const row = combineGainCase(d3, recipe, 'flow128', { seeds: 1, steps: 10 });
    expect(row.bMean).toBeLessThan(30);
  }, 60_000);

  test('plain placement only combines; fit moves an inner melee result to the edge (maksabal)', () => {
    const recipe = d3.recipes.find(r => r.result === 'maksabal')!;
    const cellOf = (placement: 'fit' | 'plain') => {
      const state = prepareRound(d3, recipe.materials, 1, recipe.result, placement);
      const i = state.slots.findIndex(u => u?.defId === 'maksabal');
      return { slot: i, edge: laneOf(state).cells[i]!.isEdge };
    };
    const plain = cellOf('plain');
    const fit = cellOf('fit');
    expect(plain.edge).toBe(false);
    expect(fit.edge).toBe(true);
    expect(plain.slot).not.toBe(fit.slot);
  });

  test('combine gain rows record the placement used', () => {
    const recipe = d3.recipes.find(r => r.result === 'hwaetbul')!;
    const row = combineGainCase(d3, recipe, 'flow128', { seeds: 1, steps: 6, placement: 'plain' });
    expect(row.placement).toBe('plain');
    expect(combineGainCase(d3, recipe, 'flow128', { seeds: 1, steps: 6 }).placement).toBe('fit');
  }, 60_000);

  test('combineGainAll leaves out tame recipes', () => {
    const tame = d3.recipes.filter(r => r.kind === 'tame').map(r => r.result);
    expect(tame.length).toBeGreaterThan(0);
    expect(combineGainAll(d3, { seeds: 1, steps: 1, scenarios: ['flow128'], results: tame })).toEqual([]);
  });

  test('parseCombinePlacement accepts fit and plain only', () => {
    expect(parseCombinePlacement('fit')).toBe('fit');
    expect(parseCombinePlacement('plain')).toBe('plain');
    expect(() => parseCombinePlacement('edge')).toThrow();
  });

  test('control trial with cap3 stays under 30% and none stops at least as long', () => {
    const capped = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'cap3', seed: 1 });
    const free = controlTrial(d3, { lineup: 'saw2pot', boss: 'jinegaksi', cap: 'none', seed: 1 });
    expect(capped.stoppedShare).toBeLessThanOrEqual(0.3); expect(capped.pass).toBe(true);
    expect(free.stoppedTicks).toBeGreaterThanOrEqual(capped.stoppedTicks); expect(free.pass).toBeNull();
  }, 60_000);
});

describe('stage 3 first grade 6 round', () => {
  test('expandTree leaf totals equal recipe value', () => {
    const t = expandTree(d3, 'bihyeongrang');
    const leaves = [...t].filter(([id]) => unitDefFast(d3, id).grade === 1).reduce((a, [, n]) => a + n, 0);
    expect([leaves, t.get('top'), t.get('bihyeongrang')]).toEqual([40, 1, 1]);
    expect([...expandTree(d3, 'top')].filter(([id]) => unitDefFast(d3, id).grade === 1).reduce((a, [, n]) => a + n, 0)).toBe(16);
  });

  test('target bot sells non-tree units first and never sells grade 6', () => {
    const target = 'cheonnyeonmunbitjang';
    const tree = expandTree(d3, target);
    const outsider = d3.units.find(u => u.grade === 2 && !tree.has(u.id))!.id;
    const s = createGame(d3, 1); s.tokens = 3;
    placeUnitForTest(s, 'gildal', 0); placeUnitForTest(s, outsider, 1);
    s.slots.forEach((u, i) => { if (!u && s.open[i]) placeUnitForTest(s, 'soemangchi', i); });
    const cmds = targetBot(1, { targets: [target] }).decide(s);
    expect(cmds).toContainEqual({ type: 'sell', slot: 1 });
    expect(cmds).not.toContainEqual({ type: 'sell', slot: 0 });
    const t = createGame(d3, 1); t.tokens = 3;
    t.slots.forEach((u, i) => { if (!u && t.open[i]) placeUnitForTest(t, 'gildal', i); });
    const only6 = targetBot(1, { targets: [target] }).decide(t);
    expect(only6.some(c => c.type === 'sell')).toBe(false);
    expect(only6).toContainEqual({ type: 'convertToken' });
  });

  test('target bot sells tree units beyond what the target still needs', () => {
    const target = 'bihyeongrang';
    const s = createGame(d3, 1); s.tokens = 3;
    const kkeulTree = expandTree(d3, 'kkeul');
    const coveredLeaf = [...expandTree(d3, 'top').keys()].find(id => unitDefFast(d3, id).grade === 1 && !kkeulTree.has(id))!;
    placeUnitForTest(s, 'top', 0); placeUnitForTest(s, coveredLeaf, 1);
    s.slots.forEach((u, i) => { if (!u && s.open[i]) placeUnitForTest(s, 'jumadeung', i); });
    const cmds = targetBot(1, { targets: [target] }).decide(s);
    expect(cmds.some(c => c.type === 'convertToken')).toBe(false);
    expect(cmds).toContainEqual({ type: 'sell', slot: 1 });
  });

  test('grade6Run is deterministic and reports a round or null', () => {
    const hard = makeData(d => { d.balance.defaultDifficulty = 'hard'; }, 'stage3');
    const a = grade6Run(hard, 1, targetBot(1, { targets: ['cheonnyeonmunbitjang'] }), { noDefeat: true });
    const b = grade6Run(hard, 1, targetBot(1, { targets: ['cheonnyeonmunbitjang'] }), { noDefeat: true });
    expect(a).toEqual(b); expect(a.endRound).toBe(70);
    expect(a.firstGrade6Round === null || (a.firstGrade6Round >= 1 && a.firstGrade6Round <= 70)).toBe(true);
  }, 120_000);

  test('grade6Summary treats never as later than any round', () => {
    const row = (r: number | null) => ({ firstGrade6Round: r }) as Parameters<typeof grade6Summary>[0][number];
    expect(grade6Summary([row(30), row(40), row(null), row(50)])).toEqual({ median: 40, p90: null, neverRate: 0.25 });
  });
});
