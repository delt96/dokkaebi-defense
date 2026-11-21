import {
  availableRecipes, createRng, deriveSeed, nextInt, unitDefFast,
  type Command, type GameData, type GameState,
} from '@dorandi/logic';
import { cheapestUpgrade, emptyOpenSlots, followBoss, placementFix, summonAll, type Bot } from '../bots';

const FINAL_COMBINE_COINS = 60;

/** Every unit needed to build `id` from summons, counted with repeats (including `id` itself). */
export function expandTree(data: GameData, id: string): Map<string, number> {
  const recipeOf = new Map(data.recipes.map(r => [r.result, r]));
  const out = new Map<string, number>();
  const add = (x: string, n: number) => {
    out.set(x, (out.get(x) ?? 0) + n);
    for (const m of recipeOf.get(x)?.materials ?? []) add(m, n);
  };
  add(id, 1);
  return out;
}

function ownedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of state.slots) if (u) counts.set(u.defId, (counts.get(u.defId) ?? 0) + 1);
  return counts;
}

/**
 * What the board still lacks for `target`: walking the tree from the top grade down, units already held
 * cover their own demand (and so their whole subtree). `missing` is the demand left after holdings;
 * `kept` is how many held units of each id the target still uses.
 */
export function remainingNeed(state: GameState, target: string): { missing: Map<string, number>; kept: Map<string, number> } {
  const recipeOf = new Map(state.data.recipes.map(r => [r.result, r]));
  const owned = ownedCounts(state);
  const demand = new Map<string, number>([[target, 1]]);
  const missing = new Map<string, number>();
  const kept = new Map<string, number>();
  for (let g = 6; g >= 1; g--) {
    for (const [id, n] of [...demand]) {
      if (unitDefFast(state.data, id).grade !== g || n <= 0) continue;
      const keep = Math.min(owned.get(id) ?? 0, n);
      if (keep) kept.set(id, keep);
      const rest = n - keep;
      if (rest <= 0) continue;
      missing.set(id, rest);
      for (const m of recipeOf.get(id)?.materials ?? []) demand.set(m, (demand.get(m) ?? 0) + rest);
    }
  }
  return { missing, kept };
}

/** Sell candidate when the board is full: the lowest-grade unit outside the target tree, else the lowest-grade held unit the target no longer needs. */
function sellCandidate(state: GameState, tree: Map<string, number>, kept: Map<string, number>): number | null {
  const lowest = (pick: (id: string, seen: number) => boolean): number | null => {
    let best: number | null = null;
    let bestGrade = Infinity;
    const seen = new Map<string, number>();
    state.slots.forEach((u, i) => {
      if (!u) return;
      const n = (seen.get(u.defId) ?? 0) + 1;
      seen.set(u.defId, n);
      const g = unitDefFast(state.data, u.defId).grade;
      if (g >= 6 || !pick(u.defId, n)) return;
      if (g < bestGrade) { best = i; bestGrade = g; }
    });
    return best;
  };
  return lowest(id => !tree.has(id)) ?? lowest((id, n) => n > (kept.get(id) ?? 0));
}

/**
 * Chases one grade 6 target at a time: summons everything, builds the highest-grade recipe the
 * target still lacks once holdings are counted, sells outside the tree for room, and keeps 60 coins for the final
 * combine once it owns a grade 5 of the tree. Never sells grade 6.
 */
export function targetBot(seed: number, opts: { targets?: string[] } = {}): Bot {
  const rng = createRng(deriveSeed(seed, 'target'));
  const done = new Set<string>();
  const queue = [...(opts.targets ?? [])];
  let target: string | null = null;
  let tree = new Map<string, number>();
  let decisions = 0;

  const nextTarget = (state: GameState): void => {
    if (opts.targets) {
      target = queue.shift() ?? null;
    } else {
      const pool = state.data.units.filter(u => u.grade === 6 && !u.hidden && !done.has(u.id)).map(u => u.id);
      target = pool.length ? pool[nextInt(rng, pool.length)]! : null;
    }
    tree = target ? expandTree(state.data, target) : new Map();
  };

  return {
    name: 'target',
    decide(state) {
      decisions++;
      if (target === null && decisions === 1) nextTarget(state);
      if (target !== null && state.slots.some(u => u?.defId === target)) {
        done.add(target);
        nextTarget(state);
      }
      const cmds: Command[] = summonAll(state);
      const { missing, kept } = target ? remainingNeed(state, target) : { missing: new Map<string, number>(), kept: new Map<string, number>() };
      let recipe: string | null = null;
      let grade = 0;
      for (const r of availableRecipes(state)) {
        const g = unitDefFast(state.data, r).grade;
        if ((missing.get(r) ?? 0) > 0 && g > grade) { recipe = r; grade = g; }
      }
      if (recipe) cmds.push({ type: 'combine', result: recipe });

      if (emptyOpenSlots(state).length === 0 && state.tokens > 0 && !recipe) {
        const sell = sellCandidate(state, tree, kept);
        if (sell !== null) cmds.push({ type: 'sell', slot: sell }, { type: 'summon' });
        else cmds.push({ type: 'convertToken' });
      }

      const holdsTree5 = state.slots.some(u => u && tree.has(u.defId) && unitDefFast(state.data, u.defId).grade === 5);
      const up = cheapestUpgrade(holdsTree5 ? { ...state, coins: state.coins - FINAL_COMBINE_COINS } : state);
      if (up) cmds.push({ type: 'upgrade', id: up });
      const fix = placementFix(state);
      if (fix) cmds.push(fix);
      if (decisions % 4 === 0) cmds.push(...followBoss(state));
      return cmds;
    },
  };
}
