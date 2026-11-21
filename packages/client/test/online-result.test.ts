import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type MatchResult } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, dexEntries, unitCard } from '../src/ui/models';
import { teamResultModel } from '../src/online/result';

const data = loadGameData('stage2');

describe('team result', () => {
  test('titles, rows and series with gaps after elimination', () => {
    const result: MatchResult = { outcome: 'gate', tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
      { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3, 4, 5, 6, 7, 8, 20], bestUnit: { defId: 'gamasot', grade: 2 }, yeoksinDamage: 3000, helperOpens: 2 },
      { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 9, 30, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0 },
    ] };
    const m = teamResultModel(result, { 1: '가', 2: '나' }, data);
    expect(m.title).toBe('스토리 관문 실패'); expect(m.subtitle).toBe('도달 9라운드 · 역신 격파 0/2 · 생존 1/2');
    expect(m.rows.map(r => r.status)).toEqual(['생존·팀 패배', '4라운드 탈락 · 잡귀 한도']);
    expect(m.rows[0]!.best).toBe('가마솥 (2등급)'); expect(m.rows[1]!.best).toBe('–');
    expect(m.rows[1]!.series.slice(3, 6)).toEqual([61, null, null]); expect(m.rows[1]!.series.length).toBe(20);
    expect(teamResultModel({ ...result, outcome: 'clear' }, {}, data).title).toBe('팀 클리어');
  });
  test('byeoru card shows the damage that really lands', () => {
    const s = createGame(data, 1); placeUnitForTest(s, 'byeoru', 0);
    expect(unitCard(s, 0)!.skillText).toContain('실제 35%');
  });
  test('four ready recipes: Z/X/C on the first three in table order, the fourth still listed', () => {
    const s = createGame(data, 1);
    ['horong', 'bujigaengi', 'buchae', 'dadeumi', 'hwaetbul', 'bitjaru'].forEach((id, i) => placeUnitForTest(s, id, i));
    const opts = combineOptions(s, 0).filter(o => o.missing.length === 0);
    expect(opts.map(o => [o.result, o.key])).toEqual([['hwaro', 'Z'], ['cheongsachorong', 'X'], ['mumyeong', 'C'], ['jwibul', null]]);
  });
  test('dex lists 40 units for stage 2', () => {
    expect(dexEntries(data).length).toBe(40);
  });
});
