import { createGame, step, type GameData } from '../src/index';
import { laneOf, dist } from '../src/lane';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

export type Role = 'single' | 'group';

const SLOT = 0;
const GROUP_SECONDS = 30;
const SINGLE_HP = 20000;
const SINGLE_LIMIT_SECONDS = 600;

/**
 * Skill-inclusive damage per second of one unit alone on the board, no upgrades. 'group': three enemies standing
 * together next to it for 30 s (every hit, splash, pierce, dot and its own debuffs count). 'single': one enemy of
 * fixed HP from full to dead (execute and finishing skills count), HP / seconds to kill.
 */
export function roleDps(data: GameData, defId: string, role: Role, hp = SINGLE_HP): number {
  const s = createGame(data, 1);
  forceRound(s, 5);
  s.enemies = [];
  s.spawned = 1e9;
  s.roundEndTick = s.tick + 1e9;
  s.open = s.open.map(() => true);
  placeUnitForTest(s, defId, SLOT);
  const lane = laneOf(s);
  let best = 0;
  let bestD = Infinity;
  for (let d = 0; d < 200; d += 0.05) {
    const gap = dist(lane.cells[SLOT]!, lane.pointAt(d));
    if (gap < bestD) { bestD = gap; best = d; }
  }
  // the first spawned (the one targeted) leads, the others follow behind it as they do on the path
  const spots = role === 'group' ? [best + 0.3, best, best - 0.3] : [best];
  const enemies = spots.map(d => spawnEnemyForTest(s, 'japgwi', d, role === 'group' ? 1e9 : hp));
  const ticks = (role === 'group' ? GROUP_SECONDS : SINGLE_LIMIT_SECONDS) * 20;
  let damage = 0;
  for (let t = 0; t < ticks; t++) {
    const r = step(s, []);
    for (const e of r.events) if (e.type === 'damage') damage += e.amount;
    enemies.forEach((e, i) => { e.d = spots[i]!; });
    if (role === 'single' && enemies[0]!.hp <= 0) return hp / ((t + 1) / 20);
  }
  return role === 'group' ? damage / GROUP_SECONDS : hp / SINGLE_LIMIT_SECONDS;
}

export function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** Median roleDps of the normal units of `grade` sharing `defId`'s damage type. */
export function familyMedian(data: GameData, defId: string, grade: number, role: Role, hp?: number): number {
  const type = data.units.find(u => u.id === defId)!.damageType;
  return median(data.units.filter(u => !u.hidden && u.grade === grade && u.damageType === type).map(u => roleDps(data, u.id, role, hp)));
}
