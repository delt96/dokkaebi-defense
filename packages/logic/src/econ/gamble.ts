import { gamblePool } from '../data';
import { registerCommand } from '../registry';
import { createRng, deriveSeed, nextFloat, nextInt } from '../rng';
import type { GambleCommand, GambleDef, GambleEvent, GambleOdds, GambleTable, GameData, GameState, RejectReason } from '../types';
import { addUnit, chooseSlot } from '../units';
import { unitValue } from './ledger';

function config(state: GameState): GambleDef | undefined {
  if (state.data.balance.rounds === 60 && state.econ) return state.data.economy?.market?.gamble;
}

function attempts(state: GameState) {
  const count = state.econ?.gamble;
  return count?.round === state.round ? count : { round: state.round, coins: 0, units: 0 };
}

export function gambleCheck(state: GameState, cmd: GambleCommand): RejectReason | null {
  const g = config(state);
  if (!g) return 'badArgs';
  const table = cmd.type === 'gambleUnit' && Object.hasOwn(g.units.tables, cmd.table) ? g.units.tables[cmd.table] : null;
  if (cmd.type === 'gambleCoins' ? !g.coins.stakes.includes(cmd.stake) : !table) return 'badArgs';
  if (state.phase !== 'round' || state.round < 1) return 'marketClosed';
  if (state.econ!.marketOpen === false) return 'marketLocked';
  const count = attempts(state);
  if (cmd.type === 'gambleCoins') {
    if (count.coins >= g.coins.perRound) return 'gambleLimit';
    return state.coins < cmd.stake ? 'noCoins' : null;
  }
  if (state.round < table!.fromRound) return 'gambleRound';
  if (count.units >= g.units.perRound) return 'gambleLimit';
  if (!state.slots.some((u, i) => !u && state.open[i])) return 'noSlot';
  return state.coins < table!.price ? 'noCoins' : null;
}

function draw<T>(outcomes: GambleOdds<T>[], roll: number): T {
  let cumulative = 0;
  for (const outcome of outcomes) {
    cumulative += outcome.chance;
    if (roll < cumulative) return outcome.result;
  }
  return outcomes[outcomes.length - 1]!.result;
}

function gambleRng(state: GameState, kind: GambleCommand['type']) {
  const rng = state.econ!.rng;
  // Older snapshots have no dedicated streams. Derive one once without advancing an existing stream.
  return rng[kind] ??= createRng(deriveSeed(rng.marketGrade.s, kind));
}

registerCommand('gambleCoins', (state, cmd, events) => {
  if (cmd.type !== 'gambleCoins') return 'unknown';
  const why = gambleCheck(state, cmd);
  if (why) return why;
  const count = state.econ!.gamble = attempts(state);
  count.coins++;
  const multiplier = draw(config(state)!.coins.outcomes, nextFloat(gambleRng(state, cmd.type)));
  const payout = Math.floor(cmd.stake * multiplier);
  state.coins += payout - cmd.stake;
  events.push({ type: cmd.type, stake: cmd.stake, multiplier, payout });
  return null;
});

registerCommand('gambleUnit', (state, cmd, events) => {
  if (cmd.type !== 'gambleUnit') return 'unknown';
  const why = gambleCheck(state, cmd);
  if (why) return why;
  const g = config(state)!.units;
  const { price, outcomes } = g.tables[cmd.table];
  const count = state.econ!.gamble = attempts(state);
  count.units++;
  const rng = gambleRng(state, cmd.type);
  const result = draw(outcomes, nextFloat(rng));
  const refund = result === 0 ? Math.floor(price * g.refund) : 0;
  state.coins += refund - price;
  const receipt = { type: cmd.type, table: cmd.table, price, refund };
  if (result === 0) {
    events.push({ ...receipt, result });
  } else {
    const pool = gamblePool(state.data, result);
    const def = pool[nextInt(rng, pool.length)]!;
    const unit = addUnit(state, def.id, chooseSlot(state, def)!, events);
    unit.cost = unitValue(state.data, def.id);
    events.push({ ...receipt, result, defId: def.id, unitId: unit.id });
  }
  return null;
});

export function gambleTier(data: GameData, event: GambleEvent): 'lose' | 'small' | 'big' {
  const g = data.economy?.market?.gamble;
  if (event.type === 'gambleCoins') {
    return event.multiplier === 0 ? 'lose' : g && event.multiplier >= g.coins.bigMultiplier ? 'big' : 'small';
  }
  if (event.result === 0) return 'lose';
  return event.result === 'hidden' || (g && event.result >= g.units.bigGrade) ? 'big' : 'small';
}

interface QuotaView { left: number; limit: number }
type TableView = GambleDef['units']['tables'][GambleTable] & { why: RejectReason | null };
export interface GambleView {
  coins: QuotaView & { outcomes: GambleDef['coins']['outcomes']; stakes: { price: number; why: RejectReason | null }[] };
  units: QuotaView & { refund: number; tables: Record<GambleTable, TableView> };
}

export function gambleView(state: GameState): GambleView | undefined {
  const g = config(state);
  if (!g) return;
  const count = attempts(state);
  const table = (id: GambleTable) => ({ ...g.units.tables[id], why: gambleCheck(state, { type: 'gambleUnit', table: id }) });
  return {
    coins: {
      left: g.coins.perRound - count.coins, limit: g.coins.perRound, outcomes: g.coins.outcomes,
      stakes: g.coins.stakes.map(price => ({ price, why: gambleCheck(state, { type: 'gambleCoins', stake: price }) })),
    },
    units: {
      left: g.units.perRound - count.units, limit: g.units.perRound, refund: g.units.refund,
      tables: { small: table('small'), big: table('big') },
    },
  };
}
