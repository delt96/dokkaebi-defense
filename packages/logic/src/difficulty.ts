import type { Difficulty, GameData } from './types';

const cache = new WeakMap<GameData, Map<Difficulty, GameData>>();
const bases = new WeakMap<GameData, GameData>();

/** The shared rule data a difficulty copy came from (its data version names that); other data is its own base. */
export function baseData(data: GameData): GameData {
  return bases.get(data) ?? data;
}

/**
 * The rules of one difficulty: a copy of `data` that ends at the difficulty's `rounds` and whose lane enemies,
 * lane bosses and 역신 have `hpScale` times their hp. Data without such fields comes back unchanged, so stage 1,
 * stage 2 and old stage 3 data play exactly as before. Hunts and event enemies keep their hp.
 */
export function difficultyData(data: GameData, difficulty: Difficulty | undefined): GameData {
  const b = data.balance;
  const rule = b.difficulties?.[difficulty ?? b.defaultDifficulty ?? 'normal'];
  const rounds = rule?.rounds ?? b.rounds;
  const scale = rule?.hpScale ?? 1;
  if (!rule || (rounds === b.rounds && scale === 1)) return data;
  let byDifficulty = cache.get(data);
  if (!byDifficulty) { byDifficulty = new Map(); cache.set(data, byDifficulty); }
  const key = difficulty ?? b.defaultDifficulty ?? 'normal';
  const hit = byDifficulty.get(key);
  if (hit) return hit;

  const d = structuredClone(data);
  d.balance.rounds = rounds;
  // rounds after the end (the round 70 boss for easy) are not part of the game: boss lists and clears read the waves
  d.waves = d.waves.filter(w => w.round <= rounds);
  // the copy is already this difficulty's rules: deriving it again (createMatch, then createGame) changes nothing
  d.balance.difficulties![key] = { tokensPerRound: rule.tokensPerRound };
  d.balance.hp.base *= scale;
  d.balance.hp.coef *= scale;
  for (const e of d.enemies) if (e.boss && e.hp !== undefined) e.hp = Math.round(e.hp * scale);
  if (d.coop) {
    d.coop.yeoksin = d.coop.yeoksin
      .filter(y => y.deadlineRound <= rounds)
      .map(y => ({ ...y, baseHp: Math.round(y.baseHp * scale) }));
  }
  byDifficulty.set(key, d);
  bases.set(d, data);
  return d;
}
