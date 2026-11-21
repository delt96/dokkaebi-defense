import type { MatchCommand, MatchEcon, MatchEvent, MatchInput, MatchState, StepMatchResult, TransferOffer } from './types';
import type { GameEvent, RejectReason } from '../types';
import { createRng, deriveSeed, nextInt } from '../rng';
import { countNormalEnemies } from '../stats';
import { toTicks, waveOf } from '../flow';
import { addUnit, unitDefFast } from '../units';
import { grantQuestTokens } from '../econ/ledger';
import { spawnEventEnemy } from '../econ/events';

export function createMatchEcon(seed: number): MatchEcon {
  return {
    rng: createRng(deriveSeed(seed, 'econ')), team: { streak: 0, paid: false }, ssireumSeat: null,
    nextOfferId: 1, offers: [], readyRound: {}, rewarded: [],
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
  if (econ.team.streak < team.nights) return;
  econ.team.paid = true;
  for (const s of alive) {
    if (!grantQuestTokens(match.lanes[s]!, team.tokens)) continue;
    laneEvents(ctx, s).push({ type: 'questReward', quest: 'team', coins: 0, buckwheat: 0, tokens: team.tokens });
  }
}

export const TRANSFER_COMMANDS: ReadonlySet<string> = new Set(['transferOffer', 'transferAccept', 'transferDecline']);

type TransferEnd = Extract<MatchEvent, { type: 'transferEnd' }>;

/** `defId` is passed when the unit has already left the sender's board (an accepted offer). */
function endOffer(
  match: MatchState, offer: TransferOffer, outcome: TransferEnd['outcome'], ctx: StepMatchResult,
  why: { by?: number; cause?: TransferEnd['cause']; defId?: string } = {},
): void {
  const econ = match.econ!;
  econ.offers = econ.offers.filter(o => o !== offer);
  const unit = match.lanes[offer.from]?.slots.find(u => u?.id === offer.unitId);
  if (unit) {
    delete unit.locked;
    const lane = match.lanes[offer.from]!;
  }
  ctx.events.push({
    type: 'transferEnd', from: offer.from, to: offer.to, defId: why.defId ?? unit?.defId ?? '', outcome,
    by: why.by ?? null, cause: why.cause ?? null,
  });
}

/** Ends every open offer that `seat` takes part in (it was eliminated or lost its connection). */
export function dropOffersOf(match: MatchState, seat: number, cause: 'eliminated' | 'disconnected', ctx: StepMatchResult): void {
  for (const o of [...match.econ!.offers]) if (o.from === seat || o.to === seat) endOffer(match, o, 'invalid', ctx, { by: seat, cause });
}

/** Before player commands: offers whose seats dropped out end as invalid, old ones expire. */
export function transferStep(match: MatchState, ctx: StepMatchResult): void {
  const def = match.data.economy?.transfer;
  for (const o of [...match.econ!.offers]) {
    const ok = (s: number) => match.seats[s]!.alive && match.seats[s]!.connected;
    const out = !ok(o.from) ? o.from : !ok(o.to) ? o.to : null;
    if (out !== null) endOffer(match, o, 'invalid', ctx, { by: out, cause: match.seats[out]!.alive ? 'disconnected' : 'eliminated' });
    else if (def && ctx.tick >= o.tick + toTicks(def.offerSeconds)) endOffer(match, o, 'expired', ctx);
  }
}

const involved = (match: MatchState, seat: number): TransferOffer | undefined =>
  match.econ!.offers.find(o => o.from === seat || o.to === seat);

function offer(match: MatchState, from: number, cmd: Extract<MatchCommand, { type: 'transferOffer' }>, ctx: StepMatchResult): RejectReason | null {
  const def = match.data.economy!.transfer!;
  const econ = match.econ!;
  const lane = match.lanes[from]!;
  if (!lane.econ?.jige) return 'noJige';
  const unit = Number.isInteger(cmd.slot) ? lane.slots[cmd.slot] : undefined;
  if (!unit || unit.id !== cmd.unitId) return 'staleUnit';
  const unitDef = unitDefFast(match.data, unit.defId);
  if (unitDef.hidden || unitDef.grade > def.maxGrade || unit.delivered) return 'badArgs';
  const target = cmd.target;
  if (target === from || !match.ring.includes(target) || !match.seats[target]!.alive) return 'targetNotAlive';
  if (!match.seats[target]!.connected) return 'targetAway';
  if (involved(match, from)) return 'busy';
  if (involved(match, target)) return 'targetBusy';
  if (match.round < (econ.readyRound[from] ?? 0) || match.round < (econ.readyRound[target] ?? 0)) return 'cooldown';
  unit.locked = true;
  econ.offers.push({ offerId: econ.nextOfferId++, from, to: target, slot: cmd.slot, unitId: unit.id, tick: ctx.tick });
  ctx.events.push({ type: 'transferOffer', from, to: target, defId: unit.defId, tick: ctx.tick });
  return null;
}

function accept(match: MatchState, seat: number, offerId: number, slot: number, ctx: StepMatchResult): RejectReason | null {
  const def = match.data.economy!.transfer!;
  const econ = match.econ!;
  const o = econ.offers.find(x => x.to === seat && x.offerId === offerId);
  if (!o) return 'noOffer';
  const to = match.lanes[seat]!;
  if (!Number.isInteger(slot) || slot < 0 || slot >= to.slots.length || !to.open[slot] || to.slots[slot]) return 'noSlot';
  const from = match.lanes[o.from]!;
  const unit = from.slots[o.slot];
  if (!unit || unit.id !== o.unitId) {
    endOffer(match, o, 'invalid', ctx, { by: o.from, cause: 'unitGone' });
    return 'staleUnit';
  }
  from.slots[o.slot] = null;
  const moved = addUnit(to, unit.defId, slot, laneEvents(ctx, seat));
  if (unit.cost !== undefined) moved.cost = unit.cost;
  moved.delivered = true;
  laneEvents(ctx, seat).push({ type: 'summon', unitId: moved.id, defId: moved.defId, grade: unitDefFast(match.data, moved.defId).grade, slot });
  econ.readyRound[o.from] = match.round + def.cooldownRounds;
  econ.readyRound[seat] = match.round + def.cooldownRounds;
  for (const s of [o.from, seat]) {
    if (econ.rewarded.includes(s) || econ.rewarded.length >= def.rewardCap) continue;
    econ.rewarded.push(s);
    match.lanes[s]!.buckwheat += def.reward;
    laneEvents(ctx, s).push({ type: 'questReward', quest: 'transfer', coins: 0, buckwheat: def.reward, tokens: 0 });
  }
  endOffer(match, o, 'accepted', ctx, { defId: moved.defId });
  return null;
}

export function applyTransferCommand(match: MatchState, input: MatchInput, ctx: StepMatchResult): RejectReason | null {
  if (!match.econ || !match.data.economy?.transfer) return 'unknown';
  if (!match.seats[input.seat]!.alive) return 'notAlive';
  const cmd = input.cmd;
  if (cmd.type === 'transferOffer') return offer(match, input.seat, cmd, ctx);
  if (cmd.type === 'transferAccept') return accept(match, input.seat, cmd.offerId, cmd.slot, ctx);
  if (cmd.type === 'transferDecline') {
    const o = involved(match, input.seat);
    if (!o || o.offerId !== cmd.offerId) return 'noOffer';
    endOffer(match, o, 'declined', ctx, { by: input.seat });
    return null;
  }
  return 'unknown';
}
