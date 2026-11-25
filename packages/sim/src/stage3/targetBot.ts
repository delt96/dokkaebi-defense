import {
  availableRecipes, createRng, deriveSeed, nextInt, unitAttack, unitDefFast,
  type Command, type DamageType, type GameData, type GameState,
} from '@dorandi/logic';
import { cheapestUpgrade, emptyOpenSlots, followBoss, placementFix, rangeUpgrade, summonAll } from '../bots';
import {
  betterTarget, huntCommands, jigeCommands, questCommands, remainingValue, reserveCoins, tameCommands, type EconPolicy, type TargetBot,
} from './econBot';
import { lacksShred, pickShredSupport, shredPlacement } from './shred';
import { auraPlacement, mainType, supportSlots, synergyScore, synergyUpgrade } from './synergy';

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
 * `kept` is how many held units of each id the target still uses. `reserved` units are held but not counted.
 */
export function remainingNeed(
  state: GameState, target: string, reserved: ReadonlyMap<string, number> = new Map(),
): { missing: Map<string, number>; kept: Map<string, number> } {
  const recipeOf = new Map(state.data.recipes.map(r => [r.result, r]));
  const owned = ownedCounts(state);
  for (const [id, n] of reserved) owned.set(id, Math.max(0, (owned.get(id) ?? 0) - n));
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

/** Slots of the `n` strongest units outside the target tree (kept for boss fights). */
function strongestOutside(state: GameState, tree: Map<string, number>, n: number): Set<number> {
  const out = state.slots
    .map((u, i) => (u && !tree.has(u.defId) ? { i, a: unitAttack(unitDefFast(state.data, u.defId), state.data.balance) } : null))
    .filter((x): x is { i: number; a: number } => x !== null)
    .sort((x, y) => y.a - x.a || x.i - y.i);
  return new Set(out.slice(0, n).map(x => x.i));
}

const BOSS_GUARD = 4;
const SUPPORT_GUARD = 4;
const SYNERGY_MARGIN = 4;
/** From this round the shred policy builds a grade 5 shredder when the board has none. */
const SHRED_FROM = 31;

/** Normal grade 6 not yet built with the best synergy score; ties broken by `rng`. */
function bestSynergyTarget(state: GameState, done: ReadonlySet<string>, current: string | null, rng: ReturnType<typeof createRng>) {
  const main = mainType(state, current);
  const pool = state.data.units.filter(u => u.grade === 6 && !u.hidden && !done.has(u.id)).sort((a, b) => a.id.localeCompare(b.id));
  const scored = pool.map(u => ({ id: u.id, score: synergyScore(u, remainingValue(state, u.id), main) }));
  const min = Math.min(...scored.map(x => x.score));
  const best = scored.filter(x => x.score === min);
  const cur = current ? scored.find(x => x.id === current) : undefined;
  return { pick: best.length ? best[nextInt(rng, best.length)]!.id : null, min, cur: cur?.score ?? Infinity };
}

/**
 * Sell candidate when the board is full: the lowest-grade unit outside the target tree, else the lowest-grade held unit
 * the target no longer needs. `protect` slots are never offered. With `main`, a unit of the other damage type goes
 * before one of the main type of the same grade.
 */
function sellCandidate(
  state: GameState, tree: Map<string, number>, kept: Map<string, number>, protect: Set<number> = new Set(), main: DamageType | null = null,
): number | null {
  const lowest = (pick: (id: string, seen: number) => boolean): number | null => {
    let best: number | null = null;
    let bestKey = Infinity;
    const seen = new Map<string, number>();
    state.slots.forEach((u, i) => {
      if (!u) return;
      const n = (seen.get(u.defId) ?? 0) + 1;
      seen.set(u.defId, n);
      const def = unitDefFast(state.data, u.defId);
      if (def.grade >= 6 || protect.has(i) || !pick(u.defId, n)) return;
      const key = def.grade * 2 + (main !== null && def.damageType === main ? 1 : 0);
      if (key < bestKey) { best = i; bestKey = key; }
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
export function targetBot(
  seed: number, opts: { targets?: string[]; policy?: EconPolicy; switchTargets?: boolean; synergy?: boolean } = {},
): TargetBot {
  const rng = createRng(deriveSeed(seed, 'target'));
  const done = new Set<string>();
  const queue = [...(opts.targets ?? [])];
  let target: string | null = null;
  let tree = new Map<string, number>();
  let decisions = 0;
  let lastRound = -1;
  const policy = opts.policy;
  const shredOn = policy?.shred === true;
  /** The grade 5 shredder the board keeps out of recipes, sales and swaps. */
  let support: string | null = null;
  /** The grade 6 target set aside while the shredder is built. */
  let paused: string | null = null;

  const nextTarget = (state: GameState): void => {
    if (opts.targets) {
      target = queue.shift() ?? null;
    } else if (opts.synergy) {
      target = bestSynergyTarget(state, done, null, rng).pick;
    } else {
      const pool = state.data.units.filter(u => u.grade === 6 && !u.hidden && !done.has(u.id)).map(u => u.id);
      target = pool.length ? pool[nextInt(rng, pool.length)]! : null;
    }
    tree = target ? expandTree(state.data, target) : new Map();
  };

  const setTarget = (state: GameState, id: string): void => {
    target = id;
    tree = expandTree(state.data, id);
  };

  return {
    name: opts.synergy ? 'synergy' : opts.switchTargets ? 'switch' : 'target',
    currentTarget: () => target,
    decide(state) {
      decisions++;
      if (target === null && decisions === 1) nextTarget(state);
      const holds = (id: string) => state.slots.some(u => u?.defId === id);
      if (target !== null && target === support && holds(support)) {
        if (paused) setTarget(state, paused);
        else nextTarget(state);
        paused = null;
      } else if (target !== null && holds(target)) {
        done.add(target);
        nextTarget(state);
      }
      if (support !== null && target !== support && !holds(support)) support = null;
      const shredMain = mainType(state, paused ?? target);
      if (shredOn && support === null && target !== null && state.round >= SHRED_FROM && lacksShred(state, shredMain)) {
        const pick = pickShredSupport(state, shredMain);
        if (pick) { support = pick; paused = target; setTarget(state, pick); }
      }
      const building = target !== null && target === support;
      if (building) {
        // no retargeting until the shredder is held
      } else if (opts.synergy && target !== null && state.round !== lastRound && decisions > 1) {
        const b = bestSynergyTarget(state, done, target, rng);
        if (b.pick && b.pick !== target && b.min <= b.cur - SYNERGY_MARGIN) setTarget(state, b.pick);
      } else if (opts.switchTargets && target !== null && state.round !== lastRound && decisions > 1) {
        const better = betterTarget(state, target, done);
        if (better) setTarget(state, better);
      }
      lastRound = state.round;
      const cmds: Command[] = summonAll(state);
      const reservedSlot = support !== null && !building ? state.slots.findIndex(u => u?.defId === support) : -1;
      const reserved = new Map<string, number>(reservedSlot >= 0 ? [[support!, 1]] : []);
      const { missing, kept } = target ? remainingNeed(state, target, reserved) : { missing: new Map<string, number>(), kept: new Map<string, number>() };
      const count = (id: string) => state.slots.filter(u => u?.defId === id).length;
      // the game picks the materials, so a recipe that would take the kept shredder waits for a second copy
      const eatsReserved = (r: string) => {
        const materials = state.data.recipes.find(x => x.result === r)?.materials ?? [];
        return [...reserved].some(([id, n]) => {
          const need = materials.filter(m => m === id).length;
          return need > 0 && count(id) - n < need;
        });
      };
      let recipe: string | null = null;
      let grade = 0;
      for (const r of availableRecipes(state)) {
        const g = unitDefFast(state.data, r).grade;
        if ((missing.get(r) ?? 0) > 0 && g > grade && !eatsReserved(r)) { recipe = r; grade = g; }
      }
      if (recipe) cmds.push({ type: 'combine', result: recipe });

      const main = opts.synergy ? mainType(state, target) : null;
      const protect = policy ? strongestOutside(state, tree, BOSS_GUARD) : new Set<number>();
      if (main) for (const i of supportSlots(state, tree, main, SUPPORT_GUARD)) protect.add(i);
      if (reservedSlot >= 0) protect.add(reservedSlot);
      if (emptyOpenSlots(state).length === 0 && state.tokens > 0 && !recipe) {
        const sell = sellCandidate(state, tree, kept, protect, main);
        if (sell !== null) { cmds.push({ type: 'sell', slot: sell }, { type: 'summon' }); }
        else cmds.push({ type: 'convertToken' });
      }

      if (policy) {
        if (policy.jige) cmds.push(...jigeCommands(state, target, reservedSlot >= 0 ? new Set([reservedSlot]) : new Set()));
        if (policy.quests) cmds.push(...questCommands(state, target));
        if (policy.hunts) cmds.push(...huntCommands(state, target));
        if (policy.tame) cmds.push(...tameCommands(state, target));
      }

      const keep = reserveCoins(state, target);
      // the range policy saves for the range upgrade before any other upgrade
      const savingForRange = policy?.range === true && rangeUpgrade(state, Infinity) !== null;
      const up = savingForRange ? rangeUpgrade(state, state.coins - keep)
        : main ? synergyUpgrade(state, main, state.coins - keep) : cheapestUpgrade(keep ? { ...state, coins: state.coins - keep } : state);
      if (up) cmds.push({ type: 'upgrade', id: up });
      const fix = placementFix(state);
      const shredMove = reservedSlot >= 0 && decisions % 4 === 1 ? shredPlacement(state, reservedSlot, shredMain) : null;
      if (fix) cmds.push(fix);
      else if (shredMove) cmds.push(shredMove);
      else if (main && decisions % 4 === 2) {
        const aura = auraPlacement(state);
        if (aura) cmds.push(aura);
      }
      if (decisions % 4 === 0) cmds.push(...followBoss(state));
      return cmds;
    },
  };
}
