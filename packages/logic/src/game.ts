import type { Command, GameData, GameEvent, GameState, StepResult } from './types';
import { createRng, deriveSeed } from './rng';
import { checkEnd, moveEnemies, spawnTick } from './flow';
import { afterCommandHooks, handlers, phases, type PhaseName } from './registry';
import './units';
import './combine';
import './combat';
import './effects';
import './upgrades';

export { laneOf } from './lane';
export { registerAfterCommands, registerCommand, registerPhase } from './registry';

export function createGame(data: GameData, seed: number): GameState {
  const { cols, rows, initialOpenRows } = data.balance.grid;
  const total = cols * rows;
  return {
    data, tick: 0, phase: 'prep',
    round: 0, roundStartTick: 0, roundEndTick: 0, spawned: 0,
    result: null,
    tokens: data.balance.tokens.start, coins: 0, buckwheat: 0,
    slots: Array.from({ length: total }, () => null),
    open: Array.from({ length: total }, (_, i) => i < initialOpenRows * cols),
    pendingPity: [], summonCounts: {}, grade1Summons: 0,
    enemies: [], fires: [],
    upgrades: { physical: 0, magical: 0, polish: 0, slots: 0 },
    overLimitTicks: 0, helperOpens: 0,
    stats: [],
    rng: { summon: createRng(deriveSeed(seed, 'summon')), combat: createRng(deriveSeed(seed, 'combat')) },
    nextId: 1,
  };
}

function runPhase(name: PhaseName, state: GameState, events: GameEvent[]): void {
  const fn = phases.get(name);
  if (!fn) throw new Error(`phase ${name} is not registered`);
  fn(state, events);
}

function isEnded(state: GameState): boolean {
  return state.phase === 'ended';
}

export function step(state: GameState, commands: Command[]): StepResult {
  const events: GameEvent[] = [];
  const rejected: StepResult['rejected'] = [];
  if (isEnded(state)) {
    for (const command of commands) rejected.push({ command, reason: 'ended' });
    return { events, rejected };
  }
  for (const command of commands) {
    const handler = typeof command?.type === 'string' ? handlers.get(command.type) : undefined;
    const reason = handler ? handler(state, command, events) : 'unknown';
    if (reason) rejected.push({ command, reason });
  }
  for (const hook of afterCommandHooks) hook(state, events);
  spawnTick(state, events);
  if (!isEnded(state)) {
    moveEnemies(state);
    runPhase('tickStatuses', state, events);
    runPhase('unitAttacks', state, events);
    runPhase('resolveKills', state, events);
    checkEnd(state, events);
  }
  state.tick++;
  return { events, rejected };
}

export type { GameData };
