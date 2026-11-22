import {
  createGame, runCombat, startRound, unitDefFast, waveOf, type GameData,
} from '@dorandi/logic';
import { placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { median } from './report';

export interface ExclusivePower {
  seed: number; result: string; peers: number; dps: number; familyMedian: number; gain: number;
}

/** Movement, cooldowns, overkill and control all count. HP / elapsed time includes the
 * gaps between passes through range. No other board unit deals unattributable damage. */
function movingDps(data: GameData, seed: number, id: string, single: boolean): number {
  const state = createGame(data, seed);
  startRound(state, single ? 60 : 55, []);
  placeUnitForTest(state, id, 0);
  state.upgrades[unitDefFast(data, id).damageType] = 10;
  const wave = waveOf(state, state.round);
  const enemyId = wave.type === 'boss' ? wave.boss : wave.pattern[0]!;
  const positions = single ? [0] : [0.6, 0.3, 0];
  const targets = positions.map(d => spawnEnemyForTest(state, enemyId, d));
  const hp = targets.reduce((total, e) => total + e.maxHp, 0);
  while (state.enemies.length) {
    if (state.tick >= 20 * 1800) throw new Error(`Unfinished moving-target trial: ${seed}, ${id}`);
    runCombat(state, [], { finalClear: false });
    state.tick++;
  }
  return hp / (state.tick * data.balance.tickMs / 1000);
}

export function exclusivePower(data: GameData, seed: number): ExclusivePower[] {
  const cached = new Map<string, number[]>();
  return data.recipes.filter(r => r.kind === 'tame').map(({ result }) => {
    const family = unitDefFast(data, result).damageType;
    const single = result === 'topnisoemeokbo';
    const key = `${family}/${single}`;
    let peers = cached.get(key);
    if (!peers) {
      peers = data.units.filter(u => u.grade === 6 && !u.hidden && u.damageType === family)
        .map(u => movingDps(data, seed, u.id, single));
      cached.set(key, peers);
    }
    const familyMedian = median(peers)!;
    const dps = movingDps(data, seed, result, single);
    return { seed, result, peers: peers.length, dps, familyMedian, gain: dps / familyMedian - 1 };
  });
}
