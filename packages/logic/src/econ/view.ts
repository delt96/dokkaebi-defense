import type { EconState, GameState, RejectReason, TameTargetDef } from '../types';
import { buyCheck, marketDay, marketView, type MarketView } from './market';
import { storyView, type StoryView } from './story';
import { tameCheck } from './tame';

/** What the market panel shows: marketView plus the cards left in the bundle deck and why each buy is refused now. */
export interface EconMarketView extends MarketView {
  day: number;
  deck: { grade: number; left: number }[];
  why: { bundle: RejectReason | null; jar: RejectReason | null };
}

/** A living tame target on the lane; `why` is tameCheck's answer right now (null = the button works). */
export interface EconTameView {
  enemyId: number; defId: string; unit: string; cost: TameTargetDef['cost']; needs: TameTargetDef['needs'] | null;
  hpLimit: number; why: RejectReason | null;
}

export interface EconStoryView {
  target: string | null;
  /** The open request; `missing` is the material id nobody holds. */
  active: { target: string; missing: string; round: number } | null;
  offers: number; awarded: boolean; view: StoryView | null;
}

/** Lane economy as the screen needs it. Holds no rng state; ticks are absolute so the value only changes on real changes. */
export interface EconView {
  market: EconMarketView | null;
  jige: boolean;
  roundKills: number;
  questTokens: number;
  mission: EconState['mission'] | null;
  collection: EconState['collection'] | null;
  events: EconState['events'];
  story: EconStoryView | null;
  tame: EconTameView[];
}

function marketPart(state: GameState): EconMarketView | null {
  const base = marketView(state);
  const m = state.data.economy?.market;
  const econ = state.econ!;
  if (!base || !m) return null;
  const left = econ.bundle.left;
  const deck = [...new Set(m.bundle.deck)].sort((a, b) => b - a).map(grade => ({ grade, left: left.filter(g => g === grade).length }));
  return {
    ...base, day: marketDay(state), deck,
    why: { bundle: buyCheck(state, 'bundle'), jar: buyCheck(state, 'jar') },
  };
}

function storyPart(state: GameState): EconStoryView | null {
  const econ = state.econ!;
  if (!state.data.economy?.story) return null;
  const s = econ.story;
  const active = s.active
    ? { target: s.active.target, missing: state.data.recipes.find(r => r.result === s.active!.target)?.materials[s.active.missing] ?? '', round: s.active.round }
    : null;
  return { target: s.target, active, offers: s.offers, awarded: s.awarded, view: storyView(state) };
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
      hpLimit: Math.floor(e.maxHp * tame.hpPct), why: tameCheck(state, e.id),
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
    market: marketPart(state),
    jige: econ.jige,
    roundKills: econ.roundKills,
    questTokens: econ.questTokens,
    mission: eco.mission ? { ...econ.mission } : null,
    collection: eco.collection ? { done: [...econ.collection.done], paid: econ.collection.paid } : null,
    events: econ.events.map(e => ({ ...e })),
    story: storyPart(state),
    tame: tamePart(state),
  };
}
