import { describe, expect, test } from 'vitest';
import {
  countNormalEnemies, createGame, loadGameData, spawnEventEnemy, step, type GameEvent, type GameState,
} from '../src/index';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');

function lane(round: number, coins = 100): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  s.coins = coins;
  return s;
}

const beastOf = (s: GameState) => s.enemies.find(e => e.defId === 'ev_soebap');
const rewards = (events: GameEvent[]) => events.filter(e => e.type === 'questReward');

function killNormals(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 5, 0);
  step(s, []);
}

function toLastTick(s: GameState): GameEvent[] {
  s.tick = s.roundEndTick - 1;
  return step(s, []).events;
}

describe('personal mission', () => {
  test('mission entry: 20 coins inside the first 5 s of round 12 brings a 3000-hp beast', () => {
    const s = lane(12);
    s.tick = s.roundStartTick + 99;
    const r = step(s, [{ type: 'missionEnter' }]);
    expect(r.rejected).toEqual([]);
    expect(s.coins).toBe(80);
    expect(beastOf(s)!.hp).toBe(3000);
    expect(s.econ!.mission).toMatchObject({ phase: 'active', beastId: beastOf(s)!.id, beastDown: false });
    expect(step(s, [{ type: 'missionEnter' }]).rejected[0]!.reason).toBe('missionClosed');

    const late = lane(12);
    late.tick = late.roundStartTick + 100;
    expect(step(late, [{ type: 'missionEnter' }]).rejected[0]!.reason).toBe('missionClosed');
    expect(late.coins).toBe(100);

    const poor = lane(12, 19);
    expect(step(poor, [{ type: 'missionEnter' }]).rejected[0]!.reason).toBe('noCoins');
    expect(step(lane(11), [{ type: 'missionEnter' }]).rejected[0]!.reason).toBe('missionClosed');
  });

  test('mission pays 30 coins and 1 buckwheat when 20 normal kills and the beast fall by round end', () => {
    const s = lane(12);
    step(s, [{ type: 'missionEnter' }]);
    const coins0 = s.coins;
    beastOf(s)!.hp = 0;
    step(s, []);
    expect(s.coins).toBe(coins0);
    expect(s.econ!.mission.beastDown).toBe(true);
    killNormals(s, 20);
    expect(s.econ!.roundKills).toBe(20);
    const before = s.coins;
    const ev = toLastTick(s);
    expect(s.coins).toBe(before + 30);
    expect(s.buckwheat).toBe(1);
    expect(rewards(ev)).toEqual([{ type: 'questReward', quest: 'mission', coins: 30, buckwheat: 1, tokens: 0 }]);
    expect(s.econ!.mission.phase).toBe('won');
  });

  test('19 kills or a living beast at round end pays nothing; the beast flees and is not in round 13', () => {
    const s = lane(12);
    step(s, [{ type: 'missionEnter' }]);
    killNormals(s, 25);
    const id = beastOf(s)!.id;
    const before = s.coins;
    const ev = toLastTick(s);
    expect(s.coins).toBe(before);
    expect(s.econ!.mission.phase).toBe('lost');
    expect(ev).toContainEqual({ type: 'flee', enemyId: id });
    expect(beastOf(s)).toBeUndefined();
    const n = countNormalEnemies(s);
    step(s, []);
    expect(s.round).toBe(13);
    expect(beastOf(s)).toBeUndefined();
    expect(countNormalEnemies(s)).toBeGreaterThanOrEqual(n);
    expect(s.econ!.events).toEqual([]);

    const t = lane(12);
    step(t, [{ type: 'missionEnter' }]);
    beastOf(t)!.hp = 0;
    killNormals(t, 19);
    const c = t.coins;
    expect(rewards(toLastTick(t))).toEqual([]);
    expect([t.coins, t.buckwheat, t.econ!.mission.phase]).toEqual([c, 0, 'lost']);
  });

  test('event kills and boss kills do not count toward roundKills', () => {
    const s = lane(12);
    step(s, [{ type: 'missionEnter' }]);
    beastOf(s)!.hp = 0;
    spawnEnemyForTest(s, 'jinegaksi', 3).hp = 0;
    step(s, []);
    expect(s.econ!.roundKills).toBe(0);
  });
});

describe('collection challenge', () => {
  const combine = (s: GameState, a: string, b: string, result: string) => {
    placeUnitForTest(s, a, 0); placeUnitForTest(s, b, 1);
    const r = step(s, [{ type: 'combine', result }]);
    expect(r.rejected).toEqual([]);
    return r.events;
  };

  test('collection pays 20 coins on the third own combine in rounds 21-29 only', () => {
    const s = lane(20);
    combine(s, 'sotlid', 'bujigaengi', 'gamasot');
    expect(s.econ!.collection.done).toEqual([]);
    s.slots.fill(null);
    forceRound(s, 22);
    combine(s, 'sotlid', 'bujigaengi', 'gamasot');
    s.slots[1] = s.slots[0]!; s.slots[0] = null;
    placeUnitForTest(s, 'jipsin', 0); placeUnitForTest(s, 'bitjaru', 2);
    expect(step(s, [{ type: 'combine', result: 'meongseok' }]).rejected).toEqual([]);
    const gamasot = s.slots.findIndex(u => u?.defId === 'gamasot');
    step(s, [{ type: 'sell', slot: gamasot }]);
    expect(s.econ!.collection.done.sort()).toEqual(['gamasot', 'meongseok']);
    s.slots.fill(null);
    forceRound(s, 25);
    const before = s.coins;
    const ev = combine(s, 'bujigaengi', 'horong', 'hwaro');
    expect(s.coins).toBe(before + 20);
    expect(rewards(ev)).toEqual([{ type: 'questReward', quest: 'collection', coins: 20, buckwheat: 0, tokens: 0 }]);
    s.slots.fill(null);
    const again = s.coins;
    expect(rewards(combine(s, 'bujigaengi', 'horong', 'hwaro'))).toEqual([]);
    expect(s.coins).toBe(again);
  });
});

describe('shadow and ssireum', () => {
  test('shadow: 4000 hp at round 43, grows to 16000/16000 after 10 s, pays 5 small or 10 grown, flees at round end', () => {
    const small = lane(43);
    const sh = small.enemies.find(e => e.defId === 'ev_shadow')!;
    expect([sh.hp, sh.maxHp]).toEqual([4000, 4000]);
    expect(countNormalEnemies(small)).toBe(0);
    sh.hp = 0;
    const c0 = small.coins;
    expect(rewards(step(small, []).events)).toEqual([]);
    expect(small.coins).toBe(c0 + 5);

    const big = lane(43);
    const g = big.enemies.find(e => e.defId === 'ev_shadow')!;
    big.tick = big.econ!.events[0]!.spawnTick + 199;
    step(big, []);
    expect(g.maxHp).toBe(4000);
    const ev = step(big, []).events;
    expect([g.hp, g.maxHp]).toEqual([16000, 16000]);
    expect(ev).toContainEqual({ type: 'grow', enemyId: g.id, hp: 16000 });
    g.hp = 0;
    const c1 = big.coins;
    step(big, []);
    expect(big.coins).toBe(c1 + 10);

    const gone = lane(43);
    const id = gone.enemies.find(e => e.defId === 'ev_shadow')!.id;
    expect(toLastTick(gone)).toContainEqual({ type: 'flee', enemyId: id });
    expect(gone.enemies.some(e => e.defId === 'ev_shadow')).toBe(false);
  });

  test('ssireum enemy: 12000 hp, flees after 20 s with no reward, a kill pays 1 buckwheat', () => {
    const s = lane(32);
    const e = spawnEventEnemy(s, 'ssireum', []);
    expect(e.hp).toBe(12000);
    s.tick += 399;
    step(s, []);
    expect(s.enemies).toContain(e);
    const ev = step(s, []).events;
    expect(ev).toContainEqual({ type: 'flee', enemyId: e.id });
    expect(s.enemies).not.toContain(e);
    expect(s.buckwheat).toBe(0);

    const k = lane(32);
    const w = spawnEventEnemy(k, 'ssireum', []);
    w.hp = 0;
    const kev = step(k, []).events;
    expect(k.buckwheat).toBe(1);
    expect(rewards(kev)).toEqual([{ type: 'questReward', quest: 'ssireum', coins: 0, buckwheat: 1, tokens: 0 }]);
    expect(k.econ!.events).toEqual([]);
  });
});
