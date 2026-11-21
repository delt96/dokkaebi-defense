import type { GameData, UpgradeDef } from './types';
import { registerCommand } from './registry';

export function upgradeCost(def: UpgradeDef, nextLevel: number): number {
  return def.costPerLevel * nextLevel;
}

/** The cells the slots upgrade opens when it goes from `level` to `level + 1` (fewer on the last level, at the board's end). */
export function slotsOpenedAt(data: GameData, level: number): number[] {
  const def = data.upgrades.find(u => u.id === 'slots');
  const { cols, rows, initialOpenRows } = data.balance.grid;
  const count = def?.openCount ?? 0;
  const first = initialOpenRows * cols + level * count;
  const out: number[] = [];
  for (let i = first; i < first + count && i < cols * rows; i++) out.push(i);
  return out;
}

registerCommand('upgrade', (state, cmd) => {
  if (cmd.type !== 'upgrade') return 'unknown';
  const def = state.data.upgrades.find(u => u.id === cmd.id);
  if (!def) return 'unknown';
  const level = state.upgrades[def.id];
  if (level >= def.max) return 'maxed';
  const cost = upgradeCost(def, level + 1);
  if (state.coins < cost) return 'noCoins';
  state.coins -= cost;
  state.upgrades[def.id] = level + 1;
  if (def.id === 'slots') for (const i of slotsOpenedAt(state.data, level)) state.open[i] = true;
  return null;
});
