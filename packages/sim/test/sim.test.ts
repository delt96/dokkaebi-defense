import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
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
    expect(csv.split('\n')[0]).toBe('seed,bot,round,multiplier,endEnemies,maxEnemies,boardDps,coins,tokens,g1,g2,g3,g4,bossKillSeconds,outcome,endRound');
  });
  test('econ table reproduces spec section 11', () => {
    const t = econTable(data);
    expect(t).toContain('44'); expect(t).toContain('124'); expect(t).toMatch(/1\.4/);
  });
});
