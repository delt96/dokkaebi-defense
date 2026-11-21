import type { MatchEcon, MatchState, StepMatchResult } from './types';
import type { GameEvent } from '../types';
import { createRng, deriveSeed, nextInt } from '../rng';
import { countNormalEnemies } from '../stats';
import { waveOf } from '../flow';
import { grantQuestTokens } from '../econ/ledger';
import { spawnEventEnemy } from '../econ/events';
import { setQuest } from '../econ/results';

export function createMatchEcon(seed: number): MatchEcon {
  return {
    rng: createRng(deriveSeed(seed, 'econ')), team: { streak: 0, paid: false }, ssireumSeat: null,
  };
}

const laneEvents = (ctx: StepMatchResult, seat: number): GameEvent[] =>
  (ctx.lanes[seat] ??= { events: [], combatStart: 0, newFires: [] }).events;

const aliveSeats = (match: MatchState): number[] => match.ring.filter(s => match.seats[s]!.alive);

/** Round start: the ssireum draw among connected survivors. */
export function matchEconRoundStart(match: MatchState, ctx: StepMatchResult): void {
  const econ = match.econ!;
  const ss = match.data.economy?.ssireum;
  if (!ss || match.round !== ss.round) return;
  const candidates = aliveSeats(match).filter(s => match.seats[s]!.connected);
  if (candidates.length === 0) return;
  const seat = candidates[nextInt(econ.rng, candidates.length)]!;
  econ.ssireumSeat = seat;
  for (const s of aliveSeats(match)) setQuest(match.lanes[s]!, 'ssireum', s === seat ? 'active' : 'otherSeat', { winnerSeat: seat });
  spawnEventEnemy(match.lanes[seat]!, 'ssireum', laneEvents(ctx, seat));
  ctx.events.push({ type: 'ssireumDraw', seat });
}

/** Round end (after the survival checks): the team request night. */
export function matchEconRoundEnd(match: MatchState, ctx: StepMatchResult): void {
  const econ = match.econ!;
  const team = match.data.economy?.team;
  if (!team || econ.team.paid || match.round < team.fromRound || match.round > team.toRound) return;
  const alive = aliveSeats(match);
  if (alive.length === 0 || waveOf(match.lanes[alive[0]!]!, match.round).type !== 'normal') return;
  const total = alive.reduce((sum, s) => sum + countNormalEnemies(match.lanes[s]!), 0);
  econ.team.streak = total <= alive.length * team.perSurvivor ? econ.team.streak + 1 : 0;
  const progress = { remaining: total, survivors: alive.length, streak: econ.team.streak };
  if (econ.team.streak < team.nights) {
    const last = match.round === team.toRound;
    for (const s of alive) setQuest(match.lanes[s]!, 'team', last ? 'timedOut' : 'active', progress);
    return;
  }
  econ.team.paid = true;
  for (const s of alive) {
    if (!grantQuestTokens(match.lanes[s]!, team.tokens)) { setQuest(match.lanes[s]!, 'team', 'capped', progress); continue; }
    setQuest(match.lanes[s]!, 'team', 'won', progress, { tokens: team.tokens });
    laneEvents(ctx, s).push({ type: 'questReward', quest: 'team', coins: 0, buckwheat: 0, tokens: team.tokens });
  }
}
