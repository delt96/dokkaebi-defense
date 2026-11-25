import {
  dist, laneOf, unitAttack, unitDefFast, type Command, type DamageType, type GameState, type UnitDef,
} from '@dorandi/logic';
import { remainingValue } from './econBot';

/** The least shred on the main type a grade 5 or 6 unit needs to count as the board's shred support. */
const SUPPORT_SHRED = 0.15;
const PATH_SAMPLES = 96;

/** The weakening a unit puts on `type`: its vulns (with stacks) and enemy auras that apply to that damage type. */
export function shredFor(def: UnitDef, type: DamageType): number {
  let v = 0;
  for (const s of def.skills) {
    for (const e of s.effects) {
      if (e.kind === 'vuln' && (e.damageType === type || e.damageType === 'all')) v += e.pct * (e.maxStacks ?? 1);
      if (e.kind === 'auraEnemyVuln' && (!e.damageType || e.damageType === type)) v += e.pct;
    }
  }
  return v;
}

export function lacksShred(state: GameState, main: DamageType): boolean {
  return !state.slots.some(u => {
    if (!u) return false;
    const def = unitDefFast(state.data, u.defId);
    return def.grade >= 5 && shredFor(def, main) >= SUPPORT_SHRED - 1e-9;
  });
}

/** The normal grade 5 unit shredding `main` that the board is closest to building; the bigger shred on a tie. */
export function pickShredSupport(state: GameState, main: DamageType): string | null {
  const pool = state.data.units
    .filter(u => u.grade === 5 && !u.hidden && shredFor(u, main) > 0)
    .map(u => ({ id: u.id, value: remainingValue(state, u.id), shred: shredFor(u, main) }))
    .sort((a, b) => a.value - b.value || b.shred - a.shred || a.id.localeCompare(b.id));
  return pool[0]?.id ?? null;
}

/**
 * Moves the shredder in `slot` to the cell whose reach on the path overlaps most with the reach of the main type's
 * dealers (weighed by their attack), so their hits land on enemies it has weakened. It keeps to its kind of cell
 * (edge or inner) and only swaps with a unit of grade 4 or less that is not of the main type. Only moves on a clear gain.
 */
export function shredPlacement(state: GameState, slot: number, main: DamageType): Extract<Command, { type: 'move' }> | null {
  const lane = laneOf(state);
  const points = Array.from({ length: PATH_SAMPLES }, (_, k) => lane.pointAt(((k + 0.5) * lane.perimeter) / PATH_SAMPLES));
  const reach = (cell: number, range: number) => points.map(p => dist(lane.cells[cell]!, p) <= range + 1e-9);
  const shredder = unitDefFast(state.data, state.slots[slot]!.defId);
  const dealers = state.slots.flatMap((u, i) => {
    if (!u || i === slot) return [];
    const def = unitDefFast(state.data, u.defId);
    return def.damageType === main ? [{ i, attack: unitAttack(def, state.data.balance), reach: reach(i, def.range) }] : [];
  });
  const score = (at: number) => {
    const mine = reach(at, shredder.range);
    let v = 0;
    for (const d of dealers) {
      if (d.i === at) continue;
      let n = 0;
      for (let k = 0; k < PATH_SAMPLES; k++) if (mine[k] && d.reach[k]) n++;
      v += d.attack * n;
    }
    return v;
  };
  const free = (j: number) => {
    const u = state.slots[j];
    if (!u) return true;
    const def = unitDefFast(state.data, u.defId);
    return def.damageType !== main && def.grade <= 4;
  };
  const edge = lane.cells[slot]!.isEdge;
  const now = score(slot);
  let best = slot;
  let bestV = now;
  for (let j = 0; j < state.slots.length; j++) {
    if (j === slot || !state.open[j] || lane.cells[j]!.isEdge !== edge || !free(j)) continue;
    const v = score(j);
    if (v > bestV) { best = j; bestV = v; }
  }
  return best !== slot && bestV > now * 1.25 + 1 ? { type: 'move', from: slot, to: best } : null;
}
