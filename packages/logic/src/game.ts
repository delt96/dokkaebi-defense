import type { Command, Difficulty, GameData, GameEvent, GameState, RejectReason, StepResult } from './types';
import { createRng, deriveSeed } from './rng';
import { createEcon } from './econ/ledger';
import { difficultyData } from './difficulty';
import { eventsTick } from './econ/events';
import { econRoundEnd } from './econ/hooks';
import { checkEnd, moveEnemies, spawnTick } from './flow';
import { resolveKills } from './combat';
import { afterCommandHooks, handlers, phases, type PhaseName } from './registry';
import './units';
import './combine';
import './storage';
import './combat';
import './effects';
import './upgrades';
import './econ/market';
import './econ/jige';
import './econ/quests';
import './econ/tame';
import './econ/hunts';

export { laneOf } from './lane';
export { registerAfterCommands, registerCommand, registerPhase } from './registry';

export function createGame(data: GameData, seed: number, difficulty?: Difficulty): GameState {
  data = difficultyData(data, difficulty);
  const { cols, rows, initialOpenRows } = data.balance.grid;
  const total = cols * rows;
  const state: GameState = {
    data, tick: 0, phase: 'prep',
    round: 0, roundStartTick: 0, roundEndTick: 0, spawned: 0,
    result: null,
    tokens: data.balance.tokens.start, coins: 0, buckwheat: data.economy?.startingBuckwheat ?? 0,
    slots: Array.from({ length: total }, () => null),
    open: Array.from({ length: total }, (_, i) => i < initialOpenRows * cols),
    summonCounts: {}, grade1Summons: 0,
    enemies: [], fires: [],
    upgrades: { physical: 0, magical: 0, polish: 0 },
    overLimitTicks: 0, helperOpens: 0,
    stats: [],
    rng: { summon: createRng(deriveSeed(seed, 'summon')), combat: createRng(deriveSeed(seed, 'combat')) },
    nextId: 1,
  };
  if (data.balance.difficulties) state.difficulty = difficulty ?? data.balance.defaultDifficulty!;
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

const isSlotIndex = (lane: GameState, i: unknown): i is number =>
  typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < lane.slots.length;

function staleUnit(lane: GameState, cmd: Command): boolean {
  if (cmd.type === 'move') {
    if (cmd.unitId !== undefined && isSlotIndex(lane, cmd.from) && lane.slots[cmd.from]?.id !== cmd.unitId) return true;
    if (cmd.toUnitId !== undefined && isSlotIndex(lane, cmd.to) && (lane.slots[cmd.to]?.id ?? null) !== cmd.toUnitId) return true;
    return false;
  }
  if (cmd.type === 'sell' || cmd.type === 'store' || cmd.type === 'attachItem' || (cmd.type === 'combine' && cmd.slot !== undefined)) {
    return cmd.unitId !== undefined && lane.slots[cmd.slot!]?.id !== cmd.unitId;
  }
  return false;
}

export function applyCommand(state: GameState, cmd: Command, events: GameEvent[]): RejectReason | null {
  if (cmd && staleUnit(state, cmd)) return 'staleUnit';
  const handler = typeof cmd?.type === 'string' ? handlers.get(cmd.type) : undefined;
  const reason = handler ? handler(state, cmd, events) : 'unknown';
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
