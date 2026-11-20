import { describe, expect, test } from 'vitest';
import { countNormalEnemies, createGame, loadGameData, pickTarget, step, type GameEvent } from '../src/index';
import { resolveKills, unitAttacks } from '../src/combat';
import { moveEnemies } from '../src/flow';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const shared = { id: 'testShared', name: '공용', boss: false, shared: true, hpMult: 1, speed: 2, resist: { physical: 0, magical: 0 } };
const data = makeData(d => { d.enemies.push(shared); });
const forced = makeData(d => {
  d.enemies.push(shared);
  for (const u of d.units) for (const s of u.skills) if (s.trigger.kind === 'chance') s.trigger.p = 1;
});
const quiet = (d = data) => { const s = createGame(d, 1); forceRound(s, 1); s.spawned = 30; s.roundEndTick = 1e9; s.enemies = []; return s; };

describe('shared enemy', () => {
  test('not counted, no reward, not in round stats', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    const e = spawnEnemyForTest(s, 'testShared', 3, 1);
    expect(countNormalEnemies(s)).toBe(0);
    const r = step(s, []);
    expect(r.events).toContainEqual({ type: 'kill', enemyId: e.id });
    expect(s).toMatchObject({ coins: 0, buckwheat: 0 });
    expect(s.stats.at(-1)).toMatchObject({ hpSpawned: 0, damageDealt: 0, damageInRound: 0 });
  });
  test('target priority: boss, then shared, then normal', () => {
    const s = quiet(); placeUnitForTest(s, 'horong', 2);
    spawnEnemyForTest(s, 'japgwi', 3, 1e9);
    const sh = spawnEnemyForTest(s, 'testShared', 3, 1e9);
    expect(pickTarget(s, 2)!.id).toBe(sh.id);
    const b = spawnEnemyForTest(s, 'jinegaksi', 3, 1e9);
    expect(pickTarget(s, 2)!.id).toBe(b.id);
  });
  test('ignores stun, slow and knockback; takes vuln and dot', () => {
    const s = quiet(forced);
    const e = spawnEnemyForTest(s, 'testShared', 3, 1e9);
    const events: GameEvent[] = [];
    for (const id of ['sotlid', 'meongseok', 'buchae', 'dadeumi', 'horong']) {
      placeUnitForTest(s, id, 2);
      unitAttacks(s, events);
    }
    expect(e).toMatchObject({ stunTicks: 0, slow: null, d: 3 });
    expect(Object.keys(e.vulns)).toEqual(['dadeumi']);
    expect(Object.keys(e.dots)).toEqual(['horong']);
    expect(events.some(x => x.type === 'speedChange' && x.enemyId === e.id)).toBe(false);
  });
  test('moveEnemies leaves shared enemies where they are', () => {
    const s = quiet(); const e = spawnEnemyForTest(s, 'testShared', 5, 1e9);
    moveEnemies(s); expect(e.d).toBe(5);
  });
  test('resolveKills with finalClear false does not end the game on the round-20 boss', () => {
    const s = createGame(loadGameData(), 1); forceRound(s, 20); step(s, []);
    const boss = s.enemies.find(x => x.boss)!; boss.hp = 0;
    const events: GameEvent[] = [];
    resolveKills(s, events, { finalClear: false });
    expect(s.result).toBeNull();
    expect(events).toContainEqual({ type: 'kill', enemyId: boss.id });
  });
});
