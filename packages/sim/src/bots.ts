import {
  availableRecipes, createRng, deriveSeed, dist, laneOf, nextInt, unitDefFast, upgradeCost,
  type Command, type GameState, type UpgradeId,
} from '@dorandi/logic';

export interface Bot { name: string; decide(state: GameState): Command[] }

const MELEE_MAX_RANGE = 2.0;

function emptyOpenSlots(state: GameState): number[] {
  const out: number[] = [];
  state.slots.forEach((u, i) => { if (!u && state.open[i]) out.push(i); });
  return out;
}

function summonAll(state: GameState): Command[] {
  const n = Math.min(state.tokens, emptyOpenSlots(state).length);
  return Array.from({ length: n }, () => ({ type: 'summon' }) as Command);
}

export function clumsyBot(seed: number): Bot {
  const rng = createRng(deriveSeed(seed, 'bot'));
  return {
    name: 'clumsy',
    decide(state) {
      const cmds = summonAll(state);
      const recipes = availableRecipes(state);
      if (recipes.length) cmds.push({ type: 'combine', result: recipes[nextInt(rng, recipes.length)]! });
      return cmds;
    },
  };
}

function bestRecipe(state: GameState): string | null {
  let best: string | null = null;
  let bestGrade = 0;
  for (const r of availableRecipes(state)) {
    const g = unitDefFast(state.data, r).grade;
    if (g > bestGrade) { best = r; bestGrade = g; }
  }
  return best;
}

function cheapestUpgrade(state: GameState): UpgradeId | null {
  const hasEmpty = emptyOpenSlots(state).length > 0;
  let best: UpgradeId | null = null;
  let bestCost = Infinity;
  for (const def of state.data.upgrades) {
    if (def.id === 'slots' && hasEmpty) continue;
    const level = state.upgrades[def.id];
    if (level >= def.max) continue;
    const cost = upgradeCost(def, level + 1);
    if (cost < bestCost) { best = def.id; bestCost = cost; }
  }
  return best !== null && bestCost <= state.coins ? best : null;
}

function placementFix(state: GameState): Command | null {
  const lane = laneOf(state);
  const empty = emptyOpenSlots(state);
  for (let i = 0; i < state.slots.length; i++) {
    const u = state.slots[i];
    if (!u) continue;
    const melee = unitDefFast(state.data, u.defId).range <= MELEE_MAX_RANGE;
    const onEdge = lane.cells[i]!.isEdge;
    if (melee === onEdge) continue;
    const to = empty.find(j => lane.cells[j]!.isEdge === melee);
    if (to !== undefined) return { type: 'move', from: i, to };
  }
  return null;
}

function followBoss(state: GameState): Command[] {
  const boss = state.enemies.find(e => e.boss && e.hp > 0);
  if (!boss) return [];
  const lane = laneOf(state);
  const at = lane.pointAt(boss.d);
  const d = (i: number) => dist(lane.cells[i]!, at);
  const melee = state.slots
    .map((u, i) => (u && unitDefFast(state.data, u.defId).range <= MELEE_MAX_RANGE ? i : -1))
    .filter(i => i >= 0)
    .sort((a, b) => d(b) - d(a) || a - b);
  const edge = lane.cells.filter(c => c.isEdge && state.open[c.index]).map(c => c.index).sort((a, b) => d(a) - d(b) || a - b);
  const occupied = new Set(state.slots.map((u, i) => (u ? i : -1)).filter(i => i >= 0));
  const cmds: Command[] = [];
  for (const from of melee.slice(0, 3)) {
    const to = edge.find(j => {
      if (d(j) >= d(from)) return false;
      if (!occupied.has(j)) return true;
      const other = state.slots[j];
      return !!other && unitDefFast(state.data, other.defId).range > MELEE_MAX_RANGE;
    });
    if (to === undefined) continue;
    cmds.push({ type: 'move', from, to });
    occupied.add(to);
    edge.splice(edge.indexOf(to), 1);
  }
  return cmds;
}

export function normalBot(): Bot {
  let decisions = 0;
  return {
    name: 'normal',
    decide(state) {
      decisions++;
      const cmds = summonAll(state);
      const recipe = bestRecipe(state);
      if (recipe) cmds.push({ type: 'combine', result: recipe });
      const up = cheapestUpgrade(state);
      if (up) cmds.push({ type: 'upgrade', id: up });
      const fix = placementFix(state);
      if (fix) cmds.push(fix);
      if (decisions % 4 === 0) cmds.push(...followBoss(state));
      return cmds;
    },
  };
}
