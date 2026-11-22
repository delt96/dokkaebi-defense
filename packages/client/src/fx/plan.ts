import { cellDistance, dist, laneOf, loopPos, unitDefFast, type Effect, type Enemy, type EnemyDef, type GameEvent, type GameState, type UnitDef } from '@dorandi/logic';

/**
 * What to show for game events and state, with no Phaser in it: the effect layer draws what this
 * decides. Every effect is derived from events the logic already emits and from lane state.
 */

export const PRIORITY = { low: 0, mid: 1, high: 2 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

const GRADE_HEX: Record<number, number> = { 1: 0x4f9dff, 2: 0x4fd27a, 3: 0xb07aff, 4: 0xffb347, 5: 0xff694e, 6: 0xffe35a };
export const gradeHex = (grade: number): number => GRADE_HEX[grade] ?? 0xffffff;
/** Rim colour by damage type (the data has no element, so the damage type stands in for one). */
const RIM = { physical: 0xfff1d6, magical: 0x9fe8ff } as const;
/** Units at this range or closer that deal physical damage hit in melee. */
const MELEE_RANGE = 1.5;
/** Grades at or above this get a summon moment and a trail on their shots. */
export const BIG_GRADE = 4;
/** A speed change that moves an enemy back by more than this many cells is a knockback. */
const KNOCK_MIN = 0.2;

export interface ShotStyle { melee: boolean; color: number; rim: number; size: number; trail: boolean; magical: boolean; grade: number }

export function shotStyle(def: UnitDef): ShotStyle {
  const magical = def.damageType === 'magical';
  return {
    melee: !magical && def.range <= MELEE_RANGE,
    color: gradeHex(def.grade),
    rim: RIM[def.damageType],
    size: def.grade >= 5 ? def.grade - 1 : def.grade >= BIG_GRADE ? 3 : def.grade >= 3 ? 2.5 : 2,
    trail: def.grade >= BIG_GRADE,
    magical,
    grade: def.grade,
  };
}

export type FxCmd =
  | { kind: 'shot'; unitId: number; enemyId: number; style: ShotStyle; priority: Priority }
  | { kind: 'splash'; enemyId: number; radius: number; color: number; priority: Priority }
  | { kind: 'frost'; enemyId: number; radius: number; priority: Priority }
  | { kind: 'pierce'; enemyIds: number[]; length: number; color: number; priority: Priority }
  | { kind: 'slash'; enemyId: number; priority: Priority }
  | { kind: 'crit'; enemyId: number; priority: Priority }
  | { kind: 'explode'; enemyId: number; radius: number; priority: Priority }
  | { kind: 'stunHit'; enemyId: number; priority: Priority }
  | { kind: 'knock'; enemyId: number; fromD: number; toD: number; priority: Priority }
  | { kind: 'pulse'; unitId: number; radius: number; color: number; priority: Priority }
  | { kind: 'cast'; unitId: number; color: number; priority: Priority }
  | { kind: 'bigUnit'; unitId: number; grade: number; name: string; priority: Priority }
  | { kind: 'boss'; enemyId: number; name: string; priority: Priority };

export interface PlanEnemy { d: number; boss: boolean; shared: boolean; alive: boolean; name: string; prevD?: number }

export interface PlanCtx {
  /** Definition of a unit on the board, by unit id. */
  unitDef(unitId: number): UnitDef | undefined;
  def(defId: string): UnitDef | undefined;
  enemyDef(defId: string): EnemyDef | undefined;
  /** Enemy as drawn: `alive` is false once it left the state (killed this batch); `prevD` is where it was last frame. */
  enemy(enemyId: number): PlanEnemy | undefined;
  /** Units holding `defId` whose range reaches one of these enemies (who fired a periodic pulse). */
  pulseUnits(defId: string, enemyIds: number[]): number[];
  perimeter: number;
}

const effectsOf = (def: UnitDef): Effect[] => def.skills.flatMap(s => s.effects);
function maxOf<K extends Effect['kind']>(def: UnitDef, kind: K, pick: (e: Extract<Effect, { kind: K }>) => number): number {
  let v = 0;
  for (const e of effectsOf(def)) if (e.kind === kind) v = Math.max(v, pick(e as Extract<Effect, { kind: K }>));
  return v;
}
const hasPeriodic = (def: UnitDef): boolean => def.skills.some(s => s.trigger.kind === 'periodic' && s.effects.some(e => e.kind === 'allInRange'));
const visibleSkill = (kind: Effect['kind']): boolean =>
  kind !== 'execute' && kind !== 'onKillExplode' && kind !== 'onVulnKillExplode' && kind !== 'coinOnFirstHit' && kind !== 'coinTimer';
const castOnAttack = (def: UnitDef): boolean => def.skills.some(s => s.trigger.kind === 'always' && s.effects.some(e => visibleSkill(e.kind)));

interface AttackCtx {
  unitId: number; def: UnitDef; target: number;
  others: number[]; exploded: boolean; frost: boolean; stunned: Set<number>; hits: number; cast: boolean;
}

export function planEvents(events: readonly GameEvent[], ctx: PlanCtx): FxCmd[] {
  const out: FxCmd[] = [];
  let cur: AttackCtx | null = null;
  /** defId -> enemies its periodic skill may have hit this batch. */
  const periodic = new Map<string, number[]>();
  const detachedCasts = new Map<string, Set<number>>();
  const flashed = new Set<number>();
  const cast = (unitId: number, def: UnitDef) => {
    if (def.grade < 6 || flashed.has(unitId)) return;
    flashed.add(unitId);
    out.push({ kind: 'cast', unitId, color: gradeHex(def.grade), priority: PRIORITY.mid });
  };

  const close = () => {
    if (!cur) return;
    const { def, target, others } = cur;
    if (cur.cast) cast(cur.unitId, def);
    if (others.length) {
      const splash = maxOf(def, 'splash', e => e.radius);
      const pierce = maxOf(def, 'pierce', e => e.length);
      if (splash > 0) out.push({ kind: 'splash', enemyId: target, radius: splash, color: shotStyle(def).color, priority: PRIORITY.mid });
      else if (pierce > 0) {
        const t = ctx.enemy(target);
        const behind = others
          .map(id => ({ id, gap: t ? loopPos(t.d - (ctx.enemy(id)?.d ?? t.d), ctx.perimeter) : Infinity }))
          .filter(x => x.gap > 1e-9 && x.gap <= pierce + 1e-6)
          .sort((a, b) => a.gap - b.gap);
        if (behind.length) out.push({ kind: 'pierce', enemyIds: [target, ...behind.map(x => x.id)], length: pierce, color: shotStyle(def).rim, priority: PRIORITY.mid });
      } else if (hasPeriodic(def)) {
        const list = periodic.get(def.id) ?? [];
        list.push(...others);
        periodic.set(def.id, list);
      }
    }
    cur = null;
  };

  for (const e of events) {
    switch (e.type) {
      case 'attack': {
        close();
        const def = ctx.unitDef(e.unitId);
        if (!def) break;
        out.push({ kind: 'shot', unitId: e.unitId, enemyId: e.enemyId, style: shotStyle(def), priority: PRIORITY.low });
        cur = { unitId: e.unitId, def, target: e.enemyId, others: [], exploded: false, frost: false, stunned: new Set(), hits: 0, cast: def.grade >= 6 && castOnAttack(def) };
        break;
      }
      case 'damage': {
        if (cur && e.source === cur.def.id) {
          cur.hits++;
          if (e.effect || (!cur.def.onBasicHit && cur.hits > 1)) cur.cast = true;
          if (e.effect === 'execute') out.push({ kind: 'slash', enemyId: e.enemyId, priority: PRIORITY.mid });
          if (e.effect === 'crit') out.push({ kind: 'crit', enemyId: e.enemyId, priority: PRIORITY.mid });
          if (e.effect === 'explosion') {
            if (!cur.exploded) {
              cur.exploded = true;
              // the blast starts where an enemy of this attack died; the main target is the usual one
              const at = [cur.target, ...cur.others].find(id => ctx.enemy(id)?.alive === false) ?? cur.target;
              out.push({ kind: 'explode', enemyId: at, radius: maxOf(cur.def, 'onKillExplode', x => x.radius), priority: PRIORITY.mid });
            }
          } else if (e.enemyId !== cur.target && !cur.others.includes(e.enemyId)) cur.others.push(e.enemyId);
          break;
        }
        close();
        const def = ctx.def(e.source);
        // Detached damage can identify a periodic or neighbor proc by its source definition.
        if (def?.grade === 6 && def.skills.some(s =>
          (s.trigger.kind === 'periodic' || s.trigger.kind === 'neighborHits') &&
          s.effects.some(effect => effect.kind === 'strike' || effect.kind === 'allInRange' || effect.kind === 'pierce'))) {
          const ids = detachedCasts.get(def.id) ?? new Set<number>();
          ids.add(e.enemyId);
          detachedCasts.set(def.id, ids);
        }
        if (def && hasPeriodic(def)) {
          const list = periodic.get(def.id) ?? [];
          list.push(e.enemyId);
          periodic.set(def.id, list);
        }
        break;
      }
      case 'speedChange': {
        const enemy = ctx.enemy(e.enemyId);
        if (enemy?.prevD !== undefined && enemy.prevD - e.d > KNOCK_MIN) {
          out.push({ kind: 'knock', enemyId: e.enemyId, fromD: enemy.prevD, toD: e.d, priority: PRIORITY.mid });
        }
        if (!cur) break;
        if (enemy?.prevD !== undefined && enemy.prevD - e.d > KNOCK_MIN && maxOf(cur.def, 'knockback', x => x.distance) > 0) cur.cast = true;
        if (e.speed === 0 && maxOf(cur.def, 'stun', x => x.seconds) > 0 && !cur.stunned.has(e.enemyId)) {
          cur.cast = true;
          cur.stunned.add(e.enemyId);
          out.push({ kind: 'stunHit', enemyId: e.enemyId, priority: PRIORITY.mid });
        }
        const slowRadius = maxOf(cur.def, 'slow', x => x.radius ?? 0);
        if (e.speed > 0 && slowRadius > 0 && !cur.frost) {
          cur.cast = true;
          cur.frost = true;
          out.push({ kind: 'frost', enemyId: cur.target, radius: slowRadius, priority: PRIORITY.mid });
        }
        break;
      }
      case 'summon':
      case 'combine': {
        close();
        const def = ctx.def(e.defId);
        if (def && def.grade >= BIG_GRADE) out.push({ kind: 'bigUnit', unitId: e.unitId, grade: def.grade, name: def.name, priority: PRIORITY.high });
        break;
      }
      case 'spawn': {
        close();
        const def = ctx.enemyDef(e.defId);
        if (def?.boss && !def.shared) out.push({ kind: 'boss', enemyId: e.enemyId, name: def.name, priority: PRIORITY.high });
        break;
      }
      default:
        close();
    }
  }
  close();
  for (const [defId, enemyIds] of periodic) {
    const def = ctx.def(defId)!;
    for (const unitId of ctx.pulseUnits(defId, enemyIds)) {
      out.push({ kind: 'pulse', unitId, radius: def.range, color: gradeHex(def.grade), priority: PRIORITY.mid });
    }
  }
  for (const [defId, ids] of detachedCasts) {
    const def = ctx.def(defId)!;
    const units = ctx.pulseUnits(defId, [...ids]);
    if (units.length === 1) cast(units[0]!, def);
  }
  return out;
}

/** A plan context read from the lane state; `prevD` holds each enemy's distance as drawn last frame. */
export function planFromState(state: GameState, prevD: ReadonlyMap<number, number>, gone: ReadonlyMap<number, number> = new Map()): PlanCtx {
  const lane = laneOf(state);
  const byId = new Map(state.enemies.map(e => [e.id, e]));
  const names = new Map(state.data.enemies.map(e => [e.id, e]));
  return {
    unitDef: id => {
      const u = state.slots.find(s => s?.id === id);
      return u ? unitDefFast(state.data, u.defId) : undefined;
    },
    def: id => state.data.units.find(u => u.id === id),
    enemyDef: id => names.get(id),
    enemy: id => {
      const e = byId.get(id);
      if (!e) {
        const d = gone.get(id);
        return d === undefined ? undefined : { d, boss: false, shared: false, alive: false, name: '', prevD: prevD.get(id) };
      }
      const def = names.get(e.defId);
      return { d: e.d, boss: e.boss, shared: def?.shared ?? false, alive: true, name: def?.name ?? '', prevD: prevD.get(id) };
    },
    pulseUnits: (defId, enemyIds) => {
      const def = state.data.units.find(u => u.id === defId);
      if (!def) return [];
      const points = enemyIds.map(id => byId.get(id)).filter((e): e is Enemy => !!e).map(e => lane.pointAt(e.d));
      const out: number[] = [];
      state.slots.forEach((u, slot) => {
        if (u?.defId !== defId) return;
        const cell = lane.cells[slot]!;
        if (!points.length || points.some(p => dist(cell, p) <= def.range + 1e-9)) out.push(u.id);
      });
      return out;
    },
    perimeter: lane.perimeter,
  };
}

export interface EnemyStatus { stunned: boolean; slowed: boolean; marked: boolean }

export function enemyStatus(e: Pick<Enemy, 'stunTicks' | 'slow' | 'vulns'>, auraMarked: boolean, shared = false): EnemyStatus {
  if (shared) return { stunned: false, slowed: false, marked: false };
  let marked = auraMarked;
  if (!marked) for (const _ in e.vulns) { marked = true; break; }
  return { stunned: e.stunTicks > 0, slowed: !!e.slow && e.slow.pct > 0, marked };
}

const auraEffects = (def: UnitDef): Effect[] => def.skills.filter(s => s.trigger.kind === 'aura').flatMap(s => s.effects);

/** Slots whose unit gets an ally aura (attack speed or attack power) from another unit within the aura radius. */
export function auraBuffedSlots(state: GameState): Set<number> {
  const lane = laneOf(state);
  const radius = state.data.balance.auraRadius;
  const out = new Set<number>();
  state.slots.forEach((u, src) => {
    if (!u) return;
    const def = unitDefFast(state.data, u.defId);
    const auras = auraEffects(def).filter(e => e.kind === 'auraAttackSpeed' || e.kind === 'auraAttackPower');
    if (!auras.length) return;
    state.slots.forEach((v, slot) => {
      if (!v || slot === src || out.has(slot)) return;
      if (cellDistance(lane, src, slot) > radius + 1e-9) return;
      const type = unitDefFast(state.data, v.defId).damageType;
      if (auras.some(e => e.kind === 'auraAttackSpeed' || (e.kind === 'auraAttackPower' && (e.damageType === 'all' || e.damageType === type)))) out.add(slot);
    });
  });
  return out;
}

/** Enemies inside the range of a unit with an enemy damage-taken aura. */
export function auraMarkedEnemies(state: GameState): Set<number> {
  const out = new Set<number>();
  const lane = laneOf(state);
  state.slots.forEach((u, slot) => {
    if (!u) return;
    const def = unitDefFast(state.data, u.defId);
    if (!auraEffects(def).some(e => e.kind === 'auraEnemyVuln')) return;
    const cell = lane.cells[slot]!;
    for (const e of state.enemies) if (!out.has(e.id) && dist(cell, lane.pointAt(e.d)) <= def.range + 1e-9) out.add(e.id);
  });
  return out;
}

/**
 * How many transient effects may be running when one of each priority starts. Above the low cap
 * plain shots are dropped, above the mid cap skill procs too; moments always play.
 */
export class FxBudget {
  static readonly CAPS = {
    normal: [48, 90, Number.POSITIVE_INFINITY] as const,
    reduced: [10, 28, Number.POSITIVE_INFINITY] as const,
  };
  active = 0;
  reduced = false;

  admit(priority: Priority): boolean {
    const cap = (this.reduced ? FxBudget.CAPS.reduced : FxBudget.CAPS.normal)[priority];
    if (this.active >= cap) return false;
    this.active++;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

export interface FxFlags { shake: boolean; edgeGlow: boolean; trails: boolean; mist: boolean; statuses: boolean; rays: boolean; frost: boolean }

/**
 * What 'reduce effects' turns off. Status marks stay: they tell the player what the enemy is doing.
 * A slow still shows as the blue body tint; only the animated frost cover goes.
 */
export function FX_FLAGS(reduced: boolean): FxFlags {
  return { shake: !reduced, edgeGlow: !reduced, trails: !reduced, mist: !reduced, statuses: true, rays: !reduced, frost: !reduced };
}

/** The frost cover (rim, snow, icicles, frost underfoot) is kept faint so a crowd of slowed enemies stays calm. */
export const FROST_ALPHA = 0.6;

/** How a slowed enemy is drawn: always the blue body tint, plus the see-through frost cover when effects allow it. */
export function slowLook(slowed: boolean, flags: FxFlags): { tint: boolean; frost: boolean } {
  return { tint: slowed, frost: slowed && flags.frost };
}

export const REDUCE_FX_KEY = 'dorandi.reduceFx';

function defaultStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readReduceFx(storage: Storage | undefined = defaultStorage()): boolean {
  try { return storage?.getItem(REDUCE_FX_KEY) === '1'; } catch { return false; }
}

export function writeReduceFx(on: boolean, storage: Storage | undefined = defaultStorage()): void {
  try { storage?.setItem(REDUCE_FX_KEY, on ? '1' : '0'); } catch { /* private window or blocked storage: the toggle lasts for this page only */ }
}
