import type { Enemy, GameEvent, GameState, HuntSeat, HuntTargetDef, RejectReason } from '../types';
import { registerCommand } from '../registry';
import { spawnEnemy, toTicks } from '../flow';

// 격파: repeatable targets a player summons into their own lane. Each kill in time pays and raises the next level;
// running out of time just ends the visit. Every number comes from economy.json's `hunts` section.

const FRESH: HuntSeat = { level: 1, enemyId: null, deadlineTick: 0, readyTick: 0, last: null };

export function huntDef(state: GameState, enemy: string): HuntTargetDef | null {
  return state.data.economy?.hunts?.targets.find(t => t.enemy === enemy) ?? null;
}

/** This seat's record for a target (a fresh level-1 record when it was never summoned or the snapshot predates 격파). */
export function huntSeat(state: GameState, enemy: string): HuntSeat {
  return state.econ?.hunts?.[enemy] ?? FRESH;
}

export function huntHp(state: GameState, def: HuntTargetDef, level: number): number {
  return Math.round(def.hp * state.data.economy!.hunts!.hpGrowth ** (level - 1));
}

export function huntCoins(def: HuntTargetDef, level: number): number {
  return def.reward.coins + def.reward.coinsPerLevel * (level - 1);
}

/** Why a summon of `enemy` would be refused right now, in the order the screen explains it; null when it would go. */
export function huntCheck(state: GameState, enemy: string): RejectReason | null {
  const def = huntDef(state, enemy);
  if (!def || !state.econ) return 'noTarget';
  if (state.phase !== 'round' || state.round < def.fromRound) return 'huntClosed';
  const seat = huntSeat(state, enemy);
  if (seat.enemyId !== null) return 'huntOut';
  if (state.tick < seat.readyTick) return 'cooldown';
  if (state.coins < def.fee) return 'noCoins';
  return null;
}

function put(state: GameState, enemy: string, seat: HuntSeat): void {
  const econ = state.econ!;
  econ.hunts = { ...econ.hunts, [enemy]: seat };
}

registerCommand('hunt', (state, cmd, events) => {
  if (cmd.type !== 'hunt') return 'unknown';
  const reason = huntCheck(state, cmd.enemy);
  if (reason) return reason;
  const def = huntDef(state, cmd.enemy)!;
  const seat = huntSeat(state, cmd.enemy);
  state.coins -= def.fee;
  const e = spawnEnemy(state, def.enemy, Math.max(1, state.round), events, huntHp(state, def, seat.level));
  const hunts = state.data.economy!.hunts!;
  put(state, def.enemy, { ...seat, enemyId: e.id, deadlineTick: state.tick + toTicks(hunts.seconds) });
  return null;
});

function close(state: GameState, enemy: string, last: HuntSeat['last'], levelUp: boolean): HuntSeat {
  const seat = huntSeat(state, enemy);
  const cooldown = huntDef(state, enemy)?.cooldownSeconds ?? state.data.economy!.hunts!.cooldownSeconds;
  const next: HuntSeat = {
    level: seat.level + (levelUp ? 1 : 0), enemyId: null, deadlineTick: 0,
    readyTick: state.tick + toTicks(cooldown), last,
  };
  put(state, enemy, next);
  return next;
}

function huntOf(state: GameState, enemyId: number): string | null {
  const hunts = state.econ?.hunts;
  if (!hunts) return null;
  for (const [enemy, seat] of Object.entries(hunts)) if (seat.enemyId === enemyId) return enemy;
  return null;
}

/** Pays a 격파 kill and raises the level; returns false when `enemy` is not a living summon of this seat. */
export function huntKill(state: GameState, enemy: Enemy, events: GameEvent[]): boolean {
  const id = huntOf(state, enemy.id);
  if (!id) return false;
  const def = huntDef(state, id)!;
  const level = huntSeat(state, id).level;
  const coins = huntCoins(def, level);
  const buckwheat = def.reward.buckwheat;
  state.coins += coins;
  state.buckwheat += buckwheat;
  close(state, id, 'won', true);
  events.push({ type: 'hunt', enemy: id, level, outcome: 'won', coins, buckwheat });
  return true;
}

/** A tamed summon leaves without pay or a level; the cooldown still runs. */
export function huntTamed(state: GameState, enemyId: number): void {
  const id = huntOf(state, enemyId);
  if (id) close(state, id, 'tamed', false);
}

/** Time-outs: a summon past its deadline leaves without pay. A summon that vanished otherwise is closed quietly. */
export function huntsTick(state: GameState, events: GameEvent[]): void {
  const hunts = state.econ?.hunts;
  if (!hunts) return;
  for (const [enemy, seat] of Object.entries(hunts)) {
    if (seat.enemyId === null) continue;
    const i = state.enemies.findIndex(e => e.id === seat.enemyId);
    if (i < 0) { close(state, enemy, 'fled', false); continue; }
    if (state.enemies[i]!.hp <= 0 || state.tick < seat.deadlineTick) continue;
    state.enemies.splice(i, 1);
    events.push({ type: 'flee', enemyId: seat.enemyId });
    close(state, enemy, 'fled', false);
    events.push({ type: 'hunt', enemy, level: seat.level, outcome: 'fled', coins: 0, buckwheat: 0 });
  }
}

/** A fallen seat's lane is emptied: its summons are gone, levels stay for the record. */
export function huntsClear(state: GameState): void {
  const hunts = state.econ?.hunts;
  if (!hunts) return;
  for (const [enemy, seat] of Object.entries(hunts)) if (seat.enemyId !== null) put(state, enemy, { ...seat, enemyId: null, deadlineTick: 0 });
}
