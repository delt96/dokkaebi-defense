import type { EconState, Enemy, GameEvent, GameState } from '../types';
import { spawnEnemy, toTicks } from '../flow';
import { questOutcome, setQuest } from './results';
import { huntKill, huntsTick } from './hunts';

export type EventKind = EconState['events'][number]['kind'];

/** Enemy id the economy uses for each event kind, or null when that section is off. */
export function eventEnemyId(state: GameState, kind: EventKind): string | null {
  const e = state.data.economy;
  if (kind === 'ssireum') return e?.ssireum?.enemy ?? null;
  return e?.shadow?.enemy ?? null;
}

export function eventKindOf(state: GameState, defId: string): EventKind | null {
  for (const kind of ['ssireum', 'shadow'] as const) if (eventEnemyId(state, kind) === defId) return kind;
  return null;
}

export function spawnEventEnemy(state: GameState, kind: EventKind, events: GameEvent[]): Enemy {
  const id = eventEnemyId(state, kind);
  if (!id) throw new Error(`event ${kind} is not in this economy`);
  const enemy = spawnEnemy(state, id, Math.max(1, state.round), events);
  state.econ!.events.push({ id: enemy.id, kind, spawnTick: state.tick, grown: false });
  if (kind === 'shadow') setQuest(state, 'shadow', 'active', { grown: false });
  if (kind === 'ssireum') setQuest(state, 'ssireum', 'active', { ...state.econ!.questResults.ssireum?.progress });
  return enemy;
}

function flee(state: GameState, enemyId: number, events: GameEvent[]): void {
  const i = state.enemies.findIndex(e => e.id === enemyId);
  if (i >= 0) {
    state.enemies.splice(i, 1);
    events.push({ type: 'flee', enemyId });
    const rec = state.econ!.events.find(r => r.id === enemyId);
    const quest = rec?.kind === 'shadow' ? 'shadow' : rec?.kind === 'ssireum' ? 'ssireum' : null;
    if (quest && questOutcome(state, quest) === 'active') {
      setQuest(state, quest, 'fled', { ...state.econ!.questResults[quest]!.progress, ...(quest === 'shadow' && { grown: rec!.grown }) });
    }
  }
}

/** Ssireum time-out, shadow growth and 격파 time-outs; drops records whose enemy is gone. */
export function eventsTick(state: GameState, events: GameEvent[]): void {
  huntsTick(state, events);
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

/** Every event enemy still alive at round end runs away without reward (a 격파 target keeps its own clock). */
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
  if (huntKill(state, enemy, events)) return;
  const econ = state.econ!;
  const eco = state.data.economy!;
  const i = econ.events.findIndex(r => r.id === enemy.id);
  const rec = i >= 0 ? econ.events.splice(i, 1)[0]! : null;
  const kind = rec?.kind ?? eventKindOf(state, enemy.defId);
  if (kind === 'ssireum' && eco.ssireum) {
    state.buckwheat += eco.ssireum.buckwheat;
    events.push({ type: 'questReward', quest: 'ssireum', coins: 0, buckwheat: eco.ssireum.buckwheat, tokens: 0 });
    setQuest(state, 'ssireum', 'won', { ...econ.questResults.ssireum?.progress }, { buckwheat: eco.ssireum.buckwheat });
  } else if (kind === 'shadow' && eco.shadow) {
    const coins = rec?.grown ? eco.shadow.grownCoins : eco.shadow.coins;
    state.coins += coins;
    setQuest(state, 'shadow', 'won', { grown: rec?.grown ?? false }, { coins });
  }
}
