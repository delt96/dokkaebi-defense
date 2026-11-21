import type { EconState, Enemy, GameEvent, GameState } from '../types';
import { spawnEnemy, toTicks } from '../flow';

export type EventKind = EconState['events'][number]['kind'];

/** Enemy id the economy uses for each event kind, or null when that section is off. */
export function eventEnemyId(state: GameState, kind: EventKind): string | null {
  const e = state.data.economy;
  if (kind === 'beast') return e?.mission?.enemy ?? null;
  if (kind === 'ssireum') return e?.ssireum?.enemy ?? null;
  return e?.shadow?.enemy ?? null;
}

export function eventKindOf(state: GameState, defId: string): EventKind | null {
  for (const kind of ['beast', 'ssireum', 'shadow'] as const) if (eventEnemyId(state, kind) === defId) return kind;
  return null;
}

export function spawnEventEnemy(state: GameState, kind: EventKind, events: GameEvent[]): Enemy {
  const id = eventEnemyId(state, kind);
  if (!id) throw new Error(`event ${kind} is not in this economy`);
  const enemy = spawnEnemy(state, id, Math.max(1, state.round), events);
  state.econ!.events.push({ id: enemy.id, kind, spawnTick: state.tick, grown: false });
  return enemy;
}

function flee(state: GameState, enemyId: number, events: GameEvent[]): void {
  const i = state.enemies.findIndex(e => e.id === enemyId);
  if (i >= 0) {
    state.enemies.splice(i, 1);
    events.push({ type: 'flee', enemyId });
  }
}

/** Ssireum time-out and shadow growth; drops records whose enemy is gone. */
export function eventsTick(state: GameState, events: GameEvent[]): void {
  const econ = state.econ!;
  const eco = state.data.economy!;
  const keep: EconState['events'] = [];
  for (const rec of econ.events) {
    const enemy = state.enemies.find(e => e.id === rec.id && e.hp > 0);
    if (!enemy) {
      if (state.enemies.some(e => e.id === rec.id)) keep.push(rec);
      continue;
    }
    if (rec.kind === 'ssireum' && eco.ssireum && state.tick >= rec.spawnTick + toTicks(eco.ssireum.seconds)) {
      flee(state, rec.id, events);
      continue;
    }
    if (rec.kind === 'shadow' && eco.shadow && !rec.grown && state.tick >= rec.spawnTick + toTicks(eco.shadow.growSeconds)) {
      rec.grown = true;
      enemy.hp = enemy.maxHp = eco.shadow.grownHp;
      events.push({ type: 'grow', enemyId: enemy.id, hp: enemy.hp });
    }
    keep.push(rec);
  }
  econ.events = keep;
}

/** Every event enemy still alive at round end runs away without reward. */
export function eventsRoundEnd(state: GameState, events: GameEvent[]): void {
  const econ = state.econ!;
  for (const rec of econ.events) flee(state, rec.id, events);
  econ.events = [];
}

export function eventsRoundStart(state: GameState, events: GameEvent[]): void {
  const shadow = state.data.economy?.shadow;
  if (shadow && state.round === shadow.round) spawnEventEnemy(state, 'shadow', events);
}

/** Reward for a dead event enemy. */
export function eventKill(state: GameState, enemy: Enemy, events: GameEvent[]): void {
  const econ = state.econ!;
  const eco = state.data.economy!;
  const i = econ.events.findIndex(r => r.id === enemy.id);
  const rec = i >= 0 ? econ.events.splice(i, 1)[0]! : null;
  const kind = rec?.kind ?? eventKindOf(state, enemy.defId);
  if (kind === 'beast') {
    if (econ.mission.beastId === enemy.id) econ.mission.beastDown = true;
  } else if (kind === 'ssireum' && eco.ssireum) {
    state.buckwheat += eco.ssireum.buckwheat;
    events.push({ type: 'questReward', quest: 'ssireum', coins: 0, buckwheat: eco.ssireum.buckwheat, tokens: 0 });
  } else if (kind === 'shadow' && eco.shadow) {
    state.coins += rec?.grown ? eco.shadow.grownCoins : eco.shadow.coins;
  }
}
