import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, step } from '@dorandi/logic';
import { hudModel, helperModel, upgradeRows, unitCard, dexEntries } from '../src/ui/models';

const data = loadGameData();

describe('ui models', () => {
  test('hud', () => {
    const s = createGame(data, 1);
    expect(hudModel(s).roundText).toBe('준비');
    for (let i = 0; i < 401; i++) step(s, []);
    expect(hudModel(s)).toMatchObject({ roundText: '1 / 20 라운드', enemyText: '우리 고개 잡귀 1 / 60' });
    expect(hudModel(s).secondsLeft).toBe(40);
  });
  test('helper and card', () => {
    const s = createGame(data, 1);
    s.slots[0] = { id: 1, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] };
    s.slots[1] = { id: 2, defId: 'bujigaengi', cooldown: 0, attackCount: 0, periodic: [] };
    expect(helperModel(s)).toEqual([{ recipe: 'gamasot', name: '가마솥', grade: 2 }]);
    expect(unitCard(s, 0)).toMatchObject({ name: '솥뚜껑', grade: 1, typeText: '물딜', skillText: '20% 스턴 0.5초', usedIn: ['가마솥', '장독'], sellPrice: 5 });
    expect(unitCard(s, 5)).toBeNull();
  });
  test('upgrade rows', () => {
    const s = createGame(data, 1); s.coins = 30; s.upgrades.slots = 3;
    const rows = upgradeRows(s);
    expect(rows.map(r => r.label)).toEqual(['물딜 강화', '마딜 강화', '등급 손질', '칸 늘리기']);
    expect(rows[0]).toMatchObject({ level: 0, cost: 25, affordable: true });
    expect(rows[3]).toMatchObject({ cost: null, affordable: false });
  });
  test('dex has 22 entries with recipes for grade 2+', () => {
    const d = dexEntries(data);
    expect(d.length).toBe(22);
    expect(d.find(x => x.id === 'daljip')!.recipe).toEqual(['쥐불', '횃불', '청사초롱']);
    expect(d.find(x => x.id === 'sotlid')!.recipe).toEqual([]);
  });
});

import { resultModel } from '../src/ui/models';
import { forceRound } from '@dorandi/logic/testing';

test('result model', () => {
  const s = createGame(data, 1); forceRound(s, 10);
  for (let i = 0; i < 1501; i++) step(s, []);
  s.helperOpens = 3;
  const m = resultModel(s, 'gamasot');
  expect(m).toMatchObject({ title: '탈락', reasonText: '고개 보스를 놓쳤습니다', roundReached: 10, bestUnit: { name: '가마솥', grade: 2 }, helperText: '도우미 3회' });
  expect(m.series.length).toBe(s.stats.length);
});

import { rightModel, rejectText } from '../src/ui/models';

describe('final review fixes: right panel and reject notices', () => {
  const unit = (id: number) => ({ id, defId: 'sotlid', cooldown: 0, attackCount: 0, periodic: [] });
  test('summon is disabled when no open cell is free, convert is not', () => {
    const s = createGame(data, 1);
    expect(rightModel(s)).toEqual({ canSummon: true, canConvert: true, pending: 0 });
    s.open.forEach((o, i) => { if (o) s.slots[i] = unit(i + 1); });
    expect(rightModel(s)).toMatchObject({ canSummon: false, canConvert: true });
  });
  test('stored pity units are counted', () => {
    const s = createGame(data, 1);
    s.pendingPity.push('bitjaru', 'japgwi' as never);
    expect(rightModel(s).pending).toBe(2);
  });
  test('reject reasons the player caused get a message, stale clicks stay silent', () => {
    expect(rejectText('noSlot')).toBe('빈 칸이 없습니다');
    expect(rejectText('noToken')).toBe('도깨비불이 없습니다');
    expect(rejectText('noCoins')).toBe('엽전이 모자랍니다');
    expect(rejectText('maxed')).toBe('이미 최대 단계입니다');
    expect(rejectText('missingMaterials')).toBe('재료가 모자랍니다');
    expect(rejectText('noUnit')).toBeNull();
    expect(rejectText('ended')).toBeNull();
  });
});
