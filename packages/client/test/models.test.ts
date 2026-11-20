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
