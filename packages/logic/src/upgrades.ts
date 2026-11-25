import type { GameState, UnitDef, UpgradeDef } from './types';
import { registerCommand } from './registry';

export function upgradeCost(def: UpgradeDef, nextLevel: number): number {
  return def.costPerLevel * nextLevel;
}

/** A unit's reach with the range upgrade. Where it stands (edge or inner cell) still follows its own `range`. */
export function unitRange(state: GameState, def: UnitDef): number {
  const up = state.upgrades.range;
  if (!up) return def.range;
  const amount = state.data.upgrades.find(u => u.id === 'range')?.amount ?? 0;
  return def.range + amount * up;
}

registerCommand('upgrade', (state, cmd) => {
  if (cmd.type !== 'upgrade') return 'unknown';
  const def = state.data.upgrades.find(u => u.id === cmd.id);
  if (!def) return 'unknown';
  const level = state.upgrades[def.id] ?? 0;
  if (level >= def.max) return 'maxed';
  const cost = upgradeCost(def, level + 1);
  if (state.coins < cost) return 'noCoins';
  state.coins -= cost;
  state.upgrades[def.id] = level + 1;
  return null;
});
