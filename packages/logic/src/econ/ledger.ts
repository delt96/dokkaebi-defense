import type { EconSection, EconState, EconomyDef, GameData, GameState } from '../types';
import { createRng, deriveSeed } from '../rng';
import { gradeValue } from '../data';
import { unitDefFast } from '../units';

export function createEcon(seed: number, economy: EconomyDef): EconState {
  return {
    rng: {
      bundle: createRng(deriveSeed(seed, 'bundle')), jar: createRng(deriveSeed(seed, 'jar')),
      jige: createRng(deriveSeed(seed, 'jige')), drop: createRng(deriveSeed(seed, 'drop')),
    },
    roundKills: 0, questTokens: 0,
    ledger: { story: 0, tokens: 0 },
    pityQuest: [], pendingDrops: [],
    bundle: { day: 0, bought: 0, left: [...(economy.market?.bundle.deck ?? [])] },
    jar: { period: 0, done: 0, missed: false },
    jige: false,
    story: { target: null, pinned: [], log: [], offers: 0, awarded: false, active: null },
    mission: { phase: 'idle', beastId: null, beastDown: false },
    collection: { done: [], paid: false },
    events: [],
    tamed: [],
  };
}

const valueCache = new WeakMap<GameData, Map<string, number>>();

/** Ledger value of a unit in grade-1 units: 2^(g-1) up to grade 5, the materials' sum for a normal grade 6, 0 for hidden. */
export function unitValue(data: GameData, defId: string): number {
  let m = valueCache.get(data);
  if (!m) { m = new Map(); valueCache.set(data, m); }
  const cached = m.get(defId);
  if (cached !== undefined) return cached;
  const def = unitDefFast(data, defId);
  let v: number;
  if (def.hidden) v = 0;
  else if (def.grade <= 5) v = gradeValue(def.grade);
  else {
    const recipe = data.recipes.find(r => r.result === defId);
    v = recipe ? recipe.materials.reduce((sum, id) => sum + unitValue(data, id), 0) : gradeValue(def.grade);
  }
  m.set(defId, v);
  return v;
}

/** N: summed cost of the units on the board and in storage (quest-funded units cost 0). */
export function nonQuestValue(state: GameState): number {
  let n = 0;
  for (const u of state.slots) if (u) n += u.cost ?? 0;
  for (const u of state.storage ?? []) n += u.cost ?? 0;
  return n;
}

/** Q: story support plus the value reserved for quest tokens. */
export function questLoad(state: GameState): number {
  const l = state.econ?.ledger;
  return l ? l.story + l.tokens : 0;
}

export function fitsCaps(state: GameState, addStory: number, addTokens: number, nAfter: number): boolean {
  const econ = state.econ;
  const caps = state.data.economy?.ledger;
  if (!econ || !caps) return false;
  const story = econ.ledger.story + addStory;
  const q = story + econ.ledger.tokens + addTokens;
  return story <= caps.storyCap && q <= caps.totalCap && caps.ratio * q <= nAfter;
}

/** Spends one token, quest tokens first. */
export function takeToken(state: GameState): 'quest' | 'normal' | null {
  if (state.tokens <= 0) return null;
  state.tokens--;
  const econ = state.econ;
  if (econ && econ.questTokens > 0) {
    econ.questTokens--;
    return 'quest';
  }
  return 'normal';
}

/** Gives `n` quest tokens if the caps allow the reservation; the reservation is never returned. */
export function grantQuestTokens(state: GameState, n: number): boolean {
  const econ = state.econ;
  const caps = state.data.economy?.ledger;
  if (!econ || !caps) return false;
  const add = n * caps.tokenValue;
  if (!fitsCaps(state, 0, add, nonQuestValue(state))) return false;
  state.tokens += n;
  econ.questTokens += n;
  econ.ledger.tokens += add;
  return true;
}

/** Copy of `data` whose economy lacks every section switched off in `on`. */
export function economyVariant(data: GameData, on: Partial<Record<EconSection, boolean>>): GameData {
  const d = structuredClone(data);
  if (!d.economy) return d;
  for (const [k, v] of Object.entries(on)) if (v === false) delete (d.economy as unknown as Record<string, unknown>)[k];
  return d;
}

export function stripEconomy(data: GameData): GameData {
  const d = structuredClone(data);
  delete d.economy;
  return d;
}
