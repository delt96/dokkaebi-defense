import type { GameData, GameEvent, GameState, Unit, UnitDef } from './types';
import { nextFloat } from './rng';
import { registerCommand } from './registry';
import { laneOf } from './lane';
import { toTicks } from './flow';
import { gradeValue, summonOddsForRound } from './data';
import { takeToken } from './econ/ledger';

const unitCache = new WeakMap<GameData, Map<string, UnitDef>>();
export function unitDefFast(data: GameData, id: string): UnitDef {
  let m = unitCache.get(data);
  if (!m) { m = new Map(data.units.map(u => [u.id, u])); unitCache.set(data, m); }
  const u = m.get(id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}

export function rollSummon(state: GameState): string {
  const odds = summonOddsForRound(state.data.balance, state.round);
  const roll = nextFloat(state.rng.summon);
  let start = 0;
  for (const [i, probability] of odds.entries()) {
    const end = start + probability;
    if (probability > 0 && roll < end) {
      // Equal slices of this grade's interval give each unit the same chance.
      const pool = state.data.units.filter(u => u.grade === i + 1);
      const index = Math.floor((roll - start) / probability * pool.length);
      return pool[Math.min(index, pool.length - 1)]!.id;
    }
    start = end;
  }
  throw new Error('summon odds do not cover the roll');
}

const MELEE_MAX_RANGE = 2.0;

export function chooseSlot(state: GameState, def: UnitDef): number | null {
  const lane = laneOf(state);
  const wantEdge = def.range <= MELEE_MAX_RANGE;
  let fallback: number | null = null;
  for (let i = 0; i < state.slots.length; i++) {
    if (!state.open[i] || state.slots[i]) continue;
    if (lane.cells[i]!.isEdge === wantEdge) return i;
    if (fallback === null) fallback = i;
  }
  return fallback;
}

export function pityPick(state: GameState): string {
  let best: string | null = null;
  let bestCount = Infinity;
  for (const u of state.data.units) {
    if (u.grade !== 1) continue;
    const c = state.summonCounts[u.id] ?? 0;
    if (c < bestCount) { best = u.id; bestCount = c; }
  }
  return best!;
}

export function addUnit(state: GameState, defId: string, slot: number, _events: GameEvent[]): Unit {
  const def = unitDefFast(state.data, defId);
  const ready = state.data.balance.periodicReady === true;
  const periodic = def.skills.filter(s => s.trigger.kind === 'periodic')
    .map(s => (ready ? 0 : toTicks((s.trigger as { seconds: number }).seconds)));
  const unit: Unit = { id: state.nextId++, defId, cooldown: 0, attackCount: 0, periodic };
  const charge = def.skills.find(s => s.trigger.kind === 'charge')?.trigger;
  if (charge?.kind === 'charge') unit.chargeTicks = toTicks(charge.seconds);
  state.slots[slot] = unit;
  return unit;
}

/** Places `defId` in the best free open slot and emits `summon`; `cost` is set only when the lane has an economy. */
export function receive(state: GameState, defId: string, events: GameEvent[], cost?: number): boolean {
  const def = unitDefFast(state.data, defId);
  const slot = chooseSlot(state, def);
  if (slot === null) return false;
  const unit = addUnit(state, defId, slot, events);
  if (state.econ && cost !== undefined) unit.cost = cost;
  events.push({ type: 'summon', unitId: unit.id, defId, grade: def.grade, slot });
  return true;
}

registerCommand('summon', (state, _cmd, events) => {
  if (state.tokens <= 0) return 'noToken';
  if (!state.slots.some((u, i) => !u && state.open[i])) return 'noSlot';
  const quest = takeToken(state) === 'quest';
  // one draw per summon keeps the stream aligned; the pity only swaps what that draw gave
  let defId = rollSummon(state);
  if (unitDefFast(state.data, defId).grade === 1) {
    state.grade1Summons++;
    if (state.grade1Summons % state.data.balance.pityEvery === 0) defId = pityPick(state);
  }
  state.summonCounts[defId] = (state.summonCounts[defId] ?? 0) + 1;
  receive(state, defId, events, quest ? 0 : gradeValue(unitDefFast(state.data, defId).grade));
  return null;
});

const validSlot = (state: GameState, i: number) => Number.isInteger(i) && i >= 0 && i < state.slots.length;

registerCommand('move', (state, cmd) => {
  if (cmd.type !== 'move') return 'unknown';
  if (!validSlot(state, cmd.from) || !state.slots[cmd.from]) return 'noUnit';
  if (!validSlot(state, cmd.to) || !state.open[cmd.to]) return 'closedSlot';
  if (cmd.from === cmd.to) return null;
  if (state.slots[cmd.from]!.locked || state.slots[cmd.to]?.locked) return 'locked';
  const a = state.slots[cmd.from]!;
  state.slots[cmd.from] = state.slots[cmd.to] ?? null;
  state.slots[cmd.to] = a;
  return null;
});

registerCommand('sell', (state, cmd) => {
  if (cmd.type !== 'sell') return 'unknown';
  if (!validSlot(state, cmd.slot) || !state.slots[cmd.slot]) return 'noUnit';
  if (state.slots[cmd.slot]!.locked) return 'locked';
  const def = unitDefFast(state.data, state.slots[cmd.slot]!.defId);
  state.coins += state.data.balance.sellPrice[def.grade - 1] ?? 0;
  state.slots[cmd.slot] = null;
  return null;
});

registerCommand('convertToken', (state) => {
  if (state.tokens <= 0) return 'noToken';
  takeToken(state);
  state.coins += state.data.balance.tokens.toCoins;
  return null;
});

registerCommand('helperOpened', (state) => {
  state.helperOpens++;
  return null;
});
