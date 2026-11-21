import type { DamageType, Enemy, GameEvent, GameState, HitEffect } from './types';
import { unitAttack } from './data';
import { dist } from './lane';
import { registerPhase } from './registry';
import { laneOf } from './lane';
import { enemyDefFast, finishGame, TICKS_PER_SECOND } from './flow';
import { currentStats, isEvent, isShared, statsForRound } from './stats';
import { econBossKill, econEventKill } from './econ/hooks';
import { unitDefFast } from './units';
import { auraAttackPower, performAttack, runPeriodics, speedBonus, vulnKillExplosions, vulnOf } from './effects';
import { runIncome } from './income';

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

export { speedBonus, vulnOf };

export function damageBonus(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!unit) return 0;
  const def = unitDefFast(state.data, unit.defId);
  const polish = def.grade <= 4 ? upgradePct(state, 'polish') : 0;
  const line = state.data.balance.inheritUpgrades && def.lineage
    ? Math.max(...def.lineage.map(t => upgradePct(state, t)))
    : upgradePct(state, def.damageType);
  return line + polish + auraAttackPower(state, slot);
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
  let bestRank = 3;
  for (const e of state.enemies) {
    if (e.hp <= 0 || !inRange(state, slot, e, range)) continue;
    const rank = e.boss || isEvent(state.data, e) ? 0 : isShared(state.data, e) ? 1 : 2;
    if (!best || rank < bestRank || (rank === bestRank && e.id < best.id)) { best = e; bestRank = rank; }
  }
  return best;
}

export function dealDamage(state: GameState, enemy: Enemy, amount: number, source: string, events: GameEvent[], effect?: HitEffect): void {
  if (enemy.hp <= 0) return;
  const actual = Math.min(amount, enemy.hp);
  enemy.hp -= amount;
  events.push({ type: 'damage', enemyId: enemy.id, amount, source, ...(effect && { effect }) });
  if (!enemy.boss && !isShared(state.data, enemy) && !isEvent(state.data, enemy)) {
    const st = statsForRound(state, enemy.round);
    if (st) st.damageDealt += actual;
    const cur = currentStats(state);
    if (cur) cur.damageInRound += actual;
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

export function unitAttacks(state: GameState, events: GameEvent[]): void {
  runIncome(state);
  for (let slot = 0; slot < state.slots.length; slot++) {
    const unit = state.slots[slot];
    if (!unit) continue;
    runPeriodics(state, slot, events);
    if (unit.chargeTicks !== undefined && !unit.charged) {
      unit.chargeTicks--;
      if (unit.chargeTicks <= 0) unit.charged = true;
    }
    if (unit.cooldown > 0) { unit.cooldown--; continue; }
    const target = pickTarget(state, slot);
    if (!target) continue;
    const def = unitDefFast(state.data, unit.defId);
    unit.attackCount++;
    events.push({ type: 'attack', unitId: unit.id, enemyId: target.id });
    performAttack(state, slot, target, events);
    unit.cooldown = attackIntervalTicks(def.interval, speedBonus(state, slot)) - 1;
  }
}

export function resolveKills(state: GameState, events: GameEvent[], opts: { finalClear?: boolean } = {}): void {
  const finalClear = opts.finalClear ?? true;
  const b = state.data.balance;
  vulnKillExplosions(state, events);
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp > 0) { alive.push(e); continue; }
    events.push({ type: 'kill', enemyId: e.id });
    if (isShared(state.data, e)) continue;
    if (state.econ && econEventKill(state, e, events)) continue;
    if (e.boss) {
      state.coins += b.coins.boss;
      state.buckwheat += b.bossBuckwheat;
      const st = statsForRound(state, state.round);
      if (st) st.bossKillSeconds = (state.tick - state.roundStartTick) / TICKS_PER_SECOND;
      if (finalClear && state.round >= b.rounds) finishGame(state, { outcome: 'clear', reason: null, round: state.round }, events);
      if (state.econ) econBossKill(state, events);
    } else {
      state.coins += b.coins.perKill;
      if (state.econ) state.econ.roundKills++;
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
