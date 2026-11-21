import type { EconState, GameState, RejectReason, TameTargetDef } from '../types';
import { marketView, type MarketView } from './market';
import { tameChance, tameCheck, tameReadyTick } from './tame';
import { toTicks } from '../flow';

export type EconMarketView = MarketView;

/**
 * A living tame target on the lane: the odds at its HP right now, the price, its extra condition, when it leaves
 * (deadlineTick) and when a new attempt opens after a failure (readyTick, absolute). `why` is tameCheck's answer now.
 */
export interface EconTameView {
  enemyId: number; defId: string; unit: string; cost: TameTargetDef['cost']; needs: TameTargetDef['needs'] | null;
  chance: number; readyTick: number; deadlineTick: number; why: RejectReason | null;
}

/** Lane economy as the screen needs it. Holds no rng state; ticks are absolute so the value only changes on real changes. */
export interface EconView {
  market: EconMarketView | null;
  jige: number;
  roundKills: number;
  questTokens: number;
  mission: EconState['mission'] | null;
  collection: EconState['collection'] | null;
  events: EconState['events'];
  tame: EconTameView[];
}

function deadlineOf(state: GameState, enemyId: number): number {
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
    mission: eco.mission ? { ...econ.mission } : null,
    collection: eco.collection ? { done: [...econ.collection.done], paid: econ.collection.paid } : null,
    events: econ.events.map(e => ({ ...e })),
    tame: tamePart(state),
  };
}
