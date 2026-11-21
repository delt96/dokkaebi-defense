import type { BossControlLog, Enemy, GameEvent, GameState } from './types';
import { enemySpeed, TICKS_PER_SECOND } from './flow';

function controlLog(state: GameState, e: Enemy): BossControlLog {
  if (!e.ctl) {
    e.ctl = {
      alive: 0, stopped: 0, stunLog: [], pushLog: [],
      stunClipped: 0, pushClipped: 0, entranceClipped: 0, pushApplied: 0, maxWindowStopped: 0,
    };
  }
  const cutoff = state.tick - state.data.balance.bossControl!.windowTicks;
  e.ctl.stunLog = e.ctl.stunLog.filter(t => t > cutoff);
  e.ctl.pushLog = e.ctl.pushLog.filter(([t]) => t > cutoff);
  return e.ctl;
}

/**
 * Runs before a lane boss moves: the tick counts as stopped only while the boss is inside both the
 * per-window stun budget and the lifetime stopped-share budget; otherwise the stun ends now.
 */
export function bossStunGate(state: GameState, e: Enemy, events: GameEvent[]): void {
  const bc = state.data.balance.bossControl!;
  const ctl = controlLog(state, e);
  ctl.alive += 1;
  if (e.stunTicks <= 0) return;
  if (ctl.stunLog.length < bc.stunTicks && ctl.stopped + 1 <= Math.floor(bc.maxStoppedShare * ctl.alive)) {
    ctl.stopped += 1;
    ctl.stunLog.push(state.tick);
    ctl.maxWindowStopped = Math.max(ctl.maxWindowStopped, ctl.stunLog.length);
    return;
  }
  ctl.stunClipped += e.stunTicks;
  e.stunTicks = 0;
  if (state.data.balance.extendedCombat) e.stunEndTick = state.tick;
  const speed = enemySpeed(state, e);
  events.push({ type: 'speedChange', enemyId: e.id, d: e.d + speed / TICKS_PER_SECOND, speed });
}

/** Pushes a lane boss back by at most what is left of the window budget and never past the entrance; returns the distance moved. */
export function applyBossKnockback(state: GameState, e: Enemy, distance: number): number {
  const bc = state.data.balance.bossControl!;
  const ctl = controlLog(state, e);
  const used = ctl.pushLog.reduce((a, [, d]) => a + d, 0);
  const allowed = Math.min(distance, Math.max(0, bc.pushDistance - used));
  ctl.pushClipped += distance - allowed;
  const actual = Math.min(allowed, Math.max(0, e.d));
  ctl.entranceClipped += allowed - actual;
  if (actual > 0) {
    e.d -= actual;
    ctl.pushLog.push([state.tick, actual]);
    ctl.pushApplied += actual;
  }
  return actual;
}
