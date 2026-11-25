import { describe, expect, test } from 'vitest';
import { applyFull, buildFull, createMatch, loadGameData, roundStartTick, stepMatch, type MatchResult } from '@dorandi/logic';
import { jumpToTick } from '@dorandi/logic/testing';
import { topModel } from '../src/online/models';
import { teamResultModel } from '../src/online/result';

const d3 = loadGameData('stage3');

describe('70-round online screens', () => {
  test('top bar counts 70 rounds and five gates', () => {
    const m = createMatch(d3, 1, [1, 2, 3]); jumpToTick(m, roundStartTick(d3, 35)); stepMatch(m, []);
    const view = applyFull(buildFull(m, 1, { watching: 1, names: { 1: '가', 2: '나', 3: '다' }, key: 'k', n: 1 }));
    const top = topModel(view, d3);
    expect(top.line1).toMatch(/^35 \/ 70 라운드/);
    expect(top.line2).toMatch(/^관문 3\/5 · 마감까지 4라운드 · 역신\(셋째\) 체력 /);
  });

  test('top bar names the fifth gate', () => {
    const m = createMatch(d3, 1, [1, 2], { difficulty: 'hard' }); jumpToTick(m, roundStartTick(d3, 65)); stepMatch(m, []);
    const view = applyFull(buildFull(m, 1, { watching: 1, names: { 1: '가', 2: '나' }, key: 'k', n: 1 }));
    expect(topModel(view, d3).line2).toMatch(/^관문 5\/5 · 마감까지 4라운드 · 역신\(다섯째\) 체력 /);
  });

  test('team result graphs all 70 rounds and counts five gates', () => {
    const result: MatchResult = { outcome: 'clear', tick: 1, round: 70, yeoksinKills: 4, started: 1, alive: 1, seats: [
      { seat: 1, outcome: 'finished', cause: null, round: 70, lastEnemies: 3, maxEnemies: 20, series: Array.from({ length: 70 }, (_, i) => i), bestUnit: null, yeoksinDamage: 1, helperOpens: 0, supportSent: 0, supportReceived: 0 },
    ] };
    const m = teamResultModel(result, { 1: '가' }, d3);
    expect(m.subtitle).toBe('도달 70라운드 · 역신 격파 4/5 · 생존 1/1');
    expect(m.rows[0]!.series.length).toBe(70);
    expect(m.rows[0]!.series[69]).toBe(69);
  });
});
