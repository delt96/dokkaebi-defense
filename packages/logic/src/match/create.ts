import type { GameData, GameState } from '../types';
import type { BossClock, MatchOptions, MatchState, SeatState } from './types';
import { createGame } from '../game';
import { deriveSeed } from '../rng';
import { canonicalJson, fnv1a } from '../hash';
import { roundStartTick } from './schedule';
import { bossRounds } from './seats';
import { createMatchEcon } from './econ';

const MAX_SEAT = 6;

export function laneSeed(seed: number, seat: number): number {
  return seat === 1 ? seed : deriveSeed(seed, 'pass:' + seat);
}

const freshBoss = (): BossClock => ({ status: 'pending', ticksLeft: 0, pausedTicks: 0, enemyId: null });

function freshSeat(seat: number, data: GameData): SeatState {
  const bosses: Record<number, BossClock> = {};
  for (const r of bossRounds(data)) bosses[r] = freshBoss();
  return {
    seat, alive: true, connected: true, disconnectTick: null,
    bosses,
    supportTokens: 0, receivedThisRound: false, supportSent: 0, supportReceived: 0,
    bestUnit: null, record: null,
    yeoksinDamage: (data.coop?.yeoksin ?? []).map(() => 0),
    lastSeq: 0,
  };
}

export function createMatch(data: GameData, seed: number, seats: number[], options: MatchOptions = {}): MatchState {
  if (!data.coop) throw new Error('createMatch needs stage 2 data (coop is missing)');
  if (seats.length === 0) throw new Error('createMatch needs at least one seat');
  for (const s of seats) if (!Number.isInteger(s) || s < 1 || s > MAX_SEAT) throw new Error(`bad seat ${s}`);
  if (new Set(seats).size !== seats.length) throw new Error('duplicate seat');
  const ring = [...seats].sort((a, b) => a - b);
  const lanes: Record<number, GameState> = {};
  const seatStates: Record<number, SeatState> = {};
  for (const s of ring) {
    lanes[s] = createGame(data, laneSeed(seed, s));
    seatStates[s] = freshSeat(s, data);
  }
  const match: MatchState = {
    data, dataVersion: fnv1a(canonicalJson(data, new Set())), seed, ring,
    tick: 0, phase: 'prep', round: 0, roundStartTick: 0, roundEndTick: roundStartTick(data, 1),
    lanes, seats: seatStates,
    yeoksin: null, yeoksinKills: 0, result: null, options,
  };
  if (data.economy) match.econ = createMatchEcon(seed);
  return match;
}

export function matchHash(match: MatchState): string {
  return fnv1a(canonicalJson(match));
}
