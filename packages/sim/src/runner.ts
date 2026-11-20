import { boardDps, createGame, step, unitDefFast, type Command, type GameData, type GameState } from '@dorandi/logic';
import type { Bot } from './bots';

export interface Snapshot { boardDps: number; coins: number; tokens: number; grades: number[] }
export interface Row {
  seed: number; bot: string; round: number; multiplier: number | null; endEnemies: number; maxEnemies: number;
  boardDps: number; coins: number; tokens: number; g1: number; g2: number; g3: number; g4: number;
  bossKillSeconds: number | null; outcome: string; endRound: number;
}

const snapshots = new WeakMap<GameState, Map<number, Snapshot>>();
const DECIDE_EVERY = 10;
const MAX_TICKS = 200_000;

function snapshot(state: GameState): Snapshot {
  const grades = [0, 0, 0, 0];
  for (const u of state.slots) if (u) grades[unitDefFast(state.data, u.defId).grade - 1]!++;
  return { boardDps: boardDps(state), coins: state.coins, tokens: state.tokens, grades };
}

export function runGame(data: GameData, seed: number, bot: Bot): GameState {
  const state = createGame(data, seed);
  const snaps = new Map<number, Snapshot>();
  snapshots.set(state, snaps);
  let last = snapshot(state);
  while (state.phase !== 'ended' && state.tick < MAX_TICKS) {
    const cmds: Command[] = state.tick % DECIDE_EVERY === 0 ? bot.decide(state) : [];
    const before = state.tick % DECIDE_EVERY === 0 ? snapshot(state) : last;
    last = before;
    const r = step(state, cmds);
    for (const e of r.events) if (e.type === 'roundStart' && e.round > 1) snaps.set(e.round - 1, before);
  }
  if (state.result) snaps.set(state.result.round, snapshot(state));
  return state;
}

export function roundRows(state: GameState, seed: number, bot: string): Row[] {
  const snaps = snapshots.get(state) ?? new Map<number, Snapshot>();
  return state.stats.map(st => {
    const s = snaps.get(st.round) ?? snapshot(state);
    return {
      seed, bot, round: st.round,
      multiplier: st.hpSpawned > 0 ? (s.boardDps * state.data.balance.roundSeconds) / st.hpSpawned : null,
      endEnemies: st.endEnemies, maxEnemies: st.maxEnemies,
      boardDps: s.boardDps, coins: s.coins, tokens: s.tokens,
      g1: s.grades[0]!, g2: s.grades[1]!, g3: s.grades[2]!, g4: s.grades[3]!,
      bossKillSeconds: st.bossKillSeconds,
      outcome: state.result?.outcome ?? 'unfinished', endRound: state.result?.round ?? state.round,
    };
  });
}

const COLUMNS: (keyof Row)[] = ['seed', 'bot', 'round', 'multiplier', 'endEnemies', 'maxEnemies', 'boardDps', 'coins', 'tokens', 'g1', 'g2', 'g3', 'g4', 'bossKillSeconds', 'outcome', 'endRound'];

export function toCsv(rows: Row[]): string {
  const fmt = (v: Row[keyof Row]) => (v === null ? '' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v));
  return [COLUMNS.join(','), ...rows.map(r => COLUMNS.map(c => fmt(r[c])).join(','))].join('\n');
}
