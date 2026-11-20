import { chainHash, createGame, stateHash, step, type Command, type GameData } from '@dorandi/logic';
import { clumsyBot, normalBot } from './bots';

export interface GoldenResult { checkpoints: [number, string][]; events: string; final: string; ticks: number }

const DECIDE_EVERY = 10;
const MAX_TICKS = 200_000;

export function goldenRun(data: GameData, seed: number, botName: 'normal' | 'clumsy'): GoldenResult {
  const bot = botName === 'normal' ? normalBot() : clumsyBot(seed);
  const state = createGame(data, seed);
  const checkpoints: [number, string][] = [];
  let events = '';
  while (state.phase !== 'ended' && state.tick < MAX_TICKS) {
    const cmds: Command[] = state.tick % DECIDE_EVERY === 0 ? bot.decide(state) : [];
    const r = step(state, cmds);
    events = chainHash(events, [r.events, r.rejected]);
    if (state.tick % 100 === 0) checkpoints.push([state.tick, stateHash(state)]);
  }
  return { checkpoints, events, final: stateHash(state), ticks: state.tick };
}
