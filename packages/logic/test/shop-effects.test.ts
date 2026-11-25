import { describe, expect, test } from 'vitest';
import {
  attackIntervalTicks, chooseSlot, createGame, damageBonus, dist, laneOf, loadGameData, pickTarget, resolveKills, shopItem, speedBonus,
  stateHash, step, toTicks, unitDefFast, unitRange, vulnOf, type GameData, type GameEvent, type GameState, type ItemEffect,
} from '../src/index';
import { unitAttacks } from '../src/combat';
import { performAttack, tickStatuses } from '../src/effects';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const ENEMY = d3.waves.find(w => w.type === 'normal')!.pattern[0]!;

const quiet = (data: GameData = d3): GameState => {
  const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s;
};
const effectOf = <K extends ItemEffect['kind']>(id: string, kind: K): Extract<ItemEffect, { kind: K }> => {
  const e = shopItem(d3, id)!.effect;
  if (e.kind !== kind) throw new Error(`${id} is not ${kind}`);
  return e as Extract<ItemEffect, { kind: K }>;
};
const away = (s: GameState, slot: number, d: number) => dist(laneOf(s).cells[slot]!, laneOf(s).pointAt(d));
function findD(s: GameState, ok: (d: number) => boolean): number {
  const p = laneOf(s).perimeter;
  for (let k = 0; k < p * 200; k++) if (ok(k / 200)) return k / 200;
  throw new Error('no such spot on the path');
}
const enemy = (s: GameState, d: number) => spawnEnemyForTest(s, ENEMY, d, 10 ** 7);
const damageTo = (events: GameEvent[], enemyId: number) =>
  events.find((e): e is Extract<GameEvent, { type: 'damage' }> => e.type === 'damage' && e.enemyId === enemyId)!.amount;
const auraOver = (unitId: string, kind: 'auraAttackPower' | 'auraAttackSpeed') => makeData(d => {
  for (const sk of d.units.find(u => u.id === unitId)!.skills) for (const e of sk.effects) if (e.kind === kind) e.pct = 1;
}, 'stage3');

describe('item effects', () => {
  test('rangeCharm reaches 0.5 further and does not move where the unit stands', () => {
    const s = quiet();
    const def = unitDefFast(d3, 'eomang');
    const edgeBefore = laneOf(s).cells[chooseSlot(s, def)!]!.isEdge;
    const slot = 7;
    const u = placeUnitForTest(s, 'eomang', slot);
    const amount = effectOf('rangeCharm', 'range').amount;
    expect(amount).toBeGreaterThan(0.3);
    expect(unitRange(s, slot)).toBe(def.range);
    const target = enemy(s, findD(s, d => Math.abs(away(s, slot, d) - (def.range + 0.3)) < 0.01));
    expect(pickTarget(s, slot)).toBeNull();
    u.item = 'rangeCharm';
    expect(unitRange(s, slot)).toBeCloseTo(def.range + amount);
    expect(pickTarget(s, slot)).toBe(target);
    expect(laneOf(s).cells[chooseSlot(s, def)!]!.isEdge).toBe(edgeBefore);
  });

  test('two identical casters keep their own range', () => {
    const s = quiet();
    const def = unitDefFast(d3, 'meok');
    const amount = effectOf('rangeCharm', 'range').amount;
    const [a, b] = [0, 5];
    placeUnitForTest(s, 'meok', a).item = 'rangeCharm';
    placeUnitForTest(s, 'meok', b);
    const e = enemy(s, findD(s, d => away(s, a, d) > def.range + 0.05 && away(s, a, d) <= def.range + amount - 0.05 && away(s, b, d) > def.range + amount + 0.05));
    expect(pickTarget(s, a)).toBe(e);
    expect(pickTarget(s, b)).toBeNull();
    const events: GameEvent[] = [];
    s.slots[a]!.periodic = [];
    s.slots[b]!.periodic = [];
    unitAttacks(s, events);
    expect(events.some(x => x.type === 'damage' && x.enemyId === e.id && x.source === 'meok')).toBe(true);
  });

  test('powerCharm adds 0.2 to the damage bonus outside the aura cap', () => {
    const pct = effectOf('powerCharm', 'attack').pct;
    const plain = quiet();
    const lone = placeUnitForTest(plain, 'che', 20);
    const before = damageBonus(plain, 20);
    lone.item = 'powerCharm';
    expect(damageBonus(plain, 20) - before).toBeCloseTo(pct);

    const data = auraOver('gat', 'auraAttackPower');
    const s = quiet(data);
    const cap = data.balance.auraCaps!.attackPower;
    placeUnitForTest(s, 'gat', 2);
    placeUnitForTest(s, 'che', 1);
    placeUnitForTest(s, 'che', 3).item = 'powerCharm';
    expect(damageBonus(s, 1)).toBeCloseTo(cap);
    expect(damageBonus(s, 3)).toBeCloseTo(cap + pct);
    const target = enemy(s, findD(s, d => away(s, 1, d) <= 2 && away(s, 3, d) <= 2));
    const hits: number[] = [];
    for (const slot of [1, 3]) {
      const events: GameEvent[] = [];
      performAttack(s, slot, target, events);
      hits.push(damageTo(events, target.id));
    }
    expect(hits[1]! / hits[0]!).toBeCloseTo((1 + cap + pct) / (1 + cap), 2);
  });

  test('swiftCharm adds 0.15 to the speed bonus outside the aura cap', () => {
    const pct = effectOf('swiftCharm', 'speed').pct;
    const plain = quiet();
    const lone = placeUnitForTest(plain, 'che', 20);
    const before = speedBonus(plain, 20);
    lone.item = 'swiftCharm';
    expect(speedBonus(plain, 20) - before).toBeCloseTo(pct);

    const data = auraOver('indu', 'auraAttackSpeed');
    const s = quiet(data);
    const cap = data.balance.auraCaps!.attackSpeed;
    placeUnitForTest(s, 'indu', 2);
    const slow = placeUnitForTest(s, 'che', 1);
    const fast = placeUnitForTest(s, 'che', 3);
    fast.item = 'swiftCharm';
    expect(speedBonus(s, 1)).toBeCloseTo(cap);
    expect(speedBonus(s, 3)).toBeCloseTo(cap + pct);
    enemy(s, findD(s, d => away(s, 1, d) <= 2 && away(s, 3, d) <= 2));
    unitAttacks(s, []);
    const interval = unitDefFast(data, 'che').interval;
    expect(fast.cooldown).toBe(attackIntervalTicks(interval, cap + pct) - 1);
    expect(slow.cooldown).toBe(attackIntervalTicks(interval, cap) - 1);
    expect(fast.cooldown).toBeLessThan(slow.cooldown);
  });

  test('weakCharm weakens only the basic attack\'s target, per damage type', () => {
    const s = quiet();
    const weak = effectOf('weakCharm', 'vuln');
    const key = 'item:weakCharm:physical';
    const slot = 1;
    const u = placeUnitForTest(s, 'eomang', slot);
    u.item = 'weakCharm';
    const at = findD(s, d => away(s, slot, d) <= 1.5);
    const target = enemy(s, at);
    const side = enemy(s, at + 0.3);
    u.attackCount = 3;
    const events: GameEvent[] = [];
    performAttack(s, slot, target, events);
    expect(target.hp).toBeGreaterThan(0);
    expect(side.hp).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'damage' && e.enemyId === side.id)).toBe(true);
    expect(vulnOf(s, target, 'physical')).toBeCloseTo(weak.pct);
    expect(vulnOf(s, side, 'physical')).toBe(0);
    expect(Object.keys(target.vulns)).toEqual([key]);
    expect(target.vulns[key]).toEqual({ pct: weak.pct, damageType: 'physical', ticks: toTicks(weak.seconds), stacks: 1 });
    expect(target.vulnCaster).toBeUndefined();

    target.vulns[key]!.ticks = 5;
    const second = placeUnitForTest(s, 'dunggumi', 2);
    second.item = 'weakCharm';
    performAttack(s, 2, target, []);
    expect(Object.keys(target.vulns)).toEqual([key]);
    expect(target.vulns[key]).toEqual({ pct: weak.pct, damageType: 'physical', ticks: toTicks(weak.seconds), stacks: 1 });

    placeUnitForTest(s, 'che', 3).item = 'weakCharm';
    performAttack(s, 3, target, []);
    expect(target.vulns['item:weakCharm:magical']).toMatchObject({ pct: weak.pct, damageType: 'magical', stacks: 1 });
    expect(target.vulns[key]).toBeDefined();
    expect(vulnOf(s, target, 'magical')).toBeCloseTo(weak.pct);

    target.vulns.other = { pct: s.data.balance.vulnCap, damageType: 'physical', ticks: 10 ** 6, stacks: 1 };
    expect(vulnOf(s, target, 'physical')).toBeCloseTo(s.data.balance.vulnCap);
    delete target.vulns.other;

    s.slots[slot] = null; s.slots[2] = null; s.slots[3] = null;
    target.vulns[key]!.ticks = toTicks(weak.seconds);
    for (let t = 1; t < toTicks(weak.seconds); t++) tickStatuses(s, []);
    expect(target.vulns[key]).toBeDefined();
    tickStatuses(s, []);
    expect(target.vulns[key]).toBeUndefined();
  });

  test('a killing hit leaves no weakening behind', () => {
    const s = quiet();
    const u = placeUnitForTest(s, 'eomang', 1);
    u.item = 'weakCharm';
    const target = spawnEnemyForTest(s, ENEMY, findD(s, d => away(s, 1, d) <= 1.5), 1);
    performAttack(s, 1, target, []);
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(target.vulns).toEqual({});
  });

  test('weakCharm does not arm kill explosions', () => {
    const duduri = d3.units.find(u => u.id === 'duduri')!;
    const boom = duduri.skills.find(sk => sk.effects.some(e => e.kind === 'onVulnKillExplode'))!;
    const data = makeData(d => {
      const base = d.units.find(u => u.id === 'duduri')!;
      d.units.push({ ...base, id: 'boomer', skills: [structuredClone(boom)] });
    }, 'stage3');

    const run = (defId: string) => {
      const s = quiet(data);
      placeUnitForTest(s, defId, 1).item = 'weakCharm';
      const at = findD(s, d => away(s, 1, d) <= 1.2);
      const target = enemy(s, at);
      const side = enemy(s, at + 0.3);
      performAttack(s, 1, target, []);
      const caster = target.vulnCaster;
      const keys = Object.keys(target.vulns);
      target.hp = 0;
      const events: GameEvent[] = [];
      resolveKills(s, events);
      const exploded = events.some(e => e.type === 'damage' && e.enemyId === side.id && e.effect === 'explosion');
      return { caster, keys, exploded };
    };

    const plain = run('boomer');
    expect(plain.keys).toEqual(['item:weakCharm:physical']);
    expect(plain.caster).toBeUndefined();
    expect(plain.exploded).toBe(false);

    const own = run('duduri');
    expect(own.keys).toContain('item:weakCharm:physical');
    expect(own.caster).toBeDefined();
    expect(own.caster!.key).not.toBe('item:weakCharm:physical');
    expect(own.exploded).toBe(true);
  });

  test('boards without items behave as before', () => {
    const s = createGame(d3, 4242);
    for (const id of ['indu', 'buk', 'meok', 'duduri', 'eomang', 'gat', 'mulle', 'maetdol']) {
      placeUnitForTest(s, id, chooseSlot(s, unitDefFast(d3, id))!);
    }
    const hashes: string[] = [];
    while (s.tick < 2000) {
      step(s, []);
      if (s.tick === 900 || s.tick === 2000) hashes.push(stateHash(s));
    }
    // taken from the same scenario on 6019eaa, before items had any effect
    expect(hashes).toEqual(['02b5573d', '40ffd42e']);
  });
});
