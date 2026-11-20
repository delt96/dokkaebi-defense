import type { UpgradeDef } from './types';
import { registerCommand } from './registry';

export function upgradeCost(def: UpgradeDef, nextLevel: number): number {
  return def.costPerLevel * nextLevel;
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
  if (def.id === 'slots') {
    const { cols, initialOpenRows } = state.data.balance.grid;
    const count = def.openCount ?? 0;
    const first = initialOpenRows * cols + level * count;
    for (let i = first; i < first + count && i < state.open.length; i++) state.open[i] = true;
  }
  return null;
});
