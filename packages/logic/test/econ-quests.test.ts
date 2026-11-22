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
  s.buckwheat = 0;
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

describe('kill counts', () => {
  test('event kills and boss kills do not count toward roundKills', () => {
    const s = lane(12);
    expect(step(s, [{ type: 'hunt', enemy: 'ev_soebap' }]).rejected).toEqual([]);
    beastOf(s)!.hp = 0;
    spawnEnemyForTest(s, 'jinegaksi', 3).hp = 0;
    step(s, []);
    expect(s.econ!.roundKills).toBe(0);
  });

  test('normal kills count toward roundKills and reset at the next round', () => {
    const s = lane(12);
    killNormals(s, 3);
    expect(s.econ!.roundKills).toBe(3);
    toLastTick(s);
    step(s, []);
    expect(s.round).toBe(13);
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

test('former story nights leave no request state', () => {
  for (const round of [28, 29, 31, 44, 45, 46]) {
    const s = lane(round);
    const result = step(s, []);
    expect(s.econ).not.toHaveProperty('story');
    expect(result.events.filter(e => e.type.startsWith('story'))).toEqual([]);
  }
});

describe('quest outcomes stay on the lane', () => {
  const rec = (s: GameState, id: string) => (s.econ!.questResults as Record<string, unknown>)[id];

  test('collection: checks survive a sale, swaps never check a box, round 29 closes it', () => {
    const s = lane(21, 100);
    placeUnitForTest(s, 'gamasot', 0);
    s.econ!.jige = 1;
    // a swap that lands on a collection item is not an own combine
    const peer = d3.units.find(u => u.id === 'meongseok')!;
    const from = d3.units.find(u => !u.hidden && u.grade === peer.grade && u.id !== 'meongseok')!;
    const unit = placeUnitForTest(s, from.id, 1);
    expect(step(s, [{ type: 'jigeSwap', source: { zone: 'board', index: 1, unitId: unit.id }, result: 'meongseok' }]).rejected).toEqual([]);
    expect(s.econ!.collection.done).toEqual([]);
    const open = lane(29, 100);
    open.econ!.collection.done = ['gamasot'];
    toLastTick(open);
    expect(rec(open, 'collection')).toMatchObject({ outcome: 'timedOut', progress: { done: ['gamasot'] } });
  });

  test('shadow: kill pays and is kept; flee and recruit are told apart', () => {
    const k = lane(43, 0);
    const sh = k.enemies.find(e => e.defId === 'ev_shadow')!;
    expect(rec(k, 'shadow')).toMatchObject({ outcome: 'active' });
    sh.hp = 0;
    step(k, []);
    expect(rec(k, 'shadow')).toEqual({ outcome: 'won', reward: { coins: 5, buckwheat: 0, tokens: 0 }, progress: { grown: false } });
    const f = lane(43, 0);
    toLastTick(f);
    expect(rec(f, 'shadow')).toMatchObject({ outcome: 'fled', reward: { coins: 0 } });
    const t = lane(43, 105);
    t.buckwheat = 2;
    const target = t.enemies.find(e => e.defId === 'ev_shadow')!;
    let ok = false;
    for (let tries = 0; tries < 50 && !ok; tries++) {
      const copy = structuredClone(t);
      copy.econ!.rng.tame.s = t.econ!.rng.tame.s + tries;
      step(copy, [{ type: 'tame', enemyId: target.id }]);
      if (copy.econ!.tamed.length) {
        expect(rec(copy, 'shadow')).toMatchObject({ outcome: 'tamed', reward: { coins: 0, buckwheat: 0, tokens: 0 }, progress: { tamedDefId: 'eoduksini' } });
        ok = true;
      }
    }
    expect(ok).toBe(true);
  });
});
