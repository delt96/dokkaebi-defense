import { describe, expect, test } from 'vitest';
import { applyFull, buildFull, createMatch, loadGameData, roundStartTick, stepMatch, type MatchResult } from '@dorandi/logic';
import { jumpToTick } from '@dorandi/logic/testing';
import { topModel } from '../src/online/models';
import { teamResultModel } from '../src/online/result';

const d3 = loadGameData('stage3');

describe('60-round online screens', () => {
  test('top bar counts 60 rounds and four gates', () => {
    const m = createMatch(d3, 1, [1, 2, 3]); jumpToTick(m, roundStartTick(d3, 35)); stepMatch(m, []);
    const view = applyFull(buildFull(m, 1, { watching: 1, names: { 1: '가', 2: '나', 3: '다' }, key: 'k', n: 1 }));
    const top = topModel(view, d3);
    expect(top.line1).toMatch(/^35 \/ 60 라운드/);
    expect(top.line2).toMatch(/^관문 3\/4 · 39라운드 끝까지 · 역신 셋째 탈 /);
  });

  test('team result graphs all 60 rounds and counts four gates', () => {
    const result: MatchResult = { outcome: 'clear', tick: 1, round: 60, yeoksinKills: 4, started: 1, alive: 1, seats: [
      { seat: 1, outcome: 'finished', cause: null, round: 60, lastEnemies: 3, maxEnemies: 20, series: Array.from({ length: 60 }, (_, i) => i), bestUnit: null, yeoksinDamage: 1, helperOpens: 0 },
    ] };
    const m = teamResultModel(result, { 1: '가' }, d3);
    expect(m.subtitle).toBe('도달 60라운드 · 역신 격파 4/4 · 생존 1/1');
    expect(m.rows[0]!.series.length).toBe(60);
    expect(m.rows[0]!.series[59]).toBe(59);
  });
});
