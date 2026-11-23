import { describe, expect, test } from 'vitest';
import { availableRecipes, createGame, damageBonus, enemyDef, enemyHp, loadGameData, roundStartTick, speedBonus, step, unitDef } from '../src/index';
import { toTicks } from '../src/flow';
import { auraAttackPower } from '../src/effects';
import { placeUnitForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const ids = (s: ReturnType<typeof createGame>) => s.slots.filter(Boolean).map(u => u!.defId);

describe('stage 3 board rules', () => {
  test('grade 5 combine needs one buckwheat; rejection consumes nothing', () => {
    const s = createGame(d3, 1); s.buckwheat = 0; placeUnitForTest(s, 'meok', 7); placeUnitForTest(s, 'jige', 0);
    expect(availableRecipes(s)).not.toContain('top');
    const r = step(s, [{ type: 'combine', result: 'top' }]);
    expect(r.rejected[0]!.reason).toBe('noBuckwheat');
    expect(ids(s).sort()).toEqual(['jige', 'meok']);
    s.buckwheat = 1;
    expect(availableRecipes(s)).toContain('top');
    step(s, [{ type: 'combine', result: 'top' }]);
    expect([s.buckwheat, ids(s)]).toEqual([0, ['top']]);
  });

  test('grade 6 combine needs 60 coins too', () => {
    const s = createGame(d3, 1);
    for (const [id, i] of [['top', 0], ['kkeul', 1], ['ja', 7]] as const) placeUnitForTest(s, id, i);
    s.buckwheat = 1; s.coins = 59;
    expect(step(s, [{ type: 'combine', result: 'bihyeongrang' }]).rejected[0]!.reason).toBe('noCoins');
    expect([s.buckwheat, s.coins, ids(s).length]).toEqual([1, 59, 3]);
    s.coins = 60; step(s, [{ type: 'combine', result: 'bihyeongrang' }]);
    expect([s.coins, s.buckwheat, ids(s)]).toEqual([0, 0, ['bihyeongrang']]);
  });

  test('a unit gets only its own damage type upgrade, whatever its materials were', () => {
    for (const data of [d3, loadGameData('stage2')]) {
      const s = createGame(data, 1); s.upgrades.physical = 2; s.upgrades.magical = 7;
      placeUnitForTest(s, 'jangdok', 9); // physical, made from a magical material in stage 3; polish level 0
      expect(damageBonus(s, 9)).toBeCloseTo(0.2);
    }
    const t = createGame(d3, 1); t.upgrades.physical = 10;
    placeUnitForTest(t, 'bihyeongrang', 9);
    expect(unitDef(d3, 'bihyeongrang').damageType).toBe('magical');
    expect(damageBonus(t, 9)).toBeCloseTo(0);
  });

  test('aura caps: attack speed 0.5, attack power 0.4', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'top', 7); // physical, so the physical-only auras of mulle and byeongpung count too
    for (const [id, i] of [['cheongsachorong', 0], ['daljip', 1], ['mulle', 2], ['cheonnyeonbyeongpung', 6]] as const) placeUnitForTest(s, id, i);
    expect(speedBonus(s, 7)).toBe(0.5); // 0.1 + 0.2 + 0.12 + 0.12 = 0.54 uncapped
    const t = createGame(d3, 1); placeUnitForTest(t, 'meok', 7);
    for (const [id, i] of [['pulmu', 0], ['gat', 1], ['cheonnyeonjokja', 6], ['bihyeongrang', 8]] as const) placeUnitForTest(t, id, i);
    expect(auraAttackPower(t, 7)).toBe(0.4); // 0.15 + 0.13 + 0.12 + 0.1 = 0.5 uncapped
  });

  test('periodic skills start ready in stage 3 only', () => {
    const s3 = createGame(d3, 1); expect(placeUnitForTest(s3, 'yeonjabangga', 7).periodic).toEqual([0]);
    const s1 = createGame(loadGameData(), 1); expect(placeUnitForTest(s1, 'yeonjabangga', 7).periodic).toEqual([40]);
  });

  test('sell price of grade 6 comes from stage 3 balance', () => {
    const s = createGame(d3, 1); placeUnitForTest(s, 'gildal', 0); step(s, [{ type: 'sell', slot: 0 }]); expect(s.coins).toBe(180);
  });
});

describe('stage 3 runs 70 rounds', () => {
  test('normal enemies grow 8% a round from round 65; bosses and events keep their hp', () => {
    const b = d3.balance; const japgwi = enemyDef(d3, 'japgwi');
    const plain = (r: number, m = 1) => Math.round((b.hp.base + b.hp.coef * r ** b.hp.exp) * japgwi.hpMult * m);
    expect(enemyHp(japgwi, 64, b)).toBe(plain(64));
    expect(enemyHp(japgwi, 65, b)).toBe(plain(65, 1.08));
    expect(enemyHp(japgwi, 70, b)).toBe(plain(70, 1.48));
    expect(enemyHp(enemyDef(d3, 'jinegaksi7'), 70, b)).toBe(enemyDef(d3, 'jinegaksi7').hp);
    const event = d3.enemies.find(e => e.event && e.hp !== undefined)!;
    expect(enemyHp(event, 70, b)).toBe(event.hp);
  });

  test('the match runs 70 rounds and ends on the round 70 boss', () => {
    expect(roundStartTick(d3, 1)).toBe(toTicks(15));
    expect(roundStartTick(d3, 71) - roundStartTick(d3, 1)).toBe(toTicks(63 * 34 + 7 * 70));
    expect(d3.waves.find(w => w.round === 70)).toEqual({ round: 70, type: 'boss', boss: 'jinegaksi7' });
  });
});
