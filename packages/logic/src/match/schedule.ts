import type { GameData } from '../types';
import { toTicks } from '../flow';

const scheduleCache = new WeakMap<GameData, number[]>();

function schedule(data: GameData): number[] {
  let starts = scheduleCache.get(data);
  if (starts) return starts;
  const b = data.balance;
  starts = [0, toTicks(b.prepSeconds)];
  for (let r = 1; r <= b.rounds; r++) {
    const wave = data.waves.find(w => w.round === r);
    if (!wave) throw new Error(`no wave for round ${r}`);
    starts.push(starts[r]! + toTicks(wave.type === 'boss' ? b.bossRoundSeconds : b.roundSeconds));
  }
  scheduleCache.set(data, starts);
  return starts;
}

/** First tick of `round` (1-based). `rounds + 1` gives the tick at which the match runs out. */
export function roundStartTick(data: GameData, round: number): number {
  const starts = schedule(data);
  if (!Number.isInteger(round) || round < 1 || round >= starts.length) throw new Error(`no schedule for round ${round}`);
  return starts[round]!;
}

/** Round that contains `tick`; 0 during prep. */
export function roundAtTick(data: GameData, tick: number): number {
  const starts = schedule(data);
  let r = 0;
  for (let i = 1; i < starts.length - 1; i++) if (starts[i]! <= tick) r = i;
  return r;
}
