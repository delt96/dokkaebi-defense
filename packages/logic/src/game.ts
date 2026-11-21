import type { Command, GameData, GameEvent, GameState, RejectReason, StepResult } from './types';
import { createRng, deriveSeed } from './rng';
import { createEcon } from './econ/ledger';
import { eventsTick } from './econ/events';
import { storyTick } from './econ/story';
import { econRoundEnd } from './econ/hooks';
import { checkEnd, moveEnemies, spawnTick } from './flow';
import { resolveKills } from './combat';
import { afterCommandHooks, handlers, phases, type PhaseName } from './registry';
import './units';
import './combine';
import './combat';
import './effects';
import './upgrades';
import './econ/market';
import './econ/quests';
import './econ/story';
import './econ/tame';

export { laneOf } from './lane';
export { registerAfterCommands, registerCommand, registerPhase } from './registry';

export function createGame(data: GameData, seed: number): GameState {
  const { cols, rows, initialOpenRows } = data.balance.grid;
  const total = cols * rows;
  const state: GameState = {
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
  if (data.economy) state.econ = createEcon(seed, data.economy);
  return state;
}

function runPhase(name: PhaseName, state: GameState, events: GameEvent[]): void {
  const fn = phases.get(name);
  if (!fn) throw new Error(`phase ${name} is not registered`);
  fn(state, events);
}

function isEnded(state: GameState): boolean {
  return state.phase === 'ended';
}

export function applyCommand(state: GameState, cmd: Command, events: GameEvent[]): RejectReason | null {
  const handler = typeof cmd?.type === 'string' ? handlers.get(cmd.type) : undefined;
  const reason = handler ? handler(state, cmd, events) : 'unknown';
  if (state.econ?.story.active) storyTick(state, events);
  return reason;
}

export function runAfterCommandHooks(state: GameState, events: GameEvent[]): void {
  for (const hook of afterCommandHooks) hook(state, events);
}

export function runCombat(state: GameState, events: GameEvent[], opts: { finalClear: boolean; afterMove?: () => void }): void {
  moveEnemies(state, events);
  opts.afterMove?.();
  runPhase('tickStatuses', state, events);
  runPhase('unitAttacks', state, events);
  resolveKills(state, events, { finalClear: opts.finalClear });
  if (state.econ?.story.active) storyTick(state, events);
}

export function step(state: GameState, commands: Command[]): StepResult {
  const events: GameEvent[] = [];
  const rejected: StepResult['rejected'] = [];
  if (isEnded(state)) {
    for (const command of commands) rejected.push({ command, reason: 'ended' });
    return { events, rejected };
  }
  if (state.econ) eventsTick(state, events);
  for (const command of commands) {
    const reason = applyCommand(state, command, events);
    if (reason) rejected.push({ command, reason });
  }
  runAfterCommandHooks(state, events);
  spawnTick(state, events);
  if (!isEnded(state)) {
    runCombat(state, events, { finalClear: true });
    checkEnd(state, events);
    if (state.econ && state.phase === 'round' && state.tick === state.roundEndTick - 1) econRoundEnd(state, events);
  }
  state.tick++;
  return { events, rejected };
}

export type { GameData };
