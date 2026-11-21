import type { GameData, GameState, RejectReason, TameTargetDef } from '../types';
import { registerCommand } from '../registry';
import { nextFloat } from '../rng';
import { toTicks } from '../flow';
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

/** Success chance at `hp` of `maxHp`: the first band whose upper bound the remaining share does not exceed. */
export function tameChance(data: GameData, hp: number, maxHp: number): number {
  const bands = data.economy?.tame?.hpBands ?? [];
  const share = maxHp > 0 ? hp / maxHp : 0;
  return (bands.find(b => share <= b.upTo) ?? bands[bands.length - 1])?.chance ?? 0;
}

/** The tick a new attempt on `enemyId` opens (0 when it was never refused). */
export function tameReadyTick(state: GameState, enemyId: number): number {
  return state.econ?.tameReady.find(r => r.enemyId === enemyId)?.tick ?? 0;
}

/** Why an attempt on `enemyId` would be refused right now, or null when it can be paid for and rolled. */
export function tameCheck(state: GameState, enemyId: number): RejectReason | null {
  const found = tameTarget(state, enemyId);
  if (!found) return 'noTarget';
  const { def } = found;
  const enemy = state.enemies[found.enemyIndex]!;
  if (def.needs === 'slowed') {
    if (!enemy.slow || enemy.slow.ticks <= 0) return 'tameCondition';
  } else if (def.needs) {
    if ((enemy.vulns[def.needs.vulnSource]?.stacks ?? 0) < def.needs.stacks) return 'tameCondition';
  }
  if (state.tick < tameReadyTick(state, enemyId)) return 'cooldown';
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
  const econ = state.econ!;
  const config = state.data.economy!.tame!;
  const { def, enemyIndex } = tameTarget(state, cmd.enemyId)!;
  const enemy = state.enemies[enemyIndex]!;
  const chance = tameChance(state.data, enemy.hp, enemy.maxHp);
  const spent = { buckwheat: def.cost.buckwheat ?? 0, coins: def.cost.coins ?? 0, tokens: def.cost.tokens ?? 0 };
  state.buckwheat -= spent.buckwheat;
  state.coins -= spent.coins;
  for (let i = 0; i < spent.tokens; i++) takeToken(state);
  const success = nextFloat(econ.rng.tame) < chance;
  econ.tameReady = econ.tameReady.filter(r => r.enemyId !== enemy.id && state.enemies.some(e => e.id === r.enemyId));
  events.push({ type: 'tameTry', enemyId: enemy.id, defId: def.unit, chance, success, ...spent });
  if (!success) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.ceil(enemy.maxHp * config.failureHealPct));
    econ.tameReady.push({ enemyId: enemy.id, tick: state.tick + toTicks(config.cooldownSeconds) });
    return null;
  }
  // a recruit leaves the lane at once: no kill, death effect, kill count or reward of any kind
  state.enemies.splice(enemyIndex, 1);
  const rec = econ.events.findIndex(r => r.id === enemy.id);
  if (rec >= 0) econ.events.splice(rec, 1);
  if (econ.mission.beastId === enemy.id) econ.mission.beastDown = true;
  const unitDef = unitDefFast(state.data, def.unit);
  const slot = chooseSlot(state, unitDef)!;
  const unit = addUnit(state, def.unit, slot, events);
  unit.cost = 0;
  econ.tamed.push(def.unit);
  events.push({ type: 'tame', enemyId: enemy.id, defId: def.unit, unitId: unit.id, slot });
  events.push({ type: 'summon', unitId: unit.id, defId: def.unit, grade: unitDef.grade, slot });
  return null;
});
