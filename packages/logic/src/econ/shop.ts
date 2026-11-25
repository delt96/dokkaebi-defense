import { registerCommand } from '../registry';
import { toTicks } from '../flow';
import { unitDefFast } from '../units';
import type { Enemy, GameData, GameState, RejectReason, ShopItemDef, Unit } from '../types';

export function shopItem(data: GameData, id: string): ShopItemDef | undefined {
  return data.economy?.shop?.items.find(i => i.id === id);
}

export function itemOf(state: GameState, slot: number): ShopItemDef | null {
  const id = state.slots[slot]?.item;
  return id === undefined ? null : shopItem(state.data, id) ?? null;
}

/** A tame target's unit: the five kinds an `evolve` item goes on. */
export function isTamedKind(data: GameData, defId: string): boolean {
  return data.economy?.tame?.targets.some(t => t.unit === defId) ?? false;
}

export function isEvolved(data: GameData, unit: Pick<Unit, 'item'> | null | undefined): boolean {
  return unit?.item !== undefined && shopItem(data, unit.item)?.effect.kind === 'evolve';
}

/** The damage multiplier an evolved recruit gets (1 for every other unit). */
export function evolveMult(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!isEvolved(state.data, unit)) return 1;
  return state.data.economy?.tame?.targets.find(t => t.unit === unit!.defId)?.evolvedMult ?? 1;
}

export function unitRange(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!unit) return 0;
  const effect = itemOf(state, slot)?.effect;
  return unitDefFast(state.data, unit.defId).range + (effect?.kind === 'range' ? effect.amount : 0);
}

export function itemBonus(state: GameState, slot: number, kind: 'attack' | 'speed'): number {
  const effect = itemOf(state, slot)?.effect;
  return effect?.kind === kind ? effect.pct : 0;
}

/** Leaves vulnCaster alone: a weak charm must not arm another unit's kill explosion. */
export function applyItemVuln(state: GameState, slot: number, target: Enemy): void {
  const effect = itemOf(state, slot)?.effect;
  if (effect?.kind !== 'vuln' || target.hp <= 0) return;
  const damageType = unitDefFast(state.data, state.slots[slot]!.defId).damageType;
  const key = `item:${state.slots[slot]!.item}:${damageType}`;
  const ticks = toTicks(effect.seconds);
  const cur = target.vulns[key];
  if (cur) cur.ticks = ticks;
  else target.vulns[key] = { pct: effect.pct, damageType, ticks, stacks: 1 };
}

function shopFor(state: GameState, id: string): ShopItemDef | null {
  return state.econ && typeof id === 'string' ? shopItem(state.data, id) ?? null : null;
}

export function buyBlock(state: GameState, id: string): RejectReason | null {
  const item = shopFor(state, id);
  if (!item) return 'unknown';
  if (state.econ!.marketOpen === false) return 'marketLocked';
  if (item.fromRound !== undefined && state.round < item.fromRound) return 'itemTooEarly';
  if (item.perGame !== undefined && (state.econ!.itemsBought?.[id] ?? 0) >= item.perGame) return 'itemLimit';
  if ((item.buckwheat ?? 0) > state.buckwheat) return 'noBuckwheat';
  return state.coins < item.coins ? 'noCoins' : null;
}

registerCommand('buyItem', (state, cmd, events) => {
  if (cmd.type !== 'buyItem') return 'unknown';
  const why = buyBlock(state, cmd.item);
  if (why) return why;
  const econ = state.econ!;
  const item = shopItem(state.data, cmd.item)!;
  state.coins -= item.coins;
  if (item.buckwheat) state.buckwheat -= item.buckwheat;
  econ.items = { ...econ.items, [cmd.item]: (econ.items?.[cmd.item] ?? 0) + 1 };
  econ.itemsBought = { ...econ.itemsBought, [cmd.item]: (econ.itemsBought?.[cmd.item] ?? 0) + 1 };
  events.push({ type: 'itemBought', item: cmd.item });
  return null;
});

registerCommand('attachItem', (state, cmd, events) => {
  if (cmd.type !== 'attachItem') return 'unknown';
  const item = shopFor(state, cmd.item);
  if (!item) return 'unknown';
  const econ = state.econ!;
  if (econ.marketOpen === false) return 'marketLocked';
  if ((econ.items?.[cmd.item] ?? 0) < 1) return 'noItem';
  const unit = Number.isInteger(cmd.slot) && cmd.slot >= 0 ? state.slots[cmd.slot] : undefined;
  if (!unit) return 'noUnit';
  if (item.effect.kind === 'evolve' && !isTamedKind(state.data, unit.defId)) return 'notTamed';
  const replaced = unit.item ?? null;
  econ.items = { ...econ.items, [cmd.item]: econ.items![cmd.item]! - 1 };
  unit.item = cmd.item;
  events.push({ type: 'itemAttached', item: cmd.item, unitId: unit.id, defId: unit.defId, replaced });
  return null;
});
