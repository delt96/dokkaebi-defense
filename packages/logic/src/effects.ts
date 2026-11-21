import type { DamageType, Effect, Enemy, GameEvent, GameState, HitEffect } from './types';
import { nextFloat } from './rng';
import { unitAttack } from './data';
import { dist, loopPos } from './lane';
import { registerPhase } from './registry';
import { laneOf } from './lane';
import { enemySpeed, toTicks } from './flow';
import { computeHitDamage, damageBonus, dealDamage, enemyResist, hitDamage, inRange } from './combat';
import { unitDefFast } from './units';
import { isShared } from './stats';

function auraSum(state: GameState, slot: number, pick: (e: Effect) => number): number {
  const lane = laneOf(state);
  const radius = state.data.balance.auraRadius;
  const me = lane.cells[slot]!;
  const seen = new Set<string>();
  let total = 0;
  for (let i = 0; i < state.slots.length; i++) {
    const u = state.slots[i];
    if (!u || i === slot || seen.has(u.defId)) continue;
    if (dist(me, lane.cells[i]!) > radius + 1e-9) continue;
    const def = unitDefFast(state.data, u.defId);
    let v = 0;
    for (const s of def.skills) if (s.trigger.kind === 'aura') for (const e of s.effects) v += pick(e);
    if (v) { total += v; seen.add(u.defId); }
  }
  return total;
}

export function speedBonus(state: GameState, slot: number): number {
  if (!state.slots[slot]) return 0;
  const v = auraSum(state, slot, e => (e.kind === 'auraAttackSpeed' ? e.pct : 0));
  const caps = state.data.balance.auraCaps;
  return caps ? Math.min(v, caps.attackSpeed) : v;
}

export function auraAttackPower(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!unit) return 0;
  const type = unitDefFast(state.data, unit.defId).damageType;
  const v = auraSum(state, slot, e => (e.kind === 'auraAttackPower' && (e.damageType === 'all' || e.damageType === type) ? e.pct : 0));
  const caps = state.data.balance.auraCaps;
  return caps ? Math.min(v, caps.attackPower) : v;
}

export function vulnOf(state: GameState, enemy: Enemy, damageType: DamageType): number {
  let v = 0;
  for (const key of Object.keys(enemy.vulns)) {
    const x = enemy.vulns[key]!;
    if (x.damageType === 'all' || x.damageType === damageType) v += x.pct * x.stacks;
  }
  const seen = new Set<string>();
  for (let i = 0; i < state.slots.length; i++) {
    const u = state.slots[i];
    if (!u || seen.has(u.defId)) continue;
    const def = unitDefFast(state.data, u.defId);
    for (const s of def.skills) {
      if (s.trigger.kind !== 'aura') continue;
      for (const e of s.effects) {
        if (e.kind === 'auraEnemyVuln' && inRange(state, i, enemy, def.range)) { v += e.pct; seen.add(u.defId); }
      }
    }
  }
  return Math.min(v, state.data.balance.vulnCap);
}

function emitSpeed(state: GameState, e: Enemy, events: GameEvent[]): void {
  events.push({ type: 'speedChange', enemyId: e.id, d: e.d, speed: enemySpeed(state, e) });
}

function ccTicks(state: GameState, e: Enemy, seconds: number): number {
  return toTicks(seconds * (e.boss ? state.data.balance.bossCcFactor : 1));
}

function applyStatus(state: GameState, slot: number, source: string, target: Enemy, eff: Effect, events: GameEvent[]): void {
  const b = state.data.balance;
  if (eff.kind === 'groundFire') {
    const def = unitDefFast(state.data, source);
    const center = loopPos(target.d, laneOf(state).perimeter);
    state.fires.push({
      source, from: center - eff.length / 2, to: center + eff.length / 2,
      basePerPulse: unitAttack(def, b) * eff.pulseMult * (1 + damageBonus(state, slot)),
      nextPulse: state.tick + toTicks(b.pulseSeconds), endTick: state.tick + toTicks(eff.seconds),
    });
    return;
  }
  if (target.hp <= 0) return;
  if ((eff.kind === 'stun' || eff.kind === 'slow' || eff.kind === 'knockback') && isShared(state.data, target)) return;
  switch (eff.kind) {
    case 'stun': {
      const t = ccTicks(state, target, eff.seconds);
      if (t > target.stunTicks) {
        const was = target.stunTicks;
        target.stunTicks = t;
        if (was === 0) emitSpeed(state, target, events);
      }
      break;
    }
    case 'slow': {
      const t = ccTicks(state, target, eff.seconds);
      if (!target.slow || eff.pct >= target.slow.pct) {
        target.slow = { pct: eff.pct, ticks: t };
        emitSpeed(state, target, events);
      }
      break;
    }
    case 'knockback': {
      const d = eff.distance * (target.boss ? b.bossCcFactor : 1);
      target.d = Math.max(0, target.d - d);
      emitSpeed(state, target, events);
      break;
    }
    case 'vuln': {
      const ticks = toTicks(eff.seconds);
      const cur = target.vulns[source];
      if (cur && eff.maxStacks) { cur.stacks = Math.min(cur.stacks + 1, eff.maxStacks); cur.ticks = ticks; }
      else if (cur) { cur.ticks = ticks; }
      else target.vulns[source] = { pct: eff.pct, damageType: eff.damageType, ticks, stacks: 1 };
      break;
    }
    case 'dot': {
      const total = hitDamage(state, slot, target, eff.mult);
      const pulses = Math.max(1, Math.round(eff.seconds / b.pulseSeconds));
      target.dots[source] = { remaining: total, pulsesLeft: pulses, nextPulse: state.tick + toTicks(b.pulseSeconds) };
      break;
    }
    default:
      break;
  }
}

export function performAttack(state: GameState, slot: number, target: Enemy, events: GameEvent[]): void {
  const unit = state.slots[slot]!;
  const def = unitDefFast(state.data, unit.defId);
  const lane = laneOf(state);
  const fired: Effect[] = [];
  for (const skill of def.skills) {
    const t = skill.trigger;
    if (t.kind === 'always') fired.push(...skill.effects);
    else if (t.kind === 'chance') { if (nextFloat(state.rng.combat) < t.p) fired.push(...skill.effects); }
    else if (t.kind === 'nth') { if (unit.attackCount % t.n === 0) fired.push(...skill.effects); }
  }

  let mult = 1;
  let effect: HitEffect | undefined;
  for (const e of fired) {
    if (e.kind === 'crit') { mult *= e.mult; effect = 'crit'; }
    if (e.kind === 'execute' && target.hp / target.maxHp <= e.hpBelow) { mult *= e.mult; effect = 'execute'; }
  }
  const explode = fired.find(e => e.kind === 'onKillExplode') as Extract<Effect, { kind: 'onKillExplode' }> | undefined;
  const killed: Enemy[] = [];
  const hit = (e: Enemy, m: number, track: boolean, hitEffect?: HitEffect) => {
    if (e.hp <= 0) return;
    dealDamage(state, e, hitDamage(state, slot, e, m), def.id, events, hitEffect);
    if (track && e.hp <= 0) killed.push(e);
  };

  hit(target, mult, true, effect);
  const origin = lane.pointAt(target.d);
  for (const e of fired) {
    if (e.kind === 'extraAttack') hit(target, 1, true);
    if (e.kind === 'splash') {
      for (const o of state.enemies) if (o !== target && dist(lane.pointAt(o.d), origin) <= e.radius + 1e-9) hit(o, e.mult, true);
    }
    if (e.kind === 'pierce') {
      for (const o of state.enemies) {
        if (o === target) continue;
        const gap = loopPos(target.d - o.d, lane.perimeter);
        if (gap > 1e-9 && gap <= e.length + 1e-9) hit(o, e.mult, true);
      }
    }
  }
  for (const e of fired) {
    if (e.kind === 'slow' && e.radius) {
      for (const o of state.enemies) if (dist(lane.pointAt(o.d), origin) <= e.radius + 1e-9) applyStatus(state, slot, def.id, o, e, events);
    } else applyStatus(state, slot, def.id, target, e, events);
  }
  if (explode) {
    for (const k of killed) {
      const at = lane.pointAt(k.d);
      for (const o of state.enemies) if (o.hp > 0 && dist(lane.pointAt(o.d), at) <= explode.radius + 1e-9) hit(o, explode.mult, false, 'explosion');
    }
  }
}

export function runPeriodics(state: GameState, slot: number, events: GameEvent[]): void {
  const unit = state.slots[slot]!;
  const def = unitDefFast(state.data, unit.defId);
  let k = 0;
  for (const skill of def.skills) {
    if (skill.trigger.kind !== 'periodic') continue;
    const idx = k++;
    if ((unit.periodic[idx] ?? 0) > 0) { unit.periodic[idx]!--; continue; }
    const targets = state.enemies.filter(e => e.hp > 0 && inRange(state, slot, e, def.range));
    if (!targets.length) { unit.periodic[idx] = 0; continue; }
    for (const eff of skill.effects) {
      if (eff.kind !== 'allInRange') continue;
      for (const e of targets) if (e.hp > 0) dealDamage(state, e, hitDamage(state, slot, e, eff.mult), def.id, events);
    }
    unit.periodic[idx] = toTicks(skill.trigger.seconds) - 1;
  }
}

function inFire(pos: number, from: number, to: number, perimeter: number): boolean {
  if (to - from >= perimeter) return true;
  return loopPos(pos - from, perimeter) <= to - from + 1e-9;
}

export function tickStatuses(state: GameState, events: GameEvent[]): void {
  const pulse = toTicks(state.data.balance.pulseSeconds);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (e.stunTicks > 0) { e.stunTicks--; if (e.stunTicks === 0) emitSpeed(state, e, events); }
    if (e.slow) { e.slow.ticks--; if (e.slow.ticks <= 0) { e.slow = null; emitSpeed(state, e, events); } }
    for (const key of Object.keys(e.vulns)) {
      const v = e.vulns[key]!;
      v.ticks--;
      if (v.ticks <= 0) delete e.vulns[key];
    }
    for (const key of Object.keys(e.dots)) {
      const d = e.dots[key]!;
      if (state.tick < d.nextPulse) continue;
      const amount = Math.round(d.remaining / d.pulsesLeft);
      d.remaining -= amount;
      if (amount > 0) dealDamage(state, e, amount, key, events);
      d.pulsesLeft--;
      d.nextPulse += pulse;
      if (d.pulsesLeft <= 0) delete e.dots[key];
      if (e.hp <= 0) break;
    }
  }

  const perimeter = laneOf(state).perimeter;
  for (const f of state.fires) {
    if (state.tick < f.nextPulse || f.nextPulse > f.endTick) continue;
    f.nextPulse += pulse;
    const type = unitDefFast(state.data, f.source).damageType;
    for (const e of state.enemies) {
      if (e.hp <= 0 || !inFire(loopPos(e.d, perimeter), f.from, f.to, perimeter)) continue;
      const last = e.fireHit[f.source];
      if (last !== undefined && state.tick - last < pulse) continue;
      e.fireHit[f.source] = state.tick;
      const amount = computeHitDamage({ attack: f.basePerPulse, mult: 1, bonus: 0, resist: enemyResist(state, e, type), vuln: vulnOf(state, e, type) });
      dealDamage(state, e, amount, f.source, events);
    }
  }
  state.fires = state.fires.filter(f => state.tick < f.endTick);
}

registerPhase('tickStatuses', tickStatuses);
