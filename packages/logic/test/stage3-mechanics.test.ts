import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, step, type Enemy, type GameData, type GameEvent, type GameState, type StepResult } from '../src/index';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const G6 = 1188.1376;
const quietOf = (data: GameData) => { const s = createGame(data, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 10 ** 9; s.enemies = []; return s; };
const quiet3 = (data: GameData = d3) => quietOf(data);
type Dmg = Extract<GameEvent, { type: 'damage' }>;
const dmgs = (r: StepResult) => r.events.filter((e): e is Dmg => e.type === 'damage');
const dmg = (r: StepResult, id: number) => dmgs(r).filter(e => e.enemyId === id).map(e => e.amount);
/** The primary hit of every basic attack the unit made in this step. */
const basicHits = (r: StepResult, unitId: number): Dmg[] => {
  const out: Dmg[] = [];
  r.events.forEach((e, i) => {
    if (e.type !== 'attack' || e.unitId !== unitId) return;
    const next = r.events.slice(i + 1).find((x): x is Dmg => x.type === 'damage');
    if (next) out.push(next);
  });
  return out;
};
const pinnedAt = new WeakMap<Enemy, number>();
/** Steps while pinning the listed enemies where they were first pinned, collecting every result. */
const run = (s: GameState, ticks: number, pin: Enemy[] = []): StepResult[] => {
  const out: StepResult[] = [];
  for (const e of pin) if (!pinnedAt.has(e)) pinnedAt.set(e, e.d);
  for (let i = 0; i < ticks; i++) { for (const e of pin) e.d = pinnedAt.get(e)!; out.push(step(s, [])); }
  return out;
};

describe('stage 3 hit packages and target mechanics', () => {
  test('strike adds raw extra damage to the target (gaetgilbul 1023 + 409)', () => {
    const s = quiet3(); placeUnitForTest(s, 'gaetgilbuldokkaebi', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e7);
    expect(dmg(step(s, []), t.id)).toEqual([1023, 409]);
  });

  test('periodic strike waits for the first target, then fires on entry (gildal)', () => {
    const s = quiet3(); placeUnitForTest(s, 'gildal', 2);
    run(s, 100);
    const e = spawnEnemyForTest(s, 'japgwi', 3, 1e7);
    const strike = Math.round(G6 * 0.85 * 0.97 * 1.55);
    const isStrike = (x: Dmg) => x.source === 'gildal' && x.amount === strike;
    const first = run(s, 1, [e]);
    expect(dmgs(first[0]!).some(isStrike)).toBe(true);
    const next = run(s, 60, [e]).map(r => dmgs(r).some(isStrike));
    expect(next.indexOf(true)).toBe(59);
    expect(next.filter(Boolean).length).toBe(1);
  });

  test('chain bounces within 1 tile, each enemy once (bitdon)', () => {
    const s = quiet3(); placeUnitForTest(s, 'bitdondokkaebi', 2);
    const es = [3, 3.8, 4.6, 6.0].map(d => spawnEnemyForTest(s, 'japgwi', d, 1e7));
    const r = step(s, []);
    const bounce = Math.round(G6 * 0.89 * 1.8);
    expect(es.map(e => dmg(r, e.id).filter(a => a === bounce).length)).toEqual([0, 1, 1, 0]);
    expect(dmg(r, es[0]!.id)).toContain(Math.round(G6 * 0.89 * 2.35));
  });

  test('charge: first charged hit after 80 ticks; move keeps it, sell resets', () => {
    const s = quiet3(); const u = placeUnitForTest(s, 'gamtudokkaebi', 2);
    expect([u.chargeTicks, u.charged]).toEqual([80, undefined]);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const early = run(s, 80, [t]).flatMap(r => basicHits(r, u.id));
    expect(early.length).toBeGreaterThan(0);
    expect(early.every(h => h.effect === undefined)).toBe(true);
    expect(u.charged).toBe(true);
    step(s, [{ type: 'move', from: 2, to: 3 }]);
    expect(s.slots[3]).toBe(u);
    expect(u.charged).toBe(true);
    let firstAfter: Dmg | undefined;
    for (let i = 0; i < 40 && !firstAfter; i++) firstAfter = basicHits(run(s, 1, [t])[0]!, u.id)[0];
    expect(firstAfter?.effect).toBe('crit');
    expect(t.stunTicks).toBeGreaterThan(0);
    expect([u.charged, u.chargeTicks! > 70]).toEqual([false, true]);
    step(s, [{ type: 'sell', slot: 3 }]);
    const v = placeUnitForTest(s, 'gamtudokkaebi', 3);
    expect([v.chargeTicks, v.charged]).toEqual([80, undefined]);
  });

  test('streak: oedari crits on 3rd and 6th consecutive hit, resets on target change', () => {
    const s = quiet3(); const u = placeUnitForTest(s, 'oedaridokkaebi', 2);
    const a = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const hitsA: Dmg[] = [];
    for (let i = 0; i < 200 && hitsA.length < 6; i++) hitsA.push(...basicHits(run(s, 1, [a])[0]!, u.id));
    expect(hitsA.map(h => h.effect === 'crit')).toEqual([false, false, true, false, false, true]);
    const hitsMixed: Dmg[] = [];
    for (let i = 0; i < 200 && hitsMixed.length < 2; i++) hitsMixed.push(...basicHits(run(s, 1, [a])[0]!, u.id));
    s.enemies = s.enemies.filter(e => e !== a);
    const b = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const hitsB: Dmg[] = [];
    for (let i = 0; i < 200 && hitsB.length < 3; i++) hitsB.push(...basicHits(run(s, 1, [b])[0]!, u.id));
    expect(hitsMixed.map(h => h.effect === 'crit')).toEqual([false, false]);
    expect(hitsB.map(h => h.effect === 'crit')).toEqual([false, false, true]);
  });

  test('rampCrit: yeonjeok basic hits 1428, 1642, 1856, 2070, 2070', () => {
    const s = quiet3(); const u = placeUnitForTest(s, 'cheonnyeonyeonjeok', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const hits: number[] = [];
    for (let i = 0; i < 300 && hits.length < 5; i++) hits.push(...basicHits(run(s, 1, [t])[0]!, u.id).map(h => h.amount));
    expect(hits).toEqual([1428, 1642, 1856, 2070, 2070]);
  });

  test('targetHpBelow and targetSlowed', () => {
    for (const [hp, crit] of [[6e5, false], [5e5, true]] as const) {
      const s = quiet3(); const u = placeUnitForTest(s, 'cheonnyeonmunbitjang', 2);
      const t = spawnEnemyForTest(s, 'japgwi', 3, 1e6); t.hp = hp;
      const h = basicHits(step(s, []), u.id)[0]!;
      expect([h.effect === 'crit', t.slow?.pct ?? null]).toEqual([crit, crit ? 0.3 : null]);
    }
    const s = quiet3(); const u = placeUnitForTest(s, 'cheonnyeontteokpan', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const hits: Dmg[] = [];
    for (let i = 0; i < 100 && hits.length < 2; i++) hits.push(...basicHits(run(s, 1, [t])[0]!, u.id));
    expect(hits.map(h => h.effect === 'crit')).toEqual([false, true]);
  });

  test('radiusCycle: sangmo band reaches an enemy 1.2 away only on attacks 3 and 4', () => {
    const s = quiet3(); const u = placeUnitForTest(s, 'cheonnyeonsangmo', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8); const o = spawnEnemyForTest(s, 'japgwi', 4.2, 1e8);
    const perAttack: boolean[] = [];
    for (let i = 0; i < 200 && perAttack.length < 4; i++) {
      const r = run(s, 1, [t, o])[0]!;
      if (basicHits(r, u.id).length) perAttack.push(dmg(r, o.id).length > 0);
    }
    expect(perAttack).toEqual([false, false, true, true]);
  });

  test('pierce both and knocked bonus', () => {
    const s = quiet3(); placeUnitForTest(s, 'gildal', 2);
    const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8);
    const ahead = spawnEnemyForTest(s, 'japgwi', 4, 1e8); const behind = spawnEnemyForTest(s, 'japgwi', 2, 1e8); const far = spawnEnemyForTest(s, 'japgwi', 5, 1e8);
    const r = step(s, []);
    const p = Math.round(G6 * 0.85 * 0.97 * 1.25);
    expect([dmg(r, ahead.id), dmg(r, behind.id), dmg(r, far.id), dmg(r, t.id).length > 0]).toEqual([[p], [p], [], true]);

    const k = quiet3(); placeUnitForTest(k, 'cheonnyeondot', 2);
    spawnEnemyForTest(k, 'japgwi', 3, 1e8);
    const knocked = spawnEnemyForTest(k, 'japgwi', 2, 1e8); knocked.knockedRound = k.round;
    const plain = spawnEnemyForTest(k, 'japgwi', 1.5, 1e8);
    const kr = step(k, []);
    const base = G6 * 1.3 * 0.82 * 0.6;
    expect([dmg(kr, knocked.id), dmg(kr, plain.id)]).toEqual([[Math.round(base * 1.8)], [Math.round(base)]]);
  });

  test('stunnedBonus window E..E+19 (yogang)', () => {
    const splash = G6 * 1.1 * 0.89 * 1.85;
    for (const [setup, bonus] of [
      [(e: Enemy) => { e.stunTicks = 100; }, true],
      [(e: Enemy, s: GameState) => { e.stunEndTick = s.tick - 19; }, true],
      [(e: Enemy, s: GameState) => { e.stunEndTick = s.tick - 20; }, false],
    ] as const) {
      const s = quiet3(); placeUnitForTest(s, 'cheonnyeonyogang', 2);
      const t = spawnEnemyForTest(s, 'japgwi', 3, 1e8); const n = spawnEnemyForTest(s, 'japgwi', 3.8, 1e8);
      setup(t, s);
      const r = step(s, []);
      expect(dmg(r, n.id)[0]).toBe(Math.round(splash * (bonus ? 1.5 : 1)));
    }
  });

  test('requireExecute: tteoksal explodes only on an execute kill', () => {
    for (const [hp, boom] of [[1, true], [60, false]] as const) {
      const s = quiet3(); placeUnitForTest(s, 'cheonnyeontteoksal', 2);
      const t = spawnEnemyForTest(s, 'japgwi', 3, 100); t.hp = hp;
      const n = spawnEnemyForTest(s, 'japgwi', 3.8, 1e8);
      const r = step(s, []);
      expect(t.hp <= 0).toBe(true);
      expect(dmgs(r).some(e => e.enemyId === n.id && e.effect === 'explosion')).toBe(boom);
    }
  });

  test('stunEndTick is recorded in stage 3 when a stun ends', () => {
    const s = quiet3(); const e = spawnEnemyForTest(s, 'japgwi', 3, 1e6); e.stunTicks = 2;
    step(s, []); step(s, []);
    expect([e.stunTicks, e.stunEndTick]).toEqual([0, 1]);
  });

  test('stage 1 enemies never get stunEndTick or knockedRound', () => {
    const d1 = makeData(d => { for (const u of d.units) if (u.id === 'sotlid' || u.id === 'buchae') u.skills[0]!.trigger = { kind: 'chance', p: 1 }; });
    const s = quietOf(d1); placeUnitForTest(s, 'sotlid', 2); placeUnitForTest(s, 'buchae', 7);
    spawnEnemyForTest(s, 'japgwi', 3, 1e8); spawnEnemyForTest(s, 'japgwi', 3.5, 1e8);
    let stunned = false; let pushed = false;
    for (let i = 0; i < 40; i++) {
      const r = step(s, []);
      if (s.enemies.some(e => e.stunTicks > 0)) stunned = true;
      if (r.events.some(e => e.type === 'speedChange')) pushed = true;
    }
    expect([stunned, pushed]).toEqual([true, true]);
    expect(s.enemies.every(e => !('stunEndTick' in e) && !('knockedRound' in e))).toBe(true);
  });
});
