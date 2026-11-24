import { describe, expect, test } from 'vitest';
import { createGame, enemyHp, loadGameData } from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { boardFirepower, firepowerMarkdown, firepowerRun, roundNeed } from '../src/stage3/firepower';
import { STANDARD_CONFIGS } from '../src/stage3/econRun';

const d3 = loadGameData('stage3');

describe('board firepower', () => {
  test('roundNeed is the HP of all spawns of a normal round over the round time, NaN on a boss round', () => {
    const wave = d3.waves.find(w => w.round === 21)!;
    const def = d3.enemies.find(e => e.id === (wave.type === 'normal' ? wave.pattern[0] : ''))!;
    expect(roundNeed(d3, 21)).toBeCloseTo(d3.balance.spawnCount * enemyHp(def, 21, d3.balance) / d3.balance.roundSeconds);
    expect(roundNeed(d3, 20)).toBeNaN();
  });

  test('an empty board deals nothing, units add firepower, and the snapshot is left as it was', () => {
    const s = createGame(d3, 1);
    forceRound(s, 21);
    expect(boardFirepower(s)).toBe(0);
    placeUnitForTest(s, 'top', 0);
    const one = boardFirepower(s);
    expect(one).toBeGreaterThan(0);
    expect(boardFirepower(s)).toBe(one);
    placeUnitForTest(s, 'kkeul', 1);
    expect(boardFirepower(s)).toBeGreaterThan(one);
    expect([s.tick, s.enemies.length, s.slots.filter(Boolean).length]).toEqual([s.tick, 0, 2]);
  });

  test('firepowerRun measures every live seat at the asked rounds and the markdown reports the median ratio', () => {
    const c = STANDARD_CONFIGS.find(x => x.name === 'switch-full-q2')!;
    const rows = firepowerRun(d3, 1, c, [5, 11]);
    expect(rows.map(r => r.round)).toEqual([...Array(6).fill(5), ...Array(6).fill(11)]);
    for (const r of rows) expect(r.ratio).toBeCloseTo(r.firepower / r.need);
    const md = firepowerMarkdown(rows);
    expect(md).toContain('| 라운드 |');
    expect(md).toContain('switch-full-q2');
  }, 60_000);
});
