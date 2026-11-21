import { describe, expect, test } from 'vitest';
import {
  createGame, createMatch, loadGameData, roundStartTick, spawnEventEnemy, step, stepMatch, tameCheck,
  type Enemy, type GameEvent, type GameState,
} from '../src/index';
import { forceRound, jumpToTick, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');

function lane(round: number): GameState {
  const s = createGame(d3, 1);
  forceRound(s, round);
  return s;
}

function fillOpen(s: GameState): void {
  for (let i = 0; i < s.slots.length; i++) if (s.open[i] && !s.slots[i]) placeUnitForTest(s, 'jipsin', i);
}

/** A round-20 lane whose wave boss is the gangcheori at 15% (3150/21000) and slowed. */
function gangcheoriLane(): { s: GameState; boss: Enemy } {
  const s = lane(20);
  step(s, []);
  const boss = s.enemies.find(e => e.defId === 'gangcheori')!;
  boss.hp = 3150;
  boss.slow = { pct: 0.3, ticks: 40 };
  s.buckwheat = 1;
  return { s, boss };
}

const kills = (ev: GameEvent[]) => ev.filter(e => e.type === 'kill');

describe('taming', () => {
  test('gangcheori at 3150/21000, slowed: tame places the hidden unit and pays the boss reward once', () => {
    const { s, boss } = gangcheoriLane();
    expect(boss.maxHp).toBe(21000);
    expect(tameCheck(s, boss.id)).toBeNull();
    const coins = s.coins;
    const r = step(s, [{ type: 'tame', enemyId: boss.id }]);
    expect(r.rejected).toEqual([]);
    expect(s.buckwheat).toBe(2);
    expect(s.coins).toBe(coins + 60);
    expect(kills(r.events)).toEqual([{ type: 'kill', enemyId: boss.id }]);
    expect(s.enemies).not.toContain(boss);
    const tamed = s.slots.find(u => u?.defId === 'gangcheori')!;
    expect(tamed.cost).toBe(0);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'tame', enemyId: boss.id, defId: 'gangcheori', unitId: tamed.id }));
    expect(r.events.some(e => e.type === 'summon' && e.defId === 'gangcheori')).toBe(true);
    expect(s.econ!.tamed).toEqual(['gangcheori']);
    const drop = s.slots.filter(u => u && u.defId !== 'gangcheori');
    expect(drop.length).toBe(1);
    expect(d3.units.find(u => u.id === drop[0]!.defId)!.grade).toBe(3);
  });

  test('3151 hp → tameHp; not slowed → tameCondition; no free slot → noSlot; nothing spent', () => {
    const a = gangcheoriLane();
    a.boss.hp = 3151;
    expect(step(a.s, [{ type: 'tame', enemyId: a.boss.id }]).rejected[0]!.reason).toBe('tameHp');
    expect(a.s.buckwheat).toBe(1);

    const b = gangcheoriLane();
    b.boss.slow = null;
    expect(step(b.s, [{ type: 'tame', enemyId: b.boss.id }]).rejected[0]!.reason).toBe('tameCondition');
    expect(b.s.buckwheat).toBe(1);

    const c = gangcheoriLane();
    fillOpen(c.s);
    expect(step(c.s, [{ type: 'tame', enemyId: c.boss.id }]).rejected[0]!.reason).toBe('noSlot');
    expect(c.s.buckwheat).toBe(1);

    const d = gangcheoriLane();
    d.s.buckwheat = 0;
    expect(step(d.s, [{ type: 'tame', enemyId: d.boss.id }]).rejected[0]!.reason).toBe('noBuckwheat');
  });

  test('a queued pity unit does not count as a free slot', () => {
    const { s, boss } = gangcheoriLane();
    fillOpen(s);
    s.pendingPity = ['jipsin'];
    s.econ!.pityQuest = [false];
    expect(step(s, [{ type: 'tame', enemyId: boss.id }]).rejected[0]!.reason).toBe('noSlot');
    expect([s.buckwheat, s.pendingPity]).toEqual([1, ['jipsin']]);
  });

  test('beast: moru 4 stacks → tameCondition, 5 stacks → 60 coins and the mission counts it as down', () => {
    const s = lane(12);
    s.coins = 100;
    step(s, [{ type: 'missionEnter' }]);
    const beast = s.enemies.find(e => e.defId === 'ev_soebap')!;
    beast.hp = 450;
    beast.vulns['moru'] = { pct: 0.04, damageType: 'physical', ticks: 60, stacks: 4 };
    expect(step(s, [{ type: 'tame', enemyId: beast.id }]).rejected[0]!.reason).toBe('tameCondition');
    beast.vulns['moru']!.stacks = 5;
    beast.vulns['moru']!.ticks = 60;
    s.enemies = [beast]; s.spawned = 30;
    const coins = s.coins;
    expect(step(s, [{ type: 'tame', enemyId: beast.id }]).rejected).toEqual([]);
    expect(s.coins).toBe(coins - 60);
    expect(s.econ!.mission.beastDown).toBe(true);
    expect(s.slots.some(u => u?.defId === 'bulgasari')).toBe(true);
  });

  test('ssireum tame pays its own 1 buckwheat; shadow tame spends quest tokens first', () => {
    const s = lane(32);
    const w = spawnEventEnemy(s, 'ssireum', []);
    w.hp = 1800;
    s.buckwheat = 1;
    expect(step(s, [{ type: 'tame', enemyId: w.id }]).rejected).toEqual([]);
    expect(s.buckwheat).toBe(1);
    expect(s.slots.some(u => u?.defId === 'ssireumdokkaebi')).toBe(true);

    const h = lane(43);
    const sh = h.enemies.find(e => e.defId === 'ev_shadow')!;
    sh.hp = 600;
    h.tokens = 3; h.econ!.questTokens = 1;
    const coins = h.coins;
    expect(step(h, [{ type: 'tame', enemyId: sh.id }]).rejected).toEqual([]);
    expect([h.tokens, h.econ!.questTokens]).toEqual([1, 0]);
    expect(h.coins).toBe(coins + 5);
    const t = lane(43);
    const sh2 = t.enemies.find(e => e.defId === 'ev_shadow')!;
    sh2.hp = 600; t.tokens = 1;
    expect(step(t, [{ type: 'tame', enemyId: sh2.id }]).rejected[0]!.reason).toBe('noToken');
  });

  test('event deadlines apply before tame commands on the boundary tick', () => {
    for (const kind of ['ssireum', 'shadow'] as const) {
      const s = lane(kind === 'ssireum' ? 32 : 43);
      const enemy = kind === 'ssireum' ? spawnEventEnemy(s, kind, []) : s.enemies[0]!;
      s.tick += kind === 'ssireum' ? 400 : 200;
      enemy.hp = 1;
      s.buckwheat = 1;
      const r = step(s, [{ type: 'tame', enemyId: enemy.id }]);
      expect(r.rejected[0]?.reason).toBe(kind === 'ssireum' ? 'noTarget' : 'tameHp');
      expect(s.econ!.tamed).toEqual([]);
      expect(r.events.some(e => e.type === (kind === 'ssireum' ? 'flee' : 'grow'))).toBe(true);
    }
  });

  test('jinegaksi3 and a yeoksin are not tameable', () => {
    const s = lane(30);
    const j = spawnEnemyForTest(s, 'jinegaksi3', 2);
    j.hp = 10;
    s.buckwheat = 5;
    expect(step(s, [{ type: 'tame', enemyId: j.id }]).rejected[0]!.reason).toBe('noTarget');
    const y = spawnEnemyForTest(s, 'yeoksin1', 2, 10);
    expect(tameCheck(s, y.id)).toBe('noTarget');
    expect(tameCheck(s, 99999)).toBe('noTarget');
    const imp = spawnEnemyForTest(s, 'japgwi', 2, 1);
    expect(tameCheck(s, imp.id)).toBe('noTarget');
  });

  test('two tame commands in one tick: one unit, one reward; second → noTarget', () => {
    const { s, boss } = gangcheoriLane();
    s.buckwheat = 5;
    const coins = s.coins;
    const r = step(s, [{ type: 'tame', enemyId: boss.id }, { type: 'tame', enemyId: boss.id }]);
    expect(r.rejected.map(x => x.reason)).toEqual(['noTarget']);
    expect(s.slots.filter(u => u?.defId === 'gangcheori').length).toBe(1);
    expect(kills(r.events).length).toBe(1);
    expect(s.coins).toBe(coins + 60);
    expect(s.buckwheat).toBe(5 - 1 + 2);
  });

  test('tame and a lethal hit on the same tick give one kill and one reward', () => {
    const { s, boss } = gangcheoriLane();
    for (let i = 0; i < 6; i++) placeUnitForTest(s, 'cheonnyeonjing', i);
    boss.d = 1;
    boss.hp = 1;
    const coins = s.coins;
    const r = step(s, [{ type: 'tame', enemyId: boss.id }]);
    expect(r.rejected).toEqual([]);
    expect(kills(r.events).length).toBe(1);
    expect(r.events.some(e => e.type === 'damage' && e.enemyId === boss.id)).toBe(false);
    expect(s.coins).toBe(coins + 60);
  });

  test('in a stage-3 match a tamed round-20 boss marks the seat clock killed', () => {
    const m = createMatch(d3, 1, [1]);
    jumpToTick(m, roundStartTick(d3, 20));
    stepMatch(m, []);
    const lane1 = m.lanes[1]!;
    const boss = lane1.enemies.find(e => e.defId === 'gangcheori')!;
    expect(m.seats[1]!.bosses[20]!.status).toBe('fighting');
    boss.hp = 3000;
    boss.slow = { pct: 0.3, ticks: 40 };
    lane1.buckwheat = 1;
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'tame', enemyId: boss.id } }]);
    expect(r.acks[0]).toMatchObject({ ok: true });
    expect(m.seats[1]!.bosses[20]!.status).toBe('killed');
    expect(r.events).toContainEqual({ type: 'bossKilled', seat: 1, round: 20 });
  });
});
