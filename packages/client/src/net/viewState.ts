import { enemyDistanceAt, type ClientView, type GameData, type GameState, type MineUnitView, type UpgradeId } from '@dorandi/logic';

function slowOf(data: GameData, defId: string, speed: number): { pct: number; ticks: number } | null {
  const base = data.enemies.find(d => d.id === defId)?.speed ?? 0;
  return speed > 0 && base > 0 && speed < base - 1e-9 ? { pct: 1 - speed / base, ticks: 1 } : null;
}

const NO_UPGRADES: Record<UpgradeId, number> = { physical: 0, magical: 0, polish: 0, slots: 0 };

/**
 * The server's display state in GameState shape, so LaneScene and the 1-player panels can read it.
 * Nothing here is simulated: combat fields the browser never sees are zero or empty.
 */
export function viewToGameState(
  view: ClientView, data: GameData, units: (MineUnitView | null)[], renderTick: number, storage?: MineUnitView[],
): GameState {
  const myRow = view.rows.find(r => r.seat === view.me.seat);
  const spirit = myRow?.status === 'spirit';
  const mine = view.mine;
  const ownLane = view.watching === view.me.seat;
  // the own units carry their book cost from `mine` (stage 3); another lane's never do
  const toUnit = (u: MineUnitView) => ({ id: u.id, defId: u.defId, cooldown: 0, attackCount: 0, periodic: [], ...(u.cost !== undefined && { cost: u.cost }) });
  return {
    data,
    ...(data.balance.difficulties && { difficulty: view.difficulty ?? 'normal' }),
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
    slots: units.map(u => (u ? toUnit(u) : null)),
    // only the own living lane has a storage on screen
    ...(storage && ownLane && !spirit ? { storage: storage.map(toUnit) } : {}),
    // the own board comes from `mine` (sent at once), another lane's from the lane stream
    open: [...(ownLane && !spirit ? mine.open : view.lane.open)],
    summonCounts: {},
    grade1Summons: spirit ? 0 : mine.grade1Summons,
    enemies: view.lane.enemies.map(e => ({
      id: e.id, defId: e.defId, hp: e.hp, maxHp: e.maxHp,
      // never draw before the enemy's base tick: going back past a spawn or speed change would misplace it
      d: enemyDistanceAt(e, Math.max(renderTick, e.t)),
      boss: e.boss, round: view.clock.round, stunTicks: e.speed === 0 ? 1 : 0,
      // the view carries only the speed: below the enemy's own speed means slowed (drawn blue)
      slow: slowOf(data, e.defId, e.speed), vulns: {}, dots: {}, fireHit: {},
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
