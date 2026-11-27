import {
  applyCommand, chooseSlot, countNormalEnemies, createGame, laneOf, step, unitDefFast,
  type GameData, type GameState, type RecipeDef,
} from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { probeData, PROBE_SCENARIOS, type ProbeScenario } from './probe';

/**
 * How B places the combined unit. `plain` is the plan's measure: the combine command alone, leaving the result
 * where the command puts it. `fit` puts it on a material cell on the side that suits its range (melee on the edge),
 * else moves it to an empty cell on that side, as a player would.
 */
export type CombinePlacement = 'fit' | 'plain';

export function parseCombinePlacement(value: string): CombinePlacement {
  if (value === 'fit' || value === 'plain') return value;
  throw new Error(`unknown combine placement: ${value} (fit | plain)`);
}

/** Physical and magical upgrade levels both sides play with (a unit reads only its own type's). */
export interface UpgradeLevels { physical: number; magical: number }
export const NO_UPGRADES: UpgradeLevels = { physical: 0, magical: 0 };

/** `--upgrades 10/0` style levels: physical/magical. */
export function parseUpgradeLevels(value: string): UpgradeLevels {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (!m) throw new Error(`unknown upgrade levels: ${value} (physical/magical, e.g. 10/0)`);
  return { physical: Number(m[1]), magical: Number(m[2]) };
}

export interface CombineGainRow {
  result: string; grade: number; scenario: ProbeScenario; placement: CombinePlacement; upgrades: string; hp: number; seeds: number;
  aMean: number; bMean: number; worstDelta: number; pass: boolean;
}

const TARGET_SURVIVORS = 15;
const MELEE_MAX_RANGE = 2.0;

/**
 * The material cell the combined unit should land on without any re-placement: one whose edge/inner side
 * suits the result's range (melee on the edge), else the default choice of the combine command.
 */
function resultSlot(state: GameState, materials: string[], result: string): number | undefined {
  const lane = laneOf(state);
  const wantEdge = unitDefFast(state.data, result).range <= MELEE_MAX_RANGE;
  let best: number | undefined;
  let bestGrade = 0;
  state.slots.forEach((u, i) => {
    if (!u || !materials.includes(u.defId) || lane.cells[i]!.isEdge !== wantEdge) return;
    const g = unitDefFast(state.data, u.defId).grade;
    if (g > bestGrade) { best = i; bestGrade = g; }
  });
  return best;
}

/** If no material cell suited the result, moves it to an empty cell on the right side, as a player would. */
function moveToFittingSide(state: GameState, result: string): void {
  const from = state.slots.findIndex(u => u?.defId === result);
  if (from < 0) return;
  const def = unitDefFast(state.data, result);
  if (laneOf(state).cells[from]!.isEdge === (def.range <= MELEE_MAX_RANGE)) return;
  const to = chooseSlot(state, def);
  if (to !== null) applyCommand(state, { type: 'move', from, to }, []);
}

/** Places `units` (and optionally combines them into `combineInto`) on a fresh game, before round 1 starts. */
export function prepareRound(
  data: GameData, units: string[], seed: number, combineInto?: string, placement: CombinePlacement = 'fit', upgrades = NO_UPGRADES,
): GameState {
  const state = createGame(data, seed);
  state.open = state.open.map(() => true);
  state.upgrades.physical = upgrades.physical;
  state.upgrades.magical = upgrades.magical;
  for (const id of units) {
    const slot = chooseSlot(state, unitDefFast(data, id));
    if (slot === null) throw new Error(`no slot for ${id}`);
    placeUnitForTest(state, id, slot);
  }
  if (combineInto) {
    state.coins = 1000;
    state.buckwheat = 10;
    const slot = placement === 'fit' ? resultSlot(state, units, combineInto) : undefined;
    const reason = applyCommand(state, { type: 'combine', result: combineInto, slot }, []);
    if (reason) throw new Error(`combine ${combineInto} rejected: ${reason}`);
    if (placement === 'fit') moveToFittingSide(state, combineInto);
  }
  return state;
}

/** Plays round 1 with `units` placed (and optionally combined into `combineInto`), returning the enemies left at the end. */
export function survivorsAfterRound(
  data: GameData, units: string[], seed: number, combineInto?: string, placement: CombinePlacement = 'fit', upgrades = NO_UPGRADES,
): number {
  const state = prepareRound(data, units, seed, combineInto, placement, upgrades);
  forceRound(state, 1);
  while (state.tick < state.roundEndTick && state.phase !== 'ended') step(state, []);
  return countNormalEnemies(state);
}

/** Log-scale bisection on probe hp so that keeping the materials (A) leaves about 15 of 30 enemies on seed 1. */
export function calibrateHp(data: GameData, recipe: RecipeDef, scenario: ProbeScenario, steps = 16, upgrades = NO_UPGRADES): number {
  let lo = 0;
  let hi = Math.log(1e7);
  let best = { hp: 1, gap: Infinity };
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const hp = Math.max(1, Math.round(Math.exp(mid)));
    const left = survivorsAfterRound(probeData(data, scenario, hp), recipe.materials, 1, undefined, 'fit', upgrades);
    const gap = Math.abs(left - TARGET_SURVIVORS);
    if (gap < best.gap) best = { hp, gap };
    if (left < TARGET_SURVIVORS) lo = mid;
    else hi = mid;
    if (gap === 0) break;
  }
  return best.hp;
}

export function combineGainCase(
  data: GameData, recipe: RecipeDef, scenario: ProbeScenario,
  opts: { seeds: number; steps?: number; placement?: CombinePlacement; upgrades?: UpgradeLevels },
): CombineGainRow {
  const placement = opts.placement ?? 'fit';
  const upgrades = opts.upgrades ?? NO_UPGRADES;
  const hp = calibrateHp(data, recipe, scenario, opts.steps, upgrades);
  const probe = probeData(data, scenario, hp);
  let aSum = 0;
  let bSum = 0;
  let worstDelta = -Infinity;
  for (let seed = 1; seed <= opts.seeds; seed++) {
    const a = survivorsAfterRound(probe, recipe.materials, seed, undefined, 'fit', upgrades);
    const b = survivorsAfterRound(probe, recipe.materials, seed, recipe.result, placement, upgrades);
    aSum += a;
    bSum += b;
    worstDelta = Math.max(worstDelta, b - a);
  }
  return {
    result: recipe.result, grade: unitDefFast(data, recipe.result).grade, scenario, placement,
    upgrades: `${upgrades.physical}/${upgrades.magical}`, hp, seeds: opts.seeds,
    aMean: aSum / opts.seeds, bMean: bSum / opts.seeds, worstDelta, pass: worstDelta <= 0,
  };
}

export function combineGainAll(
  data: GameData,
  opts: { seeds: number; scenarios?: ProbeScenario[]; results?: string[]; steps?: number; placement?: CombinePlacement; upgrades?: UpgradeLevels },
): CombineGainRow[] {
  const scenarios = opts.scenarios ?? (Object.keys(PROBE_SCENARIOS) as ProbeScenario[]);
  const rows: CombineGainRow[] = [];
  for (const recipe of data.recipes) {
    // A tame recipe needs an evolved recruit, which the probe board never has.
    if (recipe.kind === 'tame') continue;
    if (opts.results && !opts.results.includes(recipe.result)) continue;
    for (const scenario of scenarios) {
      rows.push(combineGainCase(data, recipe, scenario, { seeds: opts.seeds, steps: opts.steps, placement: opts.placement, upgrades: opts.upgrades }));
    }
  }
  return rows;
}
