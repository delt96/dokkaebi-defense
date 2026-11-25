import { registerCommand } from '../registry';
import type { GameData, GameState, RejectReason, ShopItemDef } from '../types';

export function shopItem(data: GameData, id: string): ShopItemDef | undefined {
  return data.economy?.shop?.items.find(i => i.id === id);
}

export function itemOf(state: GameState, slot: number): ShopItemDef | null {
  const id = state.slots[slot]?.item;
  return id === undefined ? null : shopItem(state.data, id) ?? null;
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
