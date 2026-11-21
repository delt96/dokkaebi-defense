import { enemyDistanceAt, type ClientView, type GameData, type GameState, type UnitView, type UpgradeId } from '@dorandi/logic';

const NO_UPGRADES: Record<UpgradeId, number> = { physical: 0, magical: 0, polish: 0, slots: 0 };

/**
 * The server's display state in GameState shape, so LaneScene and the 1-player panels can read it.
 * Nothing here is simulated: combat fields the browser never sees are zero or empty.
 */
export function viewToGameState(view: ClientView, data: GameData, units: (UnitView | null)[], renderTick: number): GameState {
  const myRow = view.rows.find(r => r.seat === view.me.seat);
  const spirit = myRow?.status === 'spirit';
  const mine = view.mine;
  const ownLane = view.watching === view.me.seat;
  return {
    data,
    tick: view.clock.tick,
    phase: view.result ? 'ended' : view.clock.phase,
    round: view.clock.round,
    roundStartTick: view.clock.roundStartTick,
    roundEndTick: view.clock.roundEndTick,
    spawned: 0,
    result: null,
    tokens: spirit ? 0 : mine.tokens,
    coins: spirit ? 0 : mine.coins,
    buckwheat: spirit ? 0 : mine.buckwheat,
    slots: units.map(u => (u ? { id: u.id, defId: u.defId, cooldown: 0, attackCount: 0, periodic: [] } : null)),
    // the own board comes from `mine` (sent at once), another lane's from the lane stream
    open: [...(ownLane && !spirit ? mine.open : view.lane.open)],
    pendingPity: spirit ? [] : [...mine.pendingPity],
    summonCounts: {},
    grade1Summons: spirit ? 0 : mine.grade1Summons,
    enemies: view.lane.enemies.map(e => ({
      id: e.id, defId: e.defId, hp: e.hp, maxHp: e.maxHp,
      // never draw before the enemy's base tick: going back past a spawn or speed change would misplace it
      d: enemyDistanceAt(e, Math.max(renderTick, e.t)),
      boss: e.boss, round: view.clock.round, stunTicks: e.speed === 0 ? 1 : 0,
      slow: null, vulns: {}, dots: {}, fireHit: {},
    })),
    fires: view.lane.fires.map(f => ({ source: f.source, from: f.from, to: f.to, basePerPulse: 0, nextPulse: 0, endTick: f.endTick })),
    upgrades: spirit ? { ...NO_UPGRADES } : { ...mine.upgrades },
    overLimitTicks: myRow?.overLimitTicks ?? 0,
    helperOpens: spirit ? 0 : mine.helperOpens,
    stats: [],
    rng: { summon: { s: 0 }, combat: { s: 0 } },
    nextId: 0,
  };
}
