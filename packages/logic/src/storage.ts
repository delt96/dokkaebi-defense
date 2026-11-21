import type { GameState, Unit } from './types';
import { registerCommand } from './registry';
import { chooseSlot, unitDefFast } from './units';

/** Only units up to this grade can be put in storage. */
export const STORAGE_MAX_GRADE = 2;

/** The lane's stored units, oldest first; empty when storage was never used. */
export function storedUnits(state: GameState): readonly Unit[] {
  return state.storage ?? [];
}

export function canStore(state: GameState, unit: Unit): boolean {
  return unitDefFast(state.data, unit.defId).grade <= STORAGE_MAX_GRADE;
}

/** Moves a board unit into storage. The field is created here, so lanes that never store keep their old state shape. */
function putAway(state: GameState, slot: number): void {
  const unit = state.slots[slot]!;
  // a remembered target may be gone by the time the unit comes back
  delete unit.streak;
  (state.storage ??= []).push(unit);
  state.slots[slot] = null;
}

/** Index of the newest stored unit of `defId` (taken out and sold first), or -1. */
function lastStored(state: GameState, defId: unknown): number {
  const list = state.storage ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.defId === defId) return i;
  return -1;
}

const validSlot = (state: GameState, i: unknown): i is number =>
  typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < state.slots.length;

registerCommand('store', (state, cmd) => {
  if (cmd.type !== 'store') return 'unknown';
  if (!validSlot(state, cmd.slot) || !state.slots[cmd.slot]) return 'noUnit';
  const unit = state.slots[cmd.slot]!;
  if (!canStore(state, unit)) return 'notStorable';
  putAway(state, cmd.slot);
  return null;
});

registerCommand('storeAll', (state) => {
  let n = 0;
  for (let i = 0; i < state.slots.length; i++) {
    const unit = state.slots[i];
    if (unit && canStore(state, unit)) { putAway(state, i); n++; }
  }
  return n ? null : 'nothingToStore';
});

registerCommand('retrieve', (state, cmd) => {
  if (cmd.type !== 'retrieve') return 'unknown';
  const at = lastStored(state, cmd.defId);
  if (at < 0) return 'notStored';
  const unit = state.storage![at]!;
  let slot: number | null;
  if (cmd.slot === undefined) {
    slot = chooseSlot(state, unitDefFast(state.data, unit.defId));
    if (slot === null) return 'noSlot';
  } else {
    if (!validSlot(state, cmd.slot) || !state.open[cmd.slot]) return 'closedSlot';
    if (state.slots[cmd.slot]) return 'slotTaken';
    slot = cmd.slot;
  }
  state.storage!.splice(at, 1);
  state.slots[slot] = unit;
  return null;
});

registerCommand('sellStored', (state, cmd) => {
  if (cmd.type !== 'sellStored') return 'unknown';
  const at = lastStored(state, cmd.defId);
  if (at < 0) return 'notStored';
  const [unit] = state.storage!.splice(at, 1);
  state.coins += state.data.balance.sellPrice[unitDefFast(state.data, unit!.defId).grade - 1] ?? 0;
  return null;
});
