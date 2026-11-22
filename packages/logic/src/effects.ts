import type { DamageType, Effect, Enemy, GameEvent, GameState, HitEffect, StatusArea, UnitDef } from './types';
import type { Vec2 } from './lane';
import { nextFloat } from './rng';
import { unitAttack } from './data';
import { dist, loopPos } from './lane';
import { registerPhase } from './registry';
import { cellDistance, laneOf } from './lane';
import { enemySpeed, toTicks } from './flow';
import { computeHitDamage, damageBonus, dealDamage, hitDamage, hitTerms, inRange, pickTarget } from './combat';
import { unitDefFast } from './units';
import { isEvent, isShared } from './stats';
import { payFirstHit } from './income';
import { applyBossKnockback } from './bosscontrol';

/** Auras of the same source and kind count once; the source defaults to the unit's own id. */
function auraKey(defId: string, e: Effect): string {
  return `${('source' in e && e.source) || defId}:${e.kind}`;
}

function auraSum(state: GameState, slot: number, pick: (e: Effect) => number): number {
  const lane = laneOf(state);
  const radius = state.data.balance.auraRadius;
  const seen = new Set<string>();
  let total = 0;
  for (let i = 0; i < state.slots.length; i++) {
    const u = state.slots[i];
    if (!u || i === slot) continue;
    if (cellDistance(lane, slot, i) > radius + 1e-9) continue;
    const def = unitDefFast(state.data, u.defId);
    for (const s of def.skills) {
      if (s.trigger.kind !== 'aura') continue;
      for (const e of s.effects) {
        const v = pick(e);
        if (!v) continue;
        const key = auraKey(def.id, e);
        if (seen.has(key)) continue;
        seen.add(key);
        total += v;
      }
    }
  }
  return total;
}

export function speedBonus(state: GameState, slot: number): number {
  const unit = state.slots[slot];
  if (!unit) return 0;
  const type = unitDefFast(state.data, unit.defId).damageType;
  const v = auraSum(state, slot, e => (e.kind === 'auraAttackSpeed' && (!e.damageType || e.damageType === type) ? e.pct : 0));
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
    if (!u) continue;
    const def = unitDefFast(state.data, u.defId);
    for (const s of def.skills) {
      if (s.trigger.kind !== 'aura') continue;
      for (const e of s.effects) {
        if (e.kind !== 'auraEnemyVuln' || (e.damageType && e.damageType !== damageType)) continue;
        const key = auraKey(def.id, e);
        if (seen.has(key) || !inRange(state, i, enemy, def.range)) continue;
        v += e.pct;
        seen.add(key);
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
    const from = eff.align === 'ahead' ? center : eff.align === 'behind' ? center - eff.length : center - eff.length / 2;
    state.fires.push({
      source, from, to: eff.align === 'ahead' || eff.align === 'behind' ? from + eff.length : center + eff.length / 2,
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
        // a whole-lane slow refreshes many enemies at once: only a change of speed is sent
        const before = b.wholeLaneSlow ? enemySpeed(state, target) : NaN;
        target.slow = { pct: eff.pct, ticks: t };
        if (enemySpeed(state, target) !== before) emitSpeed(state, target, events);
      }
      break;
    }
    case 'knockback': {
      const d = eff.distance * (target.boss ? b.bossCcFactor : 1);
      const before = target.d;
      if (b.bossControl && target.boss) applyBossKnockback(state, target, d);
      else target.d = Math.max(0, target.d - d);
      if (b.extendedCombat && target.d < before) target.knockedRound = state.round;
      emitSpeed(state, target, events);
      break;
    }
    case 'vuln': {
      const ticks = toTicks(eff.seconds);
      const key = eff.source ?? source;
      const cur = target.vulns[key];
      if (cur && eff.maxStacks) { cur.stacks = Math.min(cur.stacks + 1, eff.maxStacks); cur.ticks = ticks; }
      else if (cur) { cur.ticks = ticks; }
      else target.vulns[key] = { pct: eff.pct, damageType: eff.damageType, ticks, stacks: 1 };
      const def = unitDefFast(state.data, source);
      if (def.skills.some(s => s.effects.some(x => x.kind === 'onVulnKillExplode'))) {
        target.vulnCaster = { unitId: state.slots[slot]!.id, attack: unitAttack(def, b) * (1 + damageBonus(state, slot)), key };
      }
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

/**
 * Lands `eff` on `targets`. With wholeLaneSlow a slow that meets any non-shared enemy goes to every enemy in the lane
 * instead (applyStatus still passes over shared visits), its pct scaled by pctFactor.
 */
function landStatus(state: GameState, slot: number, source: string, targets: Enemy[], eff: Effect, events: GameEvent[]): void {
  const whole = state.data.balance.wholeLaneSlow;
  if (eff.kind === 'slow' && whole) {
    if (!targets.some(o => !isShared(state.data, o))) return;
    const scaled = { ...eff, pct: eff.pct * whole.pctFactor };
    for (const o of state.enemies) applyStatus(state, slot, source, o, scaled, events);
    return;
  }
  for (const o of targets) applyStatus(state, slot, source, o, eff, events);
}

/** A basic hit landed from `slot`: neighbours with a neighbour-hit trigger count it and fire on the last count. */
function countNeighborHit(state: GameState, slot: number, target: Enemy, events: GameEvent[]): void {
  const lane = laneOf(state);
  const radius = state.data.balance.auraRadius;
  for (let i = 0; i < state.slots.length; i++) {
    const u = state.slots[i];
    if (!u || i === slot || cellDistance(lane, slot, i) > radius + 1e-9) continue;
    for (const skill of unitDefFast(state.data, u.defId).skills) {
      const t = skill.trigger;
      if (t.kind !== 'neighborHits') continue;
      if (state.tick < (u.neighborLockUntil ?? 0)) continue;
      u.neighborHits = (u.neighborHits ?? 0) + 1;
      if (u.neighborHits < t.count) continue;
      u.neighborHits = 0;
      u.neighborLockUntil = state.tick + toTicks(t.lockoutSeconds);
      applyPackage(state, i, target, skill.effects, { basic: false, mult: 1 }, events);
    }
  }
}

/** Kill step: a weakened enemy that dies explodes with the stored attack of the unit that last weakened it. */
export function vulnKillExplosions(state: GameState, events: GameEvent[]): void {
  const lane = laneOf(state);
  for (const dead of state.enemies) {
    const caster = dead.vulnCaster;
    if (dead.hp > 0 || !caster) continue;
    delete dead.vulnCaster;
    if (!dead.vulns[caster.key]) continue;
    const unit = state.slots.find(u => u?.id === caster.unitId);
    if (!unit || state.tick < (unit.explodeReadyTick ?? 0)) continue;
    const def = unitDefFast(state.data, unit.defId);
    const eff = def.skills.flatMap(s => s.effects).find(e => e.kind === 'onVulnKillExplode');
    if (eff?.kind !== 'onVulnKillExplode') continue;
    unit.explodeReadyTick = state.tick + toTicks(eff.cooldownSeconds);
    const at = lane.pointAt(dead.d);
    for (const o of state.enemies) {
      if (o.hp <= 0 || dist(lane.pointAt(o.d), at) > eff.radius + 1e-9) continue;
      const amount = computeHitDamage({ attack: caster.attack, mult: eff.mult, bonus: 0, ...hitTerms(state, o, def.damageType) });
      dealDamage(state, o, amount, def.id, events, 'explosion');
      if (o.hp <= 0) delete o.vulnCaster;
    }
  }
}

function tracksStreak(def: UnitDef): boolean {
  return def.skills.some(s => s.trigger.kind === 'streak' || s.effects.some(e => e.kind === 'rampCrit'));
}

/** Bounces from the last enemy hit to the best-ranked unhit enemy within `range`, at most `maxBounces` times. */
function chainHits(state: GameState, first: Enemy, e: Extract<Effect, { kind: 'chain' }>, hit: (o: Enemy, mult: number) => void): void {
  const lane = laneOf(state);
  const done = new Set<Enemy>([first]);
  let prev = first;
  for (let n = 0; n < e.maxBounces; n++) {
    const at = lane.pointAt(prev.d);
    let best: Enemy | null = null;
    let bestRank = 3;
    for (const o of state.enemies) {
      if (o.hp <= 0 || done.has(o) || dist(lane.pointAt(o.d), at) > e.range + 1e-9) continue;
      const rank = o.boss || isEvent(state.data, o) ? 0 : isShared(state.data, o) ? 1 : 2;
      if (!best || rank < bestRank || (rank === bestRank && o.id < best.id)) { best = o; bestRank = rank; }
    }
    if (!best) return;
    done.add(best);
    hit(best, e.mult);
    prev = best;
  }
}

const AREA_KINDS = new Set<Effect['kind']>(['stun', 'slow', 'knockback', 'vuln', 'dot']);

/** Who a status lands on: everyone within `radius` of the hit, everyone this hit damaged (`area`), or the target. */
function statusTargets(state: GameState, e: Effect, target: Enemy, origin: Vec2, struck: Set<Enemy>): Enemy[] {
  if (!AREA_KINDS.has(e.kind)) return [target];
  const a = e as StatusArea;
  if (a.radius) {
    const lane = laneOf(state);
    return state.enemies.filter(o => dist(lane.pointAt(o.d), origin) <= a.radius! + 1e-9);
  }
  if (a.area === 'hit') return state.enemies.filter(o => struck.has(o));
  if (a.area === 'others') return state.enemies.filter(o => o !== target && struck.has(o));
  return [target];
}

export function performAttack(state: GameState, slot: number, target: Enemy, events: GameEvent[]): void {
  const unit = state.slots[slot]!;
  const def = unitDefFast(state.data, unit.defId);
  if (tracksStreak(def)) {
    const st = unit.streak;
    unit.streak = st && st.enemyId === target.id ? { enemyId: target.id, count: st.count + 1 } : { enemyId: target.id, count: 1 };
  }
  const fired: Effect[] = [];
  for (const skill of def.skills) {
    const t = skill.trigger;
    if (t.kind === 'always') fired.push(...skill.effects);
    else if (t.kind === 'chance') { if (nextFloat(state.rng.combat) < t.p) fired.push(...skill.effects); }
    else if (t.kind === 'nth') { if (unit.attackCount % t.n === (t.phase ?? 0)) fired.push(...skill.effects); }
    else if (t.kind === 'charge') {
      if (unit.charged) { fired.push(...skill.effects); unit.charged = false; unit.chargeTicks = toTicks(t.seconds); }
    }
    else if (t.kind === 'streak') { if (unit.streak && unit.streak.count % t.n === 0) fired.push(...skill.effects); }
    else if (t.kind === 'targetHpBelow') { if (target.hp / target.maxHp <= t.pct) fired.push(...skill.effects); }
    else if (t.kind === 'targetSlowed') { if (target.slow) fired.push(...skill.effects); }
  }

  let mult = 1;
  let effect: HitEffect | undefined;
  for (const e of fired) {
    if (e.kind === 'crit') { mult *= e.mult; effect = 'crit'; }
    if (e.kind === 'execute' && target.hp / target.maxHp <= e.hpBelow) { mult *= e.mult; effect = 'execute'; }
    if (e.kind === 'rampCrit' && unit.streak) mult *= Math.min(e.max, 1 + e.step * (unit.streak.count - 1));
  }
  applyPackage(state, slot, target, fired, { basic: true, mult, effect }, events);
}

/**
 * Applies one hit package to `target`: the basic hit (when `basic`), extra damage in `fired` order,
 * on-hit damage (basic only), statuses, then kill explosions.
 */
export function applyPackage(
  state: GameState, slot: number, target: Enemy, fired: Effect[],
  opts: { basic: boolean; mult: number; effect?: HitEffect }, events: GameEvent[],
): void {
  const unit = state.slots[slot]!;
  const def = unitDefFast(state.data, unit.defId);
  const lane = laneOf(state);
  const explode = fired.find(e => e.kind === 'onKillExplode') as Extract<Effect, { kind: 'onKillExplode' }> | undefined;
  const executed = opts.basic && fired.some(e => e.kind === 'execute' && target.hp / target.maxHp <= e.hpBelow);
  const killed: Enemy[] = [];
  const struck = new Set<Enemy>();
  const hit = (e: Enemy, m: number, track: boolean, hitEffect?: HitEffect, mark = true) => {
    if (e.hp <= 0) return;
    dealDamage(state, e, hitDamage(state, slot, e, m), def.id, events, hitEffect);
    if (mark) struck.add(e);
    if (track && e.hp <= 0) killed.push(e);
  };

  if (opts.basic) {
    hit(target, opts.mult, true, opts.effect);
    countNeighborHit(state, slot, target, events);
  }
  const executeKill = executed && target.hp <= 0;
  const origin = lane.pointAt(target.d);
  for (const e of fired) {
    if (e.kind === 'extraAttack') hit(target, 1, true);
    if (e.kind === 'strike') hit(target, e.mult, true);
    if (e.kind === 'splash') {
      const radius = opts.basic && e.radiusCycle?.length ? e.radiusCycle[(unit.attackCount - 1) % e.radiusCycle.length]! : e.radius;
      let m = e.mult;
      if (e.stunnedBonus) {
        const end = target.stunEndTick;
        if (target.stunTicks > 0 || (end !== undefined && state.tick - end < toTicks(e.stunnedBonus.graceSeconds))) m *= e.stunnedBonus.mult;
      }
      for (const o of state.enemies) if (o !== target && dist(lane.pointAt(o.d), origin) <= radius + 1e-9) hit(o, m, true);
    }
    if (e.kind === 'pierce') {
      for (const o of state.enemies) {
        if (o === target) continue;
        const behind = loopPos(target.d - o.d, lane.perimeter);
        const ahead = loopPos(o.d - target.d, lane.perimeter);
        const within = (g: number) => g > 1e-9 && g <= e.length + 1e-9;
        if (!within(behind) && !(e.both && within(ahead))) continue;
        hit(o, e.knockedBonus && o.knockedRound === state.round ? e.mult * e.knockedBonus : e.mult, true);
      }
    }
    if (e.kind === 'chain') chainHits(state, target, e, (o, m) => hit(o, m, true));
    if (e.kind === 'coinOnFirstHit' && opts.basic) payFirstHit(state, def.id, e.coins);
  }
  const extra = opts.basic ? def.onBasicHit : undefined;
  if (extra) {
    if (extra.targetPct > 0) hit(target, extra.targetPct, false, undefined, false);
    if (extra.splashPct > 0) {
      const r = state.data.balance.onBasicHitRadius ?? 0;
      for (const o of state.enemies) if (o !== target && dist(lane.pointAt(o.d), origin) <= r + 1e-9) hit(o, extra.splashPct, false, undefined, false);
    }
  }
  for (const e of fired) landStatus(state, slot, def.id, statusTargets(state, e, target, origin, struck), e, events);
  if (explode && (!explode.requireExecute || executeKill)) {
    for (const k of explode.requireExecute ? [target] : killed) {
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
    if (!skill.effects.some(e => e.kind === 'allInRange')) {
      const target = pickTarget(state, slot);
      if (!target) { unit.periodic[idx] = 0; continue; }
      applyPackage(state, slot, target, skill.effects, { basic: false, mult: 1 }, events);
      unit.periodic[idx] = toTicks(skill.trigger.seconds) - 1;
      continue;
    }
    const targets = state.enemies.filter(e => e.hp > 0 && inRange(state, slot, e, def.range));
    if (!targets.length) { unit.periodic[idx] = 0; continue; }
    const damaged: Enemy[] = [];
    for (const eff of skill.effects) {
      if (eff.kind !== 'allInRange') continue;
      for (const e of targets) {
        if (e.hp <= 0) continue;
        dealDamage(state, e, hitDamage(state, slot, e, eff.mult), def.id, events);
        damaged.push(e);
      }
    }
    for (const eff of skill.effects) {
      if (eff.kind !== 'stun' && eff.kind !== 'slow' && eff.kind !== 'dot' && eff.kind !== 'vuln') continue;
      landStatus(state, slot, def.id, damaged, eff, events);
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
    if (e.stunTicks > 0) {
      e.stunTicks--;
      if (e.stunTicks === 0) {
        if (state.data.balance.extendedCombat) e.stunEndTick = state.tick;
        emitSpeed(state, e, events);
      }
    }
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
      const amount = computeHitDamage({ attack: f.basePerPulse, mult: 1, bonus: 0, ...hitTerms(state, e, type) });
      dealDamage(state, e, amount, f.source, events);
    }
  }
  state.fires = state.fires.filter(f => state.tick < f.endTick);
}

registerPhase('tickStatuses', tickStatuses);
