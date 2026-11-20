import type { Command, GameData, GameEvent, GameState, RejectReason, StepResult } from './types';
import { createRng, deriveSeed } from './rng';
import { createLane, type Lane } from './lane';
import { checkEnd, moveEnemies, spawnTick } from './flow';

export type CommandHandler = (state: GameState, cmd: Command, events: GameEvent[]) => RejectReason | null;

const handlers: Partial<Record<Command['type'], CommandHandler>> = {};
const afterCommandHooks: ((state: GameState, events: GameEvent[]) => void)[] = [];
const phases: {
  tickStatuses: (state: GameState, events: GameEvent[]) => void;
  unitAttacks: (state: GameState, events: GameEvent[]) => void;
  resolveKills: (state: GameState, events: GameEvent[]) => void;
} = {
  tickStatuses: () => {},
  unitAttacks: () => {},
  resolveKills: (state) => { state.enemies = state.enemies.filter(e => e.hp > 0); },
};

export function registerCommand(type: Command['type'], handler: CommandHandler): void {
  handlers[type] = handler;
}
export function registerAfterCommands(hook: (state: GameState, events: GameEvent[]) => void): void {
  afterCommandHooks.push(hook);
}
export function registerPhase(name: keyof typeof phases, fn: (state: GameState, events: GameEvent[]) => void): void {
  phases[name] = fn;
}

const laneCache = new WeakMap<GameData, Lane>();
export function laneOf(state: GameState): Lane {
  let lane = laneCache.get(state.data);
  if (!lane) {
    lane = createLane(state.data.balance.grid.cols, state.data.balance.grid.rows);
    laneCache.set(state.data, lane);
  }
  return lane;
}

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

export function step(state: GameState, commands: Command[]): StepResult {
  const events: GameEvent[] = [];
  const rejected: StepResult['rejected'] = [];
  if (state.phase === 'ended') {
    for (const command of commands) rejected.push({ command, reason: 'ended' });
    return { events, rejected };
  }
  for (const command of commands) {
    const handler = handlers[command.type];
    const reason = handler ? handler(state, command, events) : 'unknown';
    if (reason) rejected.push({ command, reason });
  }
  for (const hook of afterCommandHooks) hook(state, events);
  spawnTick(state, events);
  if (!isEnded(state)) {
    moveEnemies(state);
    phases.tickStatuses(state, events);
    phases.unitAttacks(state, events);
    phases.resolveKills(state, events);
    checkEnd(state, events);
  }
  state.tick++;
  return { events, rejected };
}

function isEnded(state: GameState): boolean {
  return state.phase === 'ended';
}
