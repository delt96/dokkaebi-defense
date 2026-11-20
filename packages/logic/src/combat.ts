import type { DamageType, Enemy, GameEvent, GameState } from './types';
import { unitAttack } from './data';
import { dist } from './lane';
import { laneOf, registerPhase } from './game';
import { enemyDefFast, finishGame, TICKS_PER_SECOND } from './flow';
import { statsForRound } from './stats';
import { unitDefFast } from './units';

export function computeHitDamage(a: { attack: number; mult: number; bonus: number; resist: number; vuln: number }): number {
  return Math.max(1, Math.round(a.attack * a.mult * (1 + a.bonus) * (1 - a.resist) * (1 + a.vuln)));
}

export function attackIntervalTicks(intervalSeconds: number, speedBonus: number): number {
  return Math.max(1, Math.round((intervalSeconds / (1 + speedBonus)) * TICKS_PER_SECOND));
}

function upgradePct(state: GameState, id: 'physical' | 'magical' | 'polish'): number {
  const def = state.data.upgrades.find(u => u.id === id);
  return (def?.pct ?? 0) * state.upgrades[id];
}

export function auraAttackPower(_state: GameState, _slot: number): number {
  return 0;
}

export function speedBonus(_state: GameState, _slot: number): number {
  return 0;
}

export function vulnOf(_state: GameState, _enemy: Enemy, _damageType: DamageType): number {
  return 0;
}

export function damageBonus(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!unit) return 0;
  const def = unitDefFast(state.data, unit.defId);
  const polish = def.grade <= 4 ? upgradePct(state, 'polish') : 0;
  return upgradePct(state, def.damageType) + polish + auraAttackPower(state, slot);
}

export function enemyResist(state: GameState, enemy: Enemy, damageType: DamageType): number {
  return enemyDefFast(state.data, enemy.defId).resist[damageType];
}

export function inRange(state: GameState, slot: number, enemy: Enemy, range: number): boolean {
  const lane = laneOf(state);
  return dist(lane.cells[slot]!, lane.pointAt(enemy.d)) <= range + 1e-9;
}

export function pickTarget(state: GameState, slot: number): Enemy | null {
  const unit = state.slots[slot];
  if (!unit) return null;
  const range = unitDefFast(state.data, unit.defId).range;
  let best: Enemy | null = null;
  for (const e of state.enemies) {
    if (e.hp <= 0 || !inRange(state, slot, e, range)) continue;
    if (!best || (e.boss && !best.boss) || (e.boss === best.boss && e.id < best.id)) best = e;
  }
  return best;
}

export function dealDamage(state: GameState, enemy: Enemy, amount: number, source: string, events: GameEvent[]): void {
  if (enemy.hp <= 0) return;
  const actual = Math.min(amount, enemy.hp);
  enemy.hp -= amount;
  events.push({ type: 'damage', enemyId: enemy.id, amount, source });
  if (!enemy.boss) {
    const st = statsForRound(state, enemy.round);
    if (st) st.damageDealt += actual;
  }
}

export function hitDamage(state: GameState, slot: number, enemy: Enemy, mult: number): number {
  const def = unitDefFast(state.data, state.slots[slot]!.defId);
  return computeHitDamage({
    attack: unitAttack(def, state.data.balance), mult,
    bonus: damageBonus(state, slot),
    resist: enemyResist(state, enemy, def.damageType),
    vuln: vulnOf(state, enemy, def.damageType),
  });
}

export function onAttack(state: GameState, slot: number, target: Enemy, events: GameEvent[]): void {
  const unit = state.slots[slot]!;
  dealDamage(state, target, hitDamage(state, slot, target, 1), unit.defId, events);
}

export function unitAttacks(state: GameState, events: GameEvent[]): void {
  for (let slot = 0; slot < state.slots.length; slot++) {
    const unit = state.slots[slot];
    if (!unit) continue;
    if (unit.cooldown > 0) { unit.cooldown--; continue; }
    const target = pickTarget(state, slot);
    if (!target) continue;
    const def = unitDefFast(state.data, unit.defId);
    unit.attackCount++;
    events.push({ type: 'attack', unitId: unit.id, enemyId: target.id });
    onAttack(state, slot, target, events);
    unit.cooldown = attackIntervalTicks(def.interval, speedBonus(state, slot)) - 1;
  }
}

export function resolveKills(state: GameState, events: GameEvent[]): void {
  const b = state.data.balance;
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp > 0) { alive.push(e); continue; }
    events.push({ type: 'kill', enemyId: e.id });
    if (e.boss) {
      state.coins += b.coins.boss;
      state.buckwheat += b.bossBuckwheat;
      const st = statsForRound(state, state.round);
      if (st) st.bossKillSeconds = (state.tick - state.roundStartTick) / TICKS_PER_SECOND;
      if (state.round >= b.rounds) finishGame(state, { outcome: 'clear', reason: null, round: state.round }, events);
    } else {
      state.coins += b.coins.perKill;
    }
  }
  state.enemies = alive;
}

export function boardDps(state: GameState): number {
  let total = 0;
  for (let slot = 0; slot < state.slots.length; slot++) {
    const unit = state.slots[slot];
    if (!unit) continue;
    const def = unitDefFast(state.data, unit.defId);
    const seconds = attackIntervalTicks(def.interval, speedBonus(state, slot)) / TICKS_PER_SECOND;
    total += (unitAttack(def, state.data.balance) * (1 + damageBonus(state, slot))) / seconds;
  }
  return total;
}

registerPhase('unitAttacks', unitAttacks);
registerPhase('resolveKills', resolveKills);
