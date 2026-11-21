import { describe, expect, test } from 'vitest';
import { laneOf, loadGameData, unitDefFast } from '@dorandi/logic';
import { runGame, roundRows, toCsv } from '../src/runner';
import { clumsyBot, normalBot } from '../src/bots';
import { econTable } from '../src/econ';

const data = loadGameData();
const strip = (s: object) => JSON.stringify({ ...s, data: undefined });

describe('sim', () => {
  test('same seed and bot give identical final state', () => {
    expect(strip(runGame(data, 11, normalBot()))).toBe(strip(runGame(data, 11, normalBot())));
  });
  test('different seeds give different games', () => {
    expect(strip(runGame(data, 11, normalBot()))).not.toBe(strip(runGame(data, 12, normalBot())));
  });
  test('games end and rows are well-formed', () => {
    const s = runGame(data, 3, clumsyBot(3));
    expect(s.phase).toBe('ended');
    const rows = roundRows(s, 3, 'clumsy');
    expect(rows.length).toBe(s.result!.round);
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe('seed,bot,round,nominalMultiplier,realMultiplier,killRatio,endEnemies,maxEnemies,boardDps,coins,coinsEarned,tokens,g1,g2,g3,g4,bossKillSeconds,outcome,endRound');
  });
  test('econ table values tokens at their summon round', () => {
    const t = econTable(data);
    expect(t).toContain('1라운드부터 1.25');
    expect(t).toContain('5라운드부터 1.34');
    expect(t).toContain('10라운드부터 1.40');
    expect(t).toContain('| 20R | 44 | 47 | 40 |');
  });
  test('normal bot spends tokens instead of stalling on a full board', () => {
    for (const seed of [5, 6, 7]) {
      const st = runGame(data, seed, normalBot());
      expect(st.tokens).toBeLessThanOrEqual(2);
    }
  });
  test('normal bot never ends with melee stuck inside while ranged sits on the edge', () => {
    for (const seed of [1, 2, 3, 4, 6]) {
      const st = runGame(data, seed, normalBot());
      const lane = laneOf(st);
      const kind = (i: number) => unitDefFast(st.data, st.slots[i]!.defId).range <= 2.0;
      const meleeInside = st.slots.some((u, i) => u && kind(i) && !lane.cells[i]!.isEdge);
      const rangedEdge = st.slots.some((u, i) => u && !kind(i) && lane.cells[i]!.isEdge);
      expect(meleeInside && rangedEdge).toBe(false);
    }
  });
  test('real multiplier counts damage dealt during the round', () => {
    const st = runGame(data, 2, normalBot());
    const rows = roundRows(st, 2, 'normal');
    const r5 = rows.find(r => r.round === 5)!;
    expect(r5.realMultiplier).toBeGreaterThan(0);
    expect(r5.killRatio).toBeLessThanOrEqual(1);
  });
});
