import { describe, expect, test } from 'vitest';
import { createGame, jigeCandidates, step, loadGameData } from '../src/index';
import { unitAttack } from '../src/data';
import { familyMedian, roleDps, type Role } from './role-power';
import { computeHitDamage, attackIntervalTicks, damageBonus, pickTarget } from '../src/combat';
import { upgradeCost } from '../src/upgrades';
import { forceRound, spawnEnemyForTest, placeUnitForTest } from '../src/testing';

const data = loadGameData();
const quiet = () => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };

describe('combat', () => {
  test('damage formula', () => {
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0, resist: 0, vuln: 0 })).toBe(13);
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0, resist: 0.5, vuln: 0 })).toBe(7);
    expect(computeHitDamage({ attack: 13.2, mult: 1, bonus: 0.26, resist: 0, vuln: 0.1 })).toBe(18);
    expect(computeHitDamage({ attack: 0.2, mult: 1, bonus: 0, resist: 0.5, vuln: 0 })).toBe(1);
  });
  test('attack interval with speed bonus', () => {
    expect(attackIntervalTicks(1.0, 0)).toBe(20);
    expect(attackIntervalTicks(1.0, 0.3)).toBe(15);
  });
  test('upgrade bonuses add', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 0);
    s.upgrades.physical = 2; s.upgrades.polish = 1;
    expect(damageBonus(s, 0)).toBeCloseTo(0.26);
    s.upgrades.magical = 5; expect(damageBonus(s, 0)).toBeCloseTo(0.26);
  });
  test('targets boss first, else lowest id; waits ready when nothing in range', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    expect(pickTarget(s, 2)).toBeNull();
    step(s, []); expect(s.slots[2]!.cooldown).toBe(0);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 1000); const b = spawnEnemyForTest(s, 'japgwi', 3.2, 1000);
    expect(pickTarget(s, 2)!.id).toBe(a.id);
    const boss = spawnEnemyForTest(s, 'jinegaksi', 3.1);
    expect(boss.boss).toBe(true);
    expect(pickTarget(s, 2)!.id).toBe(boss.id);
    const r = step(s, []);
    expect(r.events.some(e => e.type === 'attack')).toBe(true);
    expect(s.slots[2]!.cooldown).toBe(19);
    expect(b.hp).toBe(1000);
  });
  test('kill pays coin; damageDealt counts real hp removed', () => {
    const s = quiet(); placeUnitForTest(s, 'sotlid', 2);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 5);
    const coins = s.coins;
    step(s, []);
    expect(s.enemies.find(x => x.id === e.id)).toBeUndefined();
    expect(s.coins).toBe(coins + 1);
    expect(s.stats.at(-1)!.damageDealt).toBe(5);
  });
  test('last boss kill clears even while over the limit', () => {
    const s = createGame(data, 1); forceRound(s, 20); step(s, []);
    for (let i = 0; i < 70; i++) spawnEnemyForTest(s, 'japgwi', 12, 10 ** 9);
    s.enemies.find(e => e.boss)!.hp = 1; s.enemies.find(e => e.boss)!.d = 3;
    placeUnitForTest(s, 'sotlid', 2);
    step(s, []);
    expect(s.result).toEqual({ outcome: 'clear', reason: null, round: 20 });
    expect(s.buckwheat).toBe(2);
  });
  test('upgrades: cost, coins, max', () => {
    const s = createGame(data, 1);
    expect(upgradeCost(data.upgrades[0]!, 2)).toBe(50);
    expect(step(s, [{ type: 'upgrade', id: 'physical' }]).rejected[0]!.reason).toBe('noCoins');
    s.coins = 1000;
    step(s, [{ type: 'upgrade', id: 'physical' }]);
    expect([s.coins, s.upgrades.physical]).toEqual([975, 1]);
    s.upgrades.physical = 10;
    expect(step(s, [{ type: 'upgrade', id: 'physical' }]).rejected[0]!.reason).toBe('maxed');
  });
});

describe('recruited hidden units fight like an ordinary grade 4', () => {
  const d3r = loadGameData('stage3');
  const ROLE: Record<string, Role> = { jinegaksi: 'group', gangcheori: 'group', bulgasari: 'single', ssireumdokkaebi: 'single', eoduksini: 'group' };

  test('grade 4, hidden, own damage type; basic attack is 1/2.6² of the grade 6 one', () => {
    for (const id of Object.keys(ROLE)) {
      const def = d3r.units.find(u => u.id === id)!;
      expect([id, def.grade, def.hidden]).toEqual([id, 4, true]);
      const as6 = unitAttack({ ...def, grade: 6 }, d3r.balance);
      expect(unitAttack(def, d3r.balance) / as6).toBeCloseTo(1 / 2.6 ** 2, 9);
    }
    expect(d3r.units.find(u => u.id === 'gangcheori')!.damageType).toBe('magical');
    expect(d3r.units.find(u => u.id === 'jinegaksi')!.damageType).toBe('physical');
  });

  test('skill-inclusive damage on its role is 90-110% of the same-family normal grade 4 median', () => {
    for (const [id, role] of Object.entries(ROLE)) {
      const ratio = roleDps(d3r, id, role) / familyMedian(d3r, id, 4, role);
      expect([id, ratio >= 0.9 && ratio <= 1.1], `${id} ${ratio.toFixed(3)}`).toEqual([id, true]);
    }
  });

  test('recruits are never offered or taken by a jige swap', () => {
    for (const id of Object.keys(ROLE)) expect(jigeCandidates(d3r, id)).toEqual([]);
    const g4 = d3r.units.find(u => !u.hidden && u.grade === 4)!;
    expect(jigeCandidates(d3r, g4.id).some(u => u.hidden)).toBe(false);
  });
});
