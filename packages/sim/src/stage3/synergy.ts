import {
  dist, laneOf, unitAttack, unitDefFast, upgradeCost,
  type Command, type DamageType, type Effect, type GameState, type UnitDef, type UpgradeId,
} from '@dorandi/logic';

const TYPES: DamageType[] = ['physical', 'magical'];

/** How much of `type` an effect supports: debuffs, auras and enemy auras that apply to that damage type. */
function effectSupport(e: Effect, type: DamageType): number {
  switch (e.kind) {
    case 'vuln':
      return e.damageType === type || e.damageType === 'all' ? e.pct * (e.maxStacks ?? 1) : 0;
    case 'auraEnemyVuln':
    case 'auraAttackSpeed':
      return !e.damageType || e.damageType === type ? e.pct : 0;
    case 'auraAttackPower':
      return e.damageType === type || e.damageType === 'all' ? e.pct : 0;
    default:
      return 0;
  }
}

/** Total support a unit gives to `type` damage (0 when it has none). */
export function supportFor(def: UnitDef, type: DamageType): number {
  let v = 0;
  for (const s of def.skills) for (const e of s.effects) v += effectSupport(e, type);
  return v;
}

const hasAllyAura = (def: UnitDef): boolean =>
  def.skills.some(s => s.trigger.kind === 'aura' && s.effects.some(e => e.kind === 'auraAttackSpeed' || e.kind === 'auraAttackPower'));

/** Whether an ally aura of `aura` reaches a unit of `target`'s damage type. */
function auraReaches(aura: UnitDef, target: UnitDef): number {
  let v = 0;
  for (const s of aura.skills) {
    if (s.trigger.kind !== 'aura') continue;
    for (const e of s.effects) {
      if (e.kind === 'auraAttackSpeed' && (!e.damageType || e.damageType === target.damageType)) v += e.pct;
      if (e.kind === 'auraAttackPower' && (e.damageType === 'all' || e.damageType === target.damageType)) v += e.pct;
    }
  }
  return v;
}

/**
 * The board's main damage type: attack summed by damage type over held units, with the current target counted as if
 * held so the plan and the board pull the same way. Ties go to physical.
 */
export function mainType(state: GameState, target: string | null): DamageType {
  const sum: Record<DamageType, number> = { physical: 0, magical: 0 };
  for (const u of state.slots) {
    if (!u) continue;
    const def = unitDefFast(state.data, u.defId);
    sum[def.damageType] += unitAttack(def, state.data.balance);
  }
  if (target) {
    const def = unitDefFast(state.data, target);
    sum[def.damageType] += unitAttack(def, state.data.balance);
  }
  return sum.magical > sum.physical ? 'magical' : 'physical';
}

const TYPE_BONUS = 2;
const SUPPORT_BONUS = 2;

/** Target score (lower is better): grade-1 value still missing, less a bonus for matching and supporting the main type. */
export function synergyScore(def: UnitDef, remaining: number, main: DamageType): number {
  return remaining - (def.damageType === main ? TYPE_BONUS : 0) - (supportFor(def, main) > 0 ? SUPPORT_BONUS : 0);
}

/**
 * Upgrade for the main type: its damage line and polish first (every normal grade 6 carries both lineages, so one line
 * covers them), slots when the board is full, the other line only once those are maxed.
 */
export function synergyUpgrade(state: GameState, main: DamageType, coins: number): UpgradeId | null {
  const full = !state.slots.some((u, i) => !u && state.open[i]);
  const off = TYPES.find(t => t !== main)!;
  const pick = (ids: UpgradeId[]): UpgradeId | null => {
    let best: UpgradeId | null = null;
    let bestCost = Infinity;
    for (const def of state.data.upgrades) {
      if (!ids.includes(def.id)) continue;
      const level = state.upgrades[def.id];
      if (level >= def.max) continue;
      const cost = upgradeCost(def, level + 1);
      if (cost < bestCost) { best = def.id; bestCost = cost; }
    }
    return best;
  };
  const choice = pick(full ? [main, 'polish', 'slots'] : [main, 'polish']) ?? pick([off]);
  if (!choice) return null;
  const def = state.data.upgrades.find(u => u.id === choice)!;
  return upgradeCost(def, state.upgrades[choice] + 1) <= coins ? choice : null;
}

/** Slots of up to `n` units outside `tree` that support the main type, strongest support first. */
export function supportSlots(state: GameState, tree: Map<string, number>, main: DamageType, n: number): Set<number> {
  const out = state.slots
    .map((u, i) => {
      if (!u || tree.has(u.defId)) return null;
      const def = unitDefFast(state.data, u.defId);
      const s = supportFor(def, main);
      return s > 0 ? { i, s, g: def.grade } : null;
    })
    .filter((x): x is { i: number; s: number; g: number } => x !== null)
    .sort((a, b) => b.s - a.s || b.g - a.g || a.i - b.i);
  return new Set(out.slice(0, n).map(x => x.i));
}

/**
 * Moves one ally-aura unit to the cell where its aura covers the most attack of the types it boosts, keeping melee
 * and ranged on their own kind of cell (the occupant, if any, swaps into the old cell). Only moves on a clear gain.
 */
export function auraPlacement(state: GameState): Command | null {
  const lane = laneOf(state);
  const radius = state.data.balance.auraRadius;
  const covered = (auraSlot: number, at: number): number => {
    const aura = unitDefFast(state.data, state.slots[auraSlot]!.defId);
    let v = 0;
    for (let i = 0; i < state.slots.length; i++) {
      const u = state.slots[i];
      if (!u || i === auraSlot || i === at) continue;
      if (dist(lane.cells[at]!, lane.cells[i]!) > radius + 1e-9) continue;
      const def = unitDefFast(state.data, u.defId);
      v += auraReaches(aura, def) * unitAttack(def, state.data.balance);
    }
    return v;
  };
  for (let slot = 0; slot < state.slots.length; slot++) {
    const u = state.slots[slot];
    if (!u || u.locked || !hasAllyAura(unitDefFast(state.data, u.defId))) continue;
    const edge = lane.cells[slot]!.isEdge;
    const now = covered(slot, slot);
    let best = slot;
    let bestV = now;
    for (let j = 0; j < state.slots.length; j++) {
      if (j === slot || !state.open[j] || lane.cells[j]!.isEdge !== edge || state.slots[j]?.locked) continue;
      const v = covered(slot, j);
      if (v > bestV) { best = j; bestV = v; }
    }
    if (best !== slot && bestV > now * 1.25 + 1) return { type: 'move', from: slot, to: best };
  }
  return null;
}
