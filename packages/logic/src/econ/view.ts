import type { EconState, GameState, ItemEffect, RejectReason, TameTargetDef } from '../types';
import { marketView, type MarketView } from './market';
import { tameChance, tameCheck, tameReadyTick } from './tame';
import { toTicks } from '../flow';
import { huntCheck, huntCoins, huntHp, huntSeat } from './hunts';
import { buyBlock } from './shop';

export type EconMarketView = MarketView;

/**
 * A living tame target on the lane: the odds at its HP right now, the price, its extra condition, when it leaves
 * (deadlineTick) and when a new attempt opens after a failure (readyTick, absolute). `why` is tameCheck's answer now.
 */
export interface EconTameView {
  enemyId: number; defId: string; unit: string; cost: TameTargetDef['cost']; needs: TameTargetDef['needs'] | null;
  chance: number; readyTick: number; deadlineTick: number; why: RejectReason | null;
}

/**
 * One 격파 target for this seat: the terms of its next summon (level, HP, fee, pay), the living summon with its
 * deadline, when a new summon opens and huntCheck's answer now. `best` is the highest level killed (0: none yet).
 */
export interface EconHuntView {
  enemy: string; fromRound: number; level: number; best: number; hp: number; fee: number;
  reward: { coins: number; buckwheat: number };
  enemyId: number | null; deadlineTick: number; readyTick: number; last: 'won' | 'fled' | 'tamed' | null;
  why: RejectReason | null;
}

/**
 * One charm on sale: `held` waits to be attached, `bought` counts toward `perGame`; `why` is buyBlock's answer now.
 * `buckwheat` (paid with the coins) and `fromRound` are there only on items that have them.
 */
export interface ShopItemView {
  id: string; name: string; coins: number; buckwheat?: number; fromRound?: number; effect: ItemEffect; held: number; bought: number; perGame: number | null;
  why: RejectReason | null;
}
export interface ShopView { items: ShopItemView[] }

/** Lane economy as the screen needs it. Holds no rng state; ticks are absolute so the value only changes on real changes. */
export interface EconView {
  market: EconMarketView | null;
  jige: number;
  roundKills: number;
  questTokens: number;
  hunts: EconHuntView[];
  collection: EconState['collection'] | null;
  events: EconState['events'];
  tame: EconTameView[];
  /** This seat's settled and running quest records (one per quest). */
  questResults: EconState['questResults'];
  shop: ShopView | null;
}

function deadlineOf(state: GameState, enemyId: number): number {
  const hunt = Object.values(state.econ?.hunts ?? {}).find(h => h.enemyId === enemyId);
  if (hunt) return hunt.deadlineTick;
  const rec = state.econ?.events.find(r => r.id === enemyId);
  const ss = state.data.economy?.ssireum;
  return rec?.kind === 'ssireum' && ss ? rec.spawnTick + toTicks(ss.seconds) : state.roundEndTick;
}

function tamePart(state: GameState): EconTameView[] {
  const tame = state.data.economy?.tame;
  if (!tame) return [];
  const out: EconTameView[] = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = tame.targets.find(t => t.enemy === e.defId);
    if (!def) continue;
    out.push({
      enemyId: e.id, defId: e.defId, unit: def.unit, cost: { ...def.cost }, needs: def.needs ? structuredClone(def.needs) : null,
      chance: tameChance(state.data, e.hp, e.maxHp), readyTick: tameReadyTick(state, e.id),
      deadlineTick: deadlineOf(state, e.id), why: tameCheck(state, e.id),
    });
  }
  return out;
}

function huntsPart(state: GameState): EconHuntView[] {
  const hunts = state.data.economy?.hunts;
  if (!hunts) return [];
  return hunts.targets.map(def => {
    const seat = huntSeat(state, def.enemy);
    return {
      enemy: def.enemy, fromRound: def.fromRound, level: seat.level, best: seat.level - 1,
      hp: huntHp(state, def, seat.level), fee: def.fee,
      reward: { coins: huntCoins(def, seat.level), buckwheat: def.reward.buckwheat },
      enemyId: seat.enemyId, deadlineTick: seat.deadlineTick, readyTick: seat.readyTick, last: seat.last,
      why: huntCheck(state, def.enemy),
    };
  });
}

function shopPart(state: GameState): ShopView | null {
  const shop = state.data.economy?.shop;
  const econ = state.econ;
  if (!shop || !econ) return null;
  return {
    items: shop.items.map(i => ({
      id: i.id, name: i.name, coins: i.coins, ...(i.buckwheat && { buckwheat: i.buckwheat }), ...(i.fromRound && { fromRound: i.fromRound }),
      effect: { ...i.effect },
      held: econ.items?.[i.id] ?? 0, bought: econ.itemsBought?.[i.id] ?? 0, perGame: i.perGame ?? null,
      why: buyBlock(state, i.id),
    })),
  };
}

/** The lane's economy for the screen, or null without an economy (stage 1-2). */
export function econView(state: GameState): EconView | null {
  const econ = state.econ;
  const eco = state.data.economy;
  if (!econ || !eco) return null;
  return {
    market: marketView(state),
    jige: econ.jige,
    roundKills: econ.roundKills,
    questTokens: econ.questTokens,
    hunts: huntsPart(state),
    collection: eco.collection ? { done: [...econ.collection.done], paid: econ.collection.paid } : null,
    events: econ.events.map(e => ({ ...e })),
    tame: tamePart(state),
    questResults: structuredClone(econ.questResults),
    shop: shopPart(state),
  };
}
