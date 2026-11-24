import { createGame, laneOf, loadGameData, type GameEvent, type GameState, type UnitDef } from '@dorandi/logic';
import { placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { describe, expect, test } from 'vitest';
import {
  FROST_ALPHA, FX_FLAGS, FxBudget, PRIORITY, REDUCE_FX_KEY, auraBuffedSlots, auraMarkedEnemies, enemyStatus, planEvents, planFromState,
  readReduceFx, shotStyle, slowLook, writeReduceFx, type FxCmd, type PlanCtx,
} from '../src/fx/plan';

const data = loadGameData('stage2');
const def = (id: string): UnitDef => data.units.find(u => u.id === id)!;

interface FakeEnemy { d: number; boss?: boolean; shared?: boolean; alive?: boolean; name?: string; prevD?: number }

function ctx(units: Record<number, string>, enemies: Record<number, FakeEnemy>, extra: Partial<PlanCtx> = {}): PlanCtx {
  return {
    unitDef: id => (units[id] ? def(units[id]!) : undefined),
    def: id => data.units.find(u => u.id === id),
    enemyDef: id => data.enemies.find(e => e.id === id),
    enemy: id => {
      const e = enemies[id];
      return e ? { d: e.d, boss: e.boss ?? false, shared: e.shared ?? false, alive: e.alive ?? true, name: e.name ?? '잡귀', prevD: e.prevD } : undefined;
    },
    pulseUnits: () => [],
    perimeter: 22,
    ...extra,
  };
}

const kinds = (cmds: FxCmd[]) => cmds.map(c => c.kind);

describe('shot style by grade and damage type', () => {
  test('a grade 1 melee physical unit swipes instead of shooting', () => {
    const s = shotStyle(def('sotlid'));
    expect(s.melee).toBe(true);
    expect(s.trail).toBe(false);
  });

  test('ranged physical and magical units shoot; grade 4 gets a trail and a bigger head', () => {
    const low = shotStyle(def('horong'));
    const high = shotStyle(def('ja'));
    expect(low.melee).toBe(false);
    expect(high.melee).toBe(false);
    expect(high.trail).toBe(true);
    expect(high.size).toBeGreaterThan(low.size);
    expect([low.grade, high.grade]).toEqual([def('horong').grade, 4]);
    expect(high.color).not.toBe(low.color);
  });

  test('physical and magical units of one grade differ in rim colour', () => {
    expect(shotStyle(def('dadeumi')).rim).not.toBe(shotStyle(def('horong')).rim);
  });
});

describe('planEvents', () => {
  test('grade 5 and 6 shots grow, and an observed grade 6 proc flashes only once at its caster', () => {
    const stage3 = loadGameData('stage3');
    const s = createGame(stage3, 1);
    const caster = placeUnitForTest(s, 'gamtudokkaebi', 0);
    const unit = (id: string) => stage3.units.find(u => u.id === id)!;
    expect(shotStyle(unit('top')).size).toBeGreaterThan(shotStyle(unit('ja')).size);
    expect(shotStyle(unit('gamtudokkaebi')).size).toBeGreaterThan(shotStyle(unit('top')).size);
    const context = planFromState(s, new Map());
    const attack = { type: 'attack', unitId: caster.id, enemyId: 10 } as const;
    const hit = { type: 'damage', source: 'gamtudokkaebi', enemyId: 10, amount: 100 } as const;
    expect(kinds(planEvents([attack, hit], context))).toEqual(['shot']);
    const crit = { ...hit, effect: 'crit' } as const;
    expect(planEvents([attack, crit, attack, crit], context).filter(cmd => cmd.kind === 'cast')).toEqual([
      expect.objectContaining({ unitId: caster.id, priority: PRIORITY.mid }),
    ]);
  });

  test('an attack becomes a low-priority shot', () => {
    const cmds = planEvents([{ type: 'attack', unitId: 1, enemyId: 10 }], ctx({ 1: 'horong' }, { 10: { d: 3 } }));
    expect(cmds).toEqual([expect.objectContaining({ kind: 'shot', unitId: 1, enemyId: 10, priority: PRIORITY.low })]);
  });

  test('splash: damage to other enemies after an attack draws one ring with the real radius', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'sokuri' },
      { type: 'damage', enemyId: 11, amount: 50, source: 'sokuri' },
      { type: 'damage', enemyId: 12, amount: 50, source: 'sokuri' },
    ];
    const cmds = planEvents(events, ctx({ 1: 'sokuri' }, { 10: { d: 3 }, 11: { d: 3.5 }, 12: { d: 2.5 } }));
    const rings = cmds.filter(c => c.kind === 'splash');
    expect(rings).toEqual([expect.objectContaining({ enemyId: 10, radius: 1.2, priority: PRIORITY.mid })]);
  });

  test('a single-target hit from a splash unit draws no ring', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'ki' },
    ];
    expect(kinds(planEvents(events, ctx({ 1: 'ki' }, { 10: { d: 3 } })))).toEqual(['shot']);
  });

  test('pierce: a line runs from the target through the enemies behind it, nearest first', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'baneul' },
      { type: 'damage', enemyId: 12, amount: 50, source: 'baneul' },
      { type: 'damage', enemyId: 11, amount: 50, source: 'baneul' },
    ];
    const cmds = planEvents(events, ctx({ 1: 'baneul' }, { 10: { d: 5 }, 11: { d: 4.5 }, 12: { d: 2.5 } }));
    expect(cmds.find(c => c.kind === 'pierce')).toEqual(expect.objectContaining({ enemyIds: [10, 11, 12], length: 3, priority: PRIORITY.mid }));
  });

  test('a critical hit becomes a crit burst on its target', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 120, source: 'hamjibak', effect: 'crit' },
    ];
    const cmds = planEvents(events, ctx({ 1: 'hamjibak' }, { 10: { d: 3 } }));
    expect(cmds.filter(c => c.kind === 'crit')).toEqual([expect.objectContaining({ enemyId: 10, priority: PRIORITY.mid })]);
  });

  test('execute and explosion hit effects become a slash and a ring at the killed enemy', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 90, source: 'onggigama' },
      { type: 'damage', enemyId: 11, amount: 40, source: 'onggigama', effect: 'explosion' },
      { type: 'damage', enemyId: 12, amount: 40, source: 'onggigama', effect: 'explosion' },
      { type: 'attack', unitId: 2, enemyId: 13 },
      { type: 'damage', enemyId: 13, amount: 40, source: 'bujigaengi', effect: 'execute' },
    ];
    const cmds = planEvents(events, ctx({ 1: 'onggigama', 2: 'bujigaengi' }, { 10: { d: 3, alive: false }, 11: { d: 3.4 }, 12: { d: 2.6 }, 13: { d: 7 } }));
    expect(cmds.filter(c => c.kind === 'explode')).toEqual([expect.objectContaining({ enemyId: 10, radius: 1.5 })]);
    expect(cmds.find(c => c.kind === 'slash')).toEqual(expect.objectContaining({ enemyId: 13 }));
  });

  test('stun and area slow procs: a bonk on the stunned enemy, a frost ring with the slow radius', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'gamasot' },
      { type: 'speedChange', enemyId: 10, d: 3, speed: 0 },
      { type: 'attack', unitId: 2, enemyId: 11 },
      { type: 'damage', enemyId: 11, amount: 50, source: 'meongseok' },
      { type: 'speedChange', enemyId: 11, d: 6, speed: 1.1 },
      { type: 'speedChange', enemyId: 12, d: 6.4, speed: 1.1 },
    ];
    const cmds = planEvents(events, ctx({ 1: 'gamasot', 2: 'meongseok' }, { 10: { d: 3 }, 11: { d: 6 }, 12: { d: 6.4 } }));
    expect(cmds.filter(c => c.kind === 'stunHit')).toEqual([expect.objectContaining({ enemyId: 10 })]);
    expect(cmds.filter(c => c.kind === 'frost')).toEqual([expect.objectContaining({ enemyId: 11, radius: 1.5 })]);
  });

  test('knockback: a speed change that moves the enemy back draws a streak from where it was', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'buchae' },
      { type: 'speedChange', enemyId: 10, d: 4, speed: 1.6 },
    ];
    const cmds = planEvents(events, ctx({ 1: 'buchae' }, { 10: { d: 4, prevD: 5 } }));
    expect(cmds.find(c => c.kind === 'knock')).toEqual(expect.objectContaining({ enemyId: 10, fromD: 5, toD: 4 }));
  });

  test('a speed change from a stun ending is not a knockback', () => {
    const cmds = planEvents([{ type: 'speedChange', enemyId: 10, d: 4, speed: 1.6 }], ctx({}, { 10: { d: 4, prevD: 3.98 } }));
    expect(cmds).toEqual([]);
  });

  test('periodic all-in-range damage pulses once per unit that holds the skill', () => {
    const events: GameEvent[] = [
      { type: 'damage', enemyId: 10, amount: 50, source: 'yeonjabangga' },
      { type: 'damage', enemyId: 11, amount: 50, source: 'yeonjabangga' },
      { type: 'damage', enemyId: 12, amount: 30, source: 'horong' },
    ];
    const cmds = planEvents(events, ctx({}, { 10: { d: 3 }, 11: { d: 4 }, 12: { d: 5 } }, {
      pulseUnits: (defId, enemyIds) => (defId === 'yeonjabangga' && enemyIds.length === 2 ? [5] : []),
    }));
    expect(cmds).toEqual([expect.objectContaining({ kind: 'pulse', unitId: 5, radius: 2, priority: PRIORITY.mid })]);
  });

  test('periodic damage from the same unit type after an attack still pulses (it has no splash)', () => {
    const events: GameEvent[] = [
      { type: 'attack', unitId: 1, enemyId: 10 },
      { type: 'damage', enemyId: 10, amount: 50, source: 'yeonjabangga' },
      { type: 'damage', enemyId: 11, amount: 50, source: 'yeonjabangga' },
    ];
    const cmds = planEvents(events, ctx({ 1: 'yeonjabangga' }, { 10: { d: 3 }, 11: { d: 4 } }, { pulseUnits: () => [2] }));
    expect(kinds(cmds)).toEqual(['shot', 'pulse']);
  });

  test('a grade 4 summon or combine is a high-priority moment with the unit name; lower grades are not', () => {
    const events: GameEvent[] = [
      { type: 'summon', unitId: 1, defId: 'sotlid', grade: 1, slot: 0 },
      { type: 'combine', replacedUnitId: 2, unitId: 3, defId: 'yeonjabangga', slot: 1 },
    ];
    const cmds = planEvents(events, ctx({ 1: 'sotlid', 3: 'yeonjabangga' }, {}));
    expect(cmds).toEqual([expect.objectContaining({ kind: 'bigUnit', unitId: 3, grade: 4, name: '연자방아', priority: PRIORITY.high, toast: true })]);
  });

  test('a grade 6 or hidden unit keeps its moment but leaves the toast to the birth banner', () => {
    const stage3 = loadGameData('stage3');
    const events: GameEvent[] = [
      { type: 'combine', replacedUnitId: 1, unitId: 2, defId: 'bihyeongrang', slot: 0 },
      { type: 'combine', replacedUnitId: 3, unitId: 4, defId: 'top', slot: 1 },
    ];
    const cmds = planEvents(events, ctx({ 2: 'bihyeongrang', 4: 'top' }, {}, { def: id => stage3.units.find(u => u.id === id) }));
    expect(cmds).toEqual([
      expect.objectContaining({ kind: 'bigUnit', unitId: 2, grade: 6, toast: false }),
      expect.objectContaining({ kind: 'bigUnit', unitId: 4, grade: 5, toast: true }),
    ]);
  });

  test('a lane boss spawn is a boss moment; the shared yeoksin and normal enemies are not', () => {
    const events: GameEvent[] = [
      { type: 'spawn', enemyId: 1, defId: 'japgwi' },
      { type: 'spawn', enemyId: 2, defId: 'jinegaksi' },
      { type: 'spawn', enemyId: -1, defId: 'yeoksin1' },
    ];
    const cmds = planEvents(events, ctx({}, { 1: { d: 0 }, 2: { d: 0, boss: true, name: '지네각시' }, [-1]: { d: 0, shared: true } }));
    expect(cmds).toEqual([expect.objectContaining({ kind: 'boss', enemyId: 2, name: '지네각시', priority: PRIORITY.high })]);
  });
});

describe('statuses from state', () => {
  function game(): GameState {
    const s = createGame(loadGameData(), 1);
    s.open = s.open.map(() => true);
    return s;
  }

  test('enemyStatus reads stun, slow and damage-taken marks', () => {
    const s = game();
    const e = spawnEnemyForTest(s, 'japgwi', 3);
    expect(enemyStatus(e, false)).toEqual({ stunned: false, slowed: false, marked: false });
    e.stunTicks = 4;
    e.slow = { pct: 0.3, ticks: 10 };
    e.vulns.dadeumi = { pct: 0.15, damageType: 'physical', ticks: 5, stacks: 1 };
    expect(enemyStatus(e, false)).toEqual({ stunned: true, slowed: true, marked: true });
    expect(enemyStatus({ ...e, stunTicks: 0, slow: null, vulns: {} }, true).marked).toBe(true);
  });

  test('the yeoksin never shows crowd control (it is immune)', () => {
    const s = game();
    const e = spawnEnemyForTest(s, 'japgwi', 3);
    e.stunTicks = 1;
    expect(enemyStatus(e, false, true)).toEqual({ stunned: false, slowed: false, marked: false });
  });

  test('aura buffed slots are the neighbours of an aura unit within the aura radius, not the unit itself', () => {
    const s = game();
    placeUnitForTest(s, 'cheongsachorong', 7);
    placeUnitForTest(s, 'sotlid', 8);
    placeUnitForTest(s, 'sotlid', 23);
    const buffed = auraBuffedSlots(s);
    expect(buffed.has(8)).toBe(true);
    expect(buffed.has(7)).toBe(false);
    expect(buffed.has(23)).toBe(false);
  });

  test('an enemy-vuln aura marks the enemies in that unit range', () => {
    const s = game();
    placeUnitForTest(s, 'jangdok', 0);
    const lane = laneOf(s);
    const near = spawnEnemyForTest(s, 'japgwi', 0.5);
    const far = spawnEnemyForTest(s, 'japgwi', lane.perimeter / 2);
    const marked = auraMarkedEnemies(s);
    expect(marked.has(near.id)).toBe(true);
    expect(marked.has(far.id)).toBe(false);
  });

  test('planFromState builds a context from the lane so real events plan', () => {
    const s = game();
    const u = placeUnitForTest(s, 'horong', 0);
    const e = spawnEnemyForTest(s, 'japgwi', 1);
    const cmds = planEvents([{ type: 'attack', unitId: u.id, enemyId: e.id }], planFromState(s, new Map()));
    expect(kinds(cmds)).toEqual(['shot']);
  });
});

describe('budget', () => {
  test('low-priority effects stop first, high-priority ones always pass', () => {
    const b = new FxBudget();
    let low = 0;
    for (let i = 0; i < 500; i++) if (b.admit(PRIORITY.low)) low++;
    expect(low).toBe(FxBudget.CAPS.normal[PRIORITY.low]);
    expect(b.admit(PRIORITY.mid)).toBe(true);
    for (let i = 0; i < 500; i++) b.admit(PRIORITY.mid);
    expect(b.active).toBe(FxBudget.CAPS.normal[PRIORITY.mid]);
    expect(b.admit(PRIORITY.high)).toBe(true);
  });

  test('releasing frees room again and never goes below zero', () => {
    const b = new FxBudget();
    const cap = FxBudget.CAPS.normal[PRIORITY.low];
    for (let i = 0; i < cap; i++) b.admit(PRIORITY.low);
    expect(b.admit(PRIORITY.low)).toBe(false);
    b.release();
    expect(b.admit(PRIORITY.low)).toBe(true);
    for (let i = 0; i < cap * 3; i++) b.release();
    expect(b.active).toBe(0);
  });

  test('reduced mode has much smaller caps for low and mid effects', () => {
    const b = new FxBudget();
    b.reduced = true;
    let n = 0;
    for (let i = 0; i < 500; i++) if (b.admit(PRIORITY.low)) n++;
    expect(n).toBe(FxBudget.CAPS.reduced[PRIORITY.low]);
    expect(FxBudget.CAPS.reduced[PRIORITY.mid]).toBeLessThan(FxBudget.CAPS.normal[PRIORITY.mid]);
  });

  test('reduced mode drops shake, edge glow, trails, mist and the frost cover but keeps status marks', () => {
    expect(FX_FLAGS(false)).toEqual({ shake: true, edgeGlow: true, trails: true, mist: true, statuses: true, rays: true, frost: true });
    expect(FX_FLAGS(true)).toEqual({ shake: false, edgeGlow: false, trails: false, mist: false, statuses: true, rays: false, frost: false });
  });

  test('a slowed enemy keeps its blue body tint; the frost cover is a see-through extra', () => {
    expect(slowLook(true, FX_FLAGS(false))).toEqual({ tint: true, frost: true });
    expect(slowLook(true, FX_FLAGS(true))).toEqual({ tint: true, frost: false });
    expect(slowLook(false, FX_FLAGS(false))).toEqual({ tint: false, frost: false });
    // faint: a column of slowed enemies must not turn into a wall of ice
    expect(FROST_ALPHA).toBeGreaterThan(0);
    expect(FROST_ALPHA).toBeLessThanOrEqual(0.6);
  });
});

describe('reduce-effects toggle storage', () => {
  function memory(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k),
      clear: () => m.clear(), key: () => null, get length() { return m.size; },
    };
  }

  test('round trips through storage under one key', () => {
    const s = memory();
    expect(readReduceFx(s)).toBe(false);
    writeReduceFx(true, s);
    expect(s.getItem(REDUCE_FX_KEY)).toBe('1');
    expect(readReduceFx(s)).toBe(true);
    writeReduceFx(false, s);
    expect(readReduceFx(s)).toBe(false);
  });

  test('storage that throws reads as off and writes do not throw', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(readReduceFx(broken)).toBe(false);
    expect(() => writeReduceFx(true, broken)).not.toThrow();
    expect(readReduceFx(undefined)).toBe(false);
  });
});
