import type { MatchState } from './types';
import { waveOf } from '../flow';
import { roundAtTick, roundStartTick } from './schedule';

/**
 * Fast-forwards a match to `tick` with empty lanes (the server's dev-only `devJumpTick` room option and tests); the next stepMatch
 * processes `tick` (opening a round on a boundary).
 */
export function jumpToTick(match: MatchState, tick: number): void {
  const data = match.data;
  if (!Number.isInteger(tick) || tick < roundStartTick(data, 1)) throw new Error(`jumpToTick needs a tick >= ${roundStartTick(data, 1)}`);
  const r = roundAtTick(data, tick - 1);
  match.tick = tick;
  match.phase = r === 0 ? 'prep' : 'round';
  match.round = r;
  match.roundStartTick = r === 0 ? 0 : roundStartTick(data, r);
  match.roundEndTick = roundStartTick(data, r + 1);
  for (const seat of match.ring) {
    if (!match.seats[seat]!.alive) continue;
    const lane = match.lanes[seat]!;
    lane.enemies = [];
    lane.fires = [];
    lane.overLimitTicks = 0;
    lane.tick = match.tick;
    lane.phase = match.phase;
    lane.round = match.round;
    lane.roundStartTick = match.roundStartTick;
    lane.roundEndTick = match.roundEndTick;
    if (r === 0) continue;
    lane.spawned = waveOf(lane, r).type === 'boss' ? 1 : data.balance.spawnCount;
    if (lane.stats[lane.stats.length - 1]?.round !== r) {
      lane.stats.push({ round: r, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: 0, endEnemies: 0, bossKillSeconds: null });
    }
  }
  match.yeoksinKills = (data.coop?.yeoksin ?? []).filter(y => roundStartTick(data, y.deadlineRound + 1) - 1 < tick).length;
}
