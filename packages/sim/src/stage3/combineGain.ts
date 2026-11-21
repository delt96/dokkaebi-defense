import {
  applyCommand, chooseSlot, countNormalEnemies, createGame, step, unitDefFast,
  type GameData, type RecipeDef,
} from '@dorandi/logic';
import { forceRound, placeUnitForTest } from '@dorandi/logic/testing';
import { probeData, PROBE_SCENARIOS, type ProbeScenario } from './probe';

export interface CombineGainRow {
  result: string; grade: number; scenario: ProbeScenario; hp: number; seeds: number;
  aMean: number; bMean: number; worstDelta: number; pass: boolean;
}

const TARGET_SURVIVORS = 15;

/** Plays round 1 with `units` placed (and optionally combined into `combineInto`), returning the enemies left at the end. */
export function survivorsAfterRound(data: GameData, units: string[], seed: number, combineInto?: string): number {
  const state = createGame(data, seed);
  state.open = state.open.map(() => true);
  for (const id of units) {
    const slot = chooseSlot(state, unitDefFast(data, id));
    if (slot === null) throw new Error(`no slot for ${id}`);
    placeUnitForTest(state, id, slot);
  }
  if (combineInto) {
    state.coins = 1000;
    state.buckwheat = 10;
    const reason = applyCommand(state, { type: 'combine', result: combineInto }, []);
    if (reason) throw new Error(`combine ${combineInto} rejected: ${reason}`);
  }
  forceRound(state, 1);
  while (state.tick < state.roundEndTick && state.phase !== 'ended') step(state, []);
  return countNormalEnemies(state);
}

/** Log-scale bisection on probe hp so that keeping the materials (A) leaves about 15 of 30 enemies on seed 1. */
export function calibrateHp(data: GameData, recipe: RecipeDef, scenario: ProbeScenario, steps = 16): number {
  let lo = 0;
  let hi = Math.log(1e7);
  let best = { hp: 1, gap: Infinity };
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const hp = Math.max(1, Math.round(Math.exp(mid)));
    const left = survivorsAfterRound(probeData(data, scenario, hp), recipe.materials, 1);
    const gap = Math.abs(left - TARGET_SURVIVORS);
    if (gap < best.gap) best = { hp, gap };
    if (left < TARGET_SURVIVORS) lo = mid;
    else hi = mid;
    if (gap === 0) break;
  }
  return best.hp;
}

export function combineGainCase(data: GameData, recipe: RecipeDef, scenario: ProbeScenario, opts: { seeds: number; steps?: number }): CombineGainRow {
  const hp = calibrateHp(data, recipe, scenario, opts.steps);
  const probe = probeData(data, scenario, hp);
  let aSum = 0;
  let bSum = 0;
  let worstDelta = -Infinity;
  for (let seed = 1; seed <= opts.seeds; seed++) {
    const a = survivorsAfterRound(probe, recipe.materials, seed);
    const b = survivorsAfterRound(probe, recipe.materials, seed, recipe.result);
    aSum += a;
    bSum += b;
    worstDelta = Math.max(worstDelta, b - a);
  }
  return {
    result: recipe.result, grade: unitDefFast(data, recipe.result).grade, scenario, hp, seeds: opts.seeds,
    aMean: aSum / opts.seeds, bMean: bSum / opts.seeds, worstDelta, pass: worstDelta <= 0,
  };
}

export function combineGainAll(
  data: GameData, opts: { seeds: number; scenarios?: ProbeScenario[]; results?: string[]; steps?: number },
): CombineGainRow[] {
  const scenarios = opts.scenarios ?? (Object.keys(PROBE_SCENARIOS) as ProbeScenario[]);
  const rows: CombineGainRow[] = [];
  for (const recipe of data.recipes) {
    if (opts.results && !opts.results.includes(recipe.result)) continue;
    for (const scenario of scenarios) rows.push(combineGainCase(data, recipe, scenario, { seeds: opts.seeds, steps: opts.steps }));
  }
  return rows;
}
