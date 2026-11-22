import { gamblePool } from '../data';
import { registerCommand } from '../registry';
import { createRng, deriveSeed, nextFloat, nextInt } from '../rng';
import type { GambleCommand, GambleDef, GambleEvent, GambleOdds, GambleTable, GambleTableDef, GameData, GameState, RejectReason } from '../types';
import { addUnit, chooseSlot } from '../units';
import { unitValue } from './ledger';

function config(state: GameState): GambleDef | undefined {
  if (state.data.balance.rounds === 60 && state.econ) return state.data.economy?.market?.gamble;
}

function attempts(state: GameState) {
  const count = state.econ?.gamble;
  return count?.round === state.round ? count : { round: state.round, coins: 0, units: 0 };
}

function tableDef(g: GambleDef, id: GambleTable): GambleTableDef | null {
  return Object.hasOwn(g.units.tables, id) ? g.units.tables[id as 'small'] : null;
}

/** Draws this round from the table's own quota, or from the shared bundle quota. */
function used(count: ReturnType<typeof attempts>, id: GambleTable, table: GambleTableDef): number {
  return table.perRound === undefined ? count.units : count.own?.[id] ?? 0;
}

export function gambleCheck(state: GameState, cmd: GambleCommand): RejectReason | null {
  const g = config(state);
  if (!g) return 'badArgs';
  const table = cmd.type === 'gambleUnit' ? tableDef(g, cmd.table) : null;
  if (cmd.type === 'gambleCoins' ? !g.coins.stakes.includes(cmd.stake) : !table) return 'badArgs';
  if (state.phase !== 'round' || state.round < 1) return 'marketClosed';
  const early = cmd.type === 'gambleCoins' ? !!g.coins.openStakes?.includes(cmd.stake) : !!table!.openBeforeMarket;
  if (state.econ!.marketOpen === false && !early) return 'marketLocked';
  const count = attempts(state);
  if (cmd.type === 'gambleCoins') {
    if (count.coins >= g.coins.perRound) return 'gambleLimit';
    return state.coins < cmd.stake ? 'noCoins' : null;
  }
  if (state.round < table!.fromRound) return 'gambleRound';
  if (used(count, cmd.table, table!) >= (table!.perRound ?? g.units.perRound)) return 'gambleLimit';
  if (!state.slots.some((u, i) => !u && state.open[i])) return 'noSlot';
  if (state.coins < (table!.coinCost ?? 0)) return 'noCoins';
  return state.buckwheat < table!.buckwheatCost ? 'noBuckwheat' : null;
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
  // Keep the existing fallback for snapshots taken before dedicated gamble streams existed.
  const legacySeed = (rng as typeof rng & { marketGrade?: { s: number } }).marketGrade?.s;
  return rng[kind] ??= createRng(deriveSeed(legacySeed ?? rng.jige.s, kind));
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
  const table = tableDef(config(state)!, cmd.table)!;
  const count = state.econ!.gamble = attempts(state);
  if (table.perRound === undefined) count.units++;
  else count.own = { ...count.own, [cmd.table]: (count.own?.[cmd.table] ?? 0) + 1 };
  const rng = gambleRng(state, cmd.type);
  const result = draw(table.outcomes, nextFloat(rng));
  const consolation = result === 0 ? table.consolation : 0;
  // Only the 묵 bundles carry the 지게 roll; a coin-only table leaves that stream untouched.
  const jige = table.buckwheatCost > 0 && nextFloat(state.econ!.rng.jige) < state.data.economy!.market!.jigeChance;
  if (jige) state.econ!.jige++;
  state.buckwheat -= table.buckwheatCost;
  state.coins += consolation - (table.coinCost ?? 0);
  const receipt = {
    type: cmd.type, table: cmd.table, buckwheatCost: table.buckwheatCost,
    ...(table.coinCost !== undefined && { coinCost: table.coinCost }), consolation, jige,
  };
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
type TableView = GambleTableDef & { why: RejectReason | null; left?: number };
export interface GambleView {
  coins: QuotaView & { outcomes: GambleDef['coins']['outcomes']; stakes: { price: number; why: RejectReason | null }[] };
  units: QuotaView & { tables: Record<'small' | 'big', TableView> & { coin?: TableView } };
}

export function gambleView(state: GameState): GambleView | undefined {
  const g = config(state);
  if (!g) return;
  const count = attempts(state);
  const table = (id: GambleTable): TableView => {
    const def = tableDef(g, id)!;
    const why = gambleCheck(state, { type: 'gambleUnit', table: id });
    return { ...def, why, ...(def.perRound !== undefined && { left: def.perRound - used(count, id, def) }) };
  };
  return {
    coins: {
      left: g.coins.perRound - count.coins, limit: g.coins.perRound, outcomes: g.coins.outcomes,
      stakes: g.coins.stakes.map(price => ({ price, why: gambleCheck(state, { type: 'gambleCoins', stake: price }) })),
    },
    units: {
      left: g.units.perRound - count.units, limit: g.units.perRound,
      tables: { small: table('small'), big: table('big'), ...(g.units.tables.coin && { coin: table('coin') }) },
    },
  };
}
