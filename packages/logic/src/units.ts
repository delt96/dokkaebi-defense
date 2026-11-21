import type { GameData, GameEvent, GameState, Unit, UnitDef } from './types';
import { nextFloat, nextInt } from './rng';
import { registerAfterCommands, registerCommand } from './registry';
import { laneOf } from './lane';
import { toTicks } from './flow';

const unitCache = new WeakMap<GameData, Map<string, UnitDef>>();
export function unitDefFast(data: GameData, id: string): UnitDef {
  let m = unitCache.get(data);
  if (!m) { m = new Map(data.units.map(u => [u.id, u])); unitCache.set(data, m); }
  const u = m.get(id);
  if (!u) throw new Error(`unknown unit ${id}`);
  return u;
}

export function rollSummon(state: GameState): string {
  const odds = state.data.balance.summonOdds;
  const r = nextFloat(state.rng.summon);
  let grade = odds.length;
  let acc = 0;
  for (let i = 0; i < odds.length; i++) {
    acc += odds[i]!;
    if (r < acc) { grade = i + 1; break; }
  }
  const pool = state.data.units.filter(u => u.grade === grade);
  return pool[nextInt(state.rng.summon, pool.length)]!.id;
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

function receive(state: GameState, defId: string, events: GameEvent[]): boolean {
  const def = unitDefFast(state.data, defId);
  const slot = chooseSlot(state, def);
  if (slot === null) return false;
  const unit = addUnit(state, defId, slot, events);
  events.push({ type: 'summon', unitId: unit.id, defId, grade: def.grade, slot });
  return true;
}

function placePendingPity(state: GameState, events: GameEvent[]): void {
  while (state.pendingPity.length && receive(state, state.pendingPity[0]!, events)) state.pendingPity.shift();
}

registerCommand('summon', (state, _cmd, events) => {
  if (state.tokens <= 0) return 'noToken';
  placePendingPity(state, events);
  if (!state.slots.some((u, i) => !u && state.open[i])) return 'noSlot';
  state.tokens--;
  const defId = rollSummon(state);
  state.summonCounts[defId] = (state.summonCounts[defId] ?? 0) + 1;
  receive(state, defId, events);
  if (unitDefFast(state.data, defId).grade === 1) {
    state.grade1Summons++;
    if (state.grade1Summons % state.data.balance.pityEvery === 0) {
      const pity = pityPick(state);
      state.summonCounts[pity] = (state.summonCounts[pity] ?? 0) + 1;
      if (!receive(state, pity, events)) state.pendingPity.push(pity);
    }
  }
  return null;
});

registerAfterCommands(placePendingPity);

const validSlot = (state: GameState, i: number) => Number.isInteger(i) && i >= 0 && i < state.slots.length;

registerCommand('move', (state, cmd) => {
  if (cmd.type !== 'move') return 'unknown';
  if (!validSlot(state, cmd.from) || !state.slots[cmd.from]) return 'noUnit';
  if (!validSlot(state, cmd.to) || !state.open[cmd.to]) return 'closedSlot';
  if (cmd.from === cmd.to) return null;
  const a = state.slots[cmd.from]!;
  state.slots[cmd.from] = state.slots[cmd.to] ?? null;
  state.slots[cmd.to] = a;
  return null;
});

registerCommand('sell', (state, cmd) => {
  if (cmd.type !== 'sell') return 'unknown';
  if (!validSlot(state, cmd.slot) || !state.slots[cmd.slot]) return 'noUnit';
  const def = unitDefFast(state.data, state.slots[cmd.slot]!.defId);
  state.coins += state.data.balance.sellPrice[def.grade - 1] ?? 0;
  state.slots[cmd.slot] = null;
  return null;
});

registerCommand('convertToken', (state) => {
  if (state.tokens <= 0) return 'noToken';
  state.tokens--;
  state.coins += state.data.balance.tokens.toCoins;
  return null;
});

registerCommand('helperOpened', (state) => {
  state.helperOpens++;
  return null;
});
