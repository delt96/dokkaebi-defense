import { registerCommand } from '../registry';
import { toTicks } from '../flow';
import { unitDefFast } from '../units';
import type { Enemy, GameData, GameState, RejectReason, ShopItemDef } from '../types';

export function shopItem(data: GameData, id: string): ShopItemDef | undefined {
  return data.economy?.shop?.items.find(i => i.id === id);
}

export function itemOf(state: GameState, slot: number): ShopItemDef | null {
  const id = state.slots[slot]?.item;
  return id === undefined ? null : shopItem(state.data, id) ?? null;
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

// Not via applyStatus: setting vulnCaster would let a charm-only weakening arm the holder's onVulnKillExplode.
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
  if (item.perGame !== undefined && (state.econ!.itemsBought?.[id] ?? 0) >= item.perGame) return 'itemLimit';
  return state.coins < item.coins ? 'noCoins' : null;
}

registerCommand('buyItem', (state, cmd, events) => {
  if (cmd.type !== 'buyItem') return 'unknown';
  const why = buyBlock(state, cmd.item);
  if (why) return why;
  const econ = state.econ!;
  state.coins -= shopItem(state.data, cmd.item)!.coins;
  econ.items = { ...econ.items, [cmd.item]: (econ.items?.[cmd.item] ?? 0) + 1 };
  econ.itemsBought = { ...econ.itemsBought, [cmd.item]: (econ.itemsBought?.[cmd.item] ?? 0) + 1 };
  events.push({ type: 'itemBought', item: cmd.item });
  return null;
});

registerCommand('attachItem', (state, cmd, events) => {
  if (cmd.type !== 'attachItem') return 'unknown';
  if (!shopFor(state, cmd.item)) return 'unknown';
  const econ = state.econ!;
  if (econ.marketOpen === false) return 'marketLocked';
  if ((econ.items?.[cmd.item] ?? 0) < 1) return 'noItem';
  const unit = Number.isInteger(cmd.slot) && cmd.slot >= 0 ? state.slots[cmd.slot] : undefined;
  if (!unit) return 'noUnit';
  const replaced = unit.item ?? null;
  econ.items = { ...econ.items, [cmd.item]: econ.items![cmd.item]! - 1 };
  unit.item = cmd.item;
  events.push({ type: 'itemAttached', item: cmd.item, unitId: unit.id, defId: unit.defId, replaced });
  return null;
});
