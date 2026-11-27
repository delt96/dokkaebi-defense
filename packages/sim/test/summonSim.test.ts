import { expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { summonReport, summonsToBuild, summonStream } from '../src/stage3/summonSim';

const d = loadGameData('stage3');
test('pity picks the first least-summoned in unit order', () => {
  const s = summonStream(d, 1, 5);
  const counts = new Map<string, number>(); for (const id of s.slice(0, 4)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const g1 = d.units.filter(u => u.grade === 1).map(u => u.id);
  expect(s[4]).toBe(g1.find(id => !counts.has(id)) ?? g1.reduce((a, b) => (counts.get(b)! < counts.get(a)! ? b : a)));
});
test('summonsToBuild counts until every leaf is held', () => {
  expect(summonsToBuild(new Map([['ki', 2]]), ['ki', 'horong', 'ki', 'ki'])).toBe(3);
  expect(summonsToBuild(new Map([['ki', 2]]), ['ki'])).toBeNull();
});
test('the v6 baseline matches the design measurement', () => {
  const r = summonReport(d, { runs: 400, length: 400 });
  const unit = (id: string) => r.perUnit.find(u => u.id === id)!;
  expect(unit('bangmangidokkaebi').mean).toBeGreaterThan(46); expect(unit('bangmangidokkaebi').mean).toBeLessThan(54);
  expect(unit('cheonnyeonjing').mean).toBeGreaterThan(106); expect(unit('cheonnyeonjing').mean).toBeLessThan(122);
  const top = r.pickAt30[0]!;
  expect(top.id).toBe('bangmangidokkaebi'); expect(top.share).toBeGreaterThan(0.6); expect(top.share).toBeLessThan(0.8);
}, 120_000);
