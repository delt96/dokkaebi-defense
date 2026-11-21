import type { GameState, RejectReason, TameTargetDef } from '../types';
import { registerCommand } from '../registry';
import { addUnit, chooseSlot, unitDefFast } from '../units';
import { takeToken } from './ledger';

function tameTarget(state: GameState, enemyId: number): { def: TameTargetDef; enemyIndex: number } | null {
  const tame = state.data.economy?.tame;
  if (!tame || !state.econ) return null;
  const enemyIndex = state.enemies.findIndex(e => e.id === enemyId && e.hp > 0);
  if (enemyIndex < 0) return null;
  const def = tame.targets.find(t => t.enemy === state.enemies[enemyIndex]!.defId);
  return def ? { def, enemyIndex } : null;
}

/** Why taming `enemyId` would be refused right now, or null when it would succeed. */
export function tameCheck(state: GameState, enemyId: number): RejectReason | null {
  const found = tameTarget(state, enemyId);
  if (!found) return 'noTarget';
  const { def } = found;
  const enemy = state.enemies[found.enemyIndex]!;
  if (enemy.hp > Math.floor(enemy.maxHp * state.data.economy!.tame!.hpPct)) return 'tameHp';
  if (def.needs === 'slowed') {
    if (!enemy.slow || enemy.slow.ticks <= 0) return 'tameCondition';
  } else if (def.needs) {
    if ((enemy.vulns[def.needs.vulnSource]?.stacks ?? 0) < def.needs.stacks) return 'tameCondition';
  }
  if (!state.slots.some((u, i) => !u && state.open[i])) return 'noSlot';
  if ((def.cost.buckwheat ?? 0) > state.buckwheat) return 'noBuckwheat';
  if ((def.cost.coins ?? 0) > state.coins) return 'noCoins';
  if ((def.cost.tokens ?? 0) > state.tokens) return 'noToken';
  return null;
}

registerCommand('tame', (state, cmd, events) => {
  if (cmd.type !== 'tame') return 'unknown';
  const reason = tameCheck(state, cmd.enemyId);
  if (reason) return reason;
  const { def, enemyIndex } = tameTarget(state, cmd.enemyId)!;
  const enemy = state.enemies[enemyIndex]!;
  state.buckwheat -= def.cost.buckwheat ?? 0;
  state.coins -= def.cost.coins ?? 0;
  for (let i = 0; i < (def.cost.tokens ?? 0); i++) takeToken(state);
  const unitDef = unitDefFast(state.data, def.unit);
  const slot = chooseSlot(state, unitDef)!;
  const unit = addUnit(state, def.unit, slot, events);
  unit.cost = 0;
  state.econ!.tamed.push(def.unit);
  enemy.hp = 0;
  events.push({ type: 'tame', enemyId: enemy.id, defId: def.unit, unitId: unit.id, slot });
  events.push({ type: 'summon', unitId: unit.id, defId: def.unit, grade: unitDef.grade, slot });
  return null;
});
