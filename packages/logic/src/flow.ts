import type { Enemy, EnemyDef, GameData, GameEvent, GameResult, GameState, WaveDef } from './types';
import { enemyDef, enemyHp } from './data';
import { countNormalEnemies, currentStats, isShared } from './stats';
import { bossStunGate } from './bosscontrol';

export const TICKS_PER_SECOND = 20;
export const toTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

const enemyCache = new WeakMap<GameData, Map<string, EnemyDef>>();
export function enemyDefFast(data: GameData, id: string): EnemyDef {
  let m = enemyCache.get(data);
  if (!m) { m = new Map(data.enemies.map(e => [e.id, e])); enemyCache.set(data, m); }
  const e = m.get(id);
  if (!e) throw new Error(`unknown enemy ${id}`);
  return e;
}

export function waveOf(state: GameState, round: number): WaveDef {
  const w = state.data.waves.find(x => x.round === round);
  if (!w) throw new Error(`no wave for round ${round}`);
  return w;
}

export function startRound(state: GameState, round: number, events: GameEvent[]): void {
  const b = state.data.balance;
  const wave = waveOf(state, round);
  state.phase = 'round';
  state.round = round;
  state.roundStartTick = state.tick;
  state.roundEndTick = state.tick + toTicks(wave.type === 'boss' ? b.bossRoundSeconds : b.roundSeconds);
  state.spawned = 0;
  state.tokens += b.tokens.perRound;
  state.stats.push({ round, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: countNormalEnemies(state), endEnemies: 0, bossKillSeconds: null });
  events.push({ type: 'roundStart', round });
}

export function spawnEnemy(state: GameState, defId: string, round: number, events: GameEvent[]): Enemy {
  const def = enemyDef(state.data, defId);
  const hp = enemyHp(def, round, state.data.balance);
  const e: Enemy = {
    id: state.nextId++, defId, hp, maxHp: hp, d: 0, boss: def.boss, round,
    stunTicks: 0, slow: null, vulns: {}, dots: {}, fireHit: {},
  };
  state.enemies.push(e);
  if (!def.boss && !def.shared) {
    const st = currentStats(state);
    if (st) st.hpSpawned += hp;
  }
  events.push({ type: 'spawn', enemyId: e.id, defId });
  return e;
}

export function finishGame(state: GameState, result: GameResult, events: GameEvent[]): void {
  if (state.phase === 'ended') return;
  const st = currentStats(state);
  if (st) st.endEnemies = countNormalEnemies(state);
  state.phase = 'ended';
  state.result = result;
  events.push({ type: 'ended', result });
}

export function spawnTick(state: GameState, events: GameEvent[]): void {
  const b = state.data.balance;
  if (state.phase === 'prep') {
    if (state.tick >= toTicks(b.prepSeconds)) startRound(state, 1, events);
    else return;
  } else if (state.tick >= state.roundEndTick) {
    const wave = waveOf(state, state.round);
    if (wave.type === 'boss' && state.enemies.some(e => e.boss && e.hp > 0)) {
      finishGame(state, { outcome: 'defeat', reason: 'boss', round: state.round }, events);
      return;
    }
    payRoundEnd(state);
    if (state.round >= b.rounds) {
      finishGame(state, { outcome: 'clear', reason: null, round: state.round }, events);
      return;
    }
    startRound(state, state.round + 1, events);
  }
  spawnDue(state, events);
}

export function payRoundEnd(state: GameState): void {
  const st = currentStats(state);
  if (st) st.endEnemies = countNormalEnemies(state);
  state.coins += state.data.balance.coins.roundEnd;
}

export function spawnDue(state: GameState, events: GameEvent[]): void {
  const b = state.data.balance;
  const wave = waveOf(state, state.round);
  if (wave.type === 'boss') {
    if (state.spawned === 0) { spawnEnemy(state, wave.boss, state.round, events); state.spawned = 1; }
    return;
  }
  if (state.spawned < b.spawnCount && state.tick >= state.roundStartTick + state.spawned * toTicks(b.spawnIntervalSeconds)) {
    const id = wave.pattern[state.spawned % wave.pattern.length]!;
    spawnEnemy(state, id, state.round, events);
    state.spawned++;
  }
}

export function enemySpeed(state: GameState, e: Enemy): number {
  if (e.stunTicks > 0) return 0;
  return enemyDefFast(state.data, e.defId).speed * (1 - (e.slow?.pct ?? 0));
}

export function moveEnemies(state: GameState, events: GameEvent[] = []): void {
  const capped = state.data.balance.bossControl !== undefined;
  for (const e of state.enemies) {
    if (e.hp <= 0 || isShared(state.data, e)) continue;
    if (capped && e.boss) bossStunGate(state, e, events);
    e.d += enemySpeed(state, e) / TICKS_PER_SECOND;
  }
}

export function trackLimit(state: GameState): boolean {
  const b = state.data.balance;
  const n = countNormalEnemies(state);
  const st = currentStats(state);
  if (st && n > st.maxEnemies) st.maxEnemies = n;
  if (n > b.limit) state.overLimitTicks++;
  else state.overLimitTicks = 0;
  return state.overLimitTicks >= toTicks(b.limitSeconds);
}

export function checkEnd(state: GameState, events: GameEvent[]): void {
  if (state.phase !== 'round') return;
  if (trackLimit(state)) finishGame(state, { outcome: 'defeat', reason: 'limit', round: state.round }, events);
}
