import { describe, expect, test } from 'vitest';
import {
  createGame, createMatch, loadGameData, roundStartTick, stepMatch, nonQuestValue, startRound, step, storySlots, storyView, type GameEvent, type GameState,
} from '../src/index';
import { jumpToTick, placeUnitForTest, spawnEnemyForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const T = 'cheonnyeonjing';

function startAt(s: GameState, round: number): GameEvent[] {
  s.enemies = []; s.fires = []; s.overLimitTicks = 0;
  const ev: GameEvent[] = [];
  startRound(s, round, ev);
  return ev;
}

function endRound(s: GameState): GameEvent[] {
  s.tick = s.roundEndTick - 1;
  return step(s, []).events;
}

function killNormals(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) spawnEnemyForTest(s, 'japgwi', 5, 0);
  step(s, []);
}

/** janggu at 0, moru at 1 (gap: kkwaenggwari), fillers worth `filler` cost, 60 coins and 1 buckwheat. */
function setup(filler = 48): GameState {
  const s = createGame(d3, 1);
  placeUnitForTest(s, 'janggu', 0);
  placeUnitForTest(s, 'moru', 1);
  let left = filler;
  for (let i = 6; left > 0; i++) {
    const u = placeUnitForTest(s, 'jipsin', i);
    u.cost = Math.min(16, left);
    left -= u.cost;
  }
  s.coins = 60; s.buckwheat = 1;
  startAt(s, 27);
  expect(step(s, [{ type: 'storyTarget', id: T }]).rejected).toEqual([]);
  return s;
}

/** Records the gap at the ends of 28 and 29 and opens round 31. */
function toOffer(s: GameState): GameEvent[] {
  startAt(s, 28); endRound(s);
  startAt(s, 29); endRound(s);
  return startAt(s, 31);
}

const ends = (ev: GameEvent[]) => ev.filter(e => e.type === 'storyEnd').map(e => (e as { reason: string }).reason);
const ids = (s: GameState) => s.slots.filter(Boolean).map(u => u!.defId);

describe('story request', () => {
  test('storyTarget rejects grade 5 and hidden ids', () => {
    const s = createGame(d3, 1);
    startAt(s, 1);
    expect(step(s, [{ type: 'storyTarget', id: 'janggu' }]).rejected[0]!.reason).toBe('badTarget');
    expect(step(s, [{ type: 'storyTarget', id: 'jinegaksi' }]).rejected[0]!.reason).toBe('badTarget');
    expect(step(s, [{ type: 'storyTarget', id: 'nope' }]).rejected[0]!.reason).toBe('badTarget');
    expect(step(s, [{ type: 'storyTarget', id: T }]).rejected).toEqual([]);
    expect(step(s, [{ type: 'storyTarget', id: null }]).rejected).toEqual([]);
    expect(s.econ!.story.target).toBeNull();
  });

  test('storySlots fills each recipe place with a distinct unit and reports the gaps', () => {
    const s = setup();
    expect(storySlots(s, T)).toEqual({ have: [0, null, 1], missing: [1] });
  });

  test('offer at round 31 needs the same single gap at the ends of 28 and 29', () => {
    const s = setup();
    const ev = toOffer(s);
    expect(ev).toContainEqual({ type: 'storyOffer', target: T, missing: 'kkwaenggwari', round: 31 });
    expect(s.econ!.story.active).toEqual({ target: T, missing: 1, round: 31 });
    expect(s.econ!.story.offers).toBe(1);

    const only29 = setup();
    startAt(only29, 28);
    only29.slots[1] = null;
    endRound(only29);
    placeUnitForTest(only29, 'moru', 1);
    startAt(only29, 29); endRound(only29);
    expect(startAt(only29, 31).some(e => e.type === 'storyOffer')).toBe(false);
  });

  test('changing the target at round 30 clears the record and no offer comes at 31', () => {
    const s = setup();
    startAt(s, 28); endRound(s);
    startAt(s, 29); endRound(s);
    startAt(s, 30);
    step(s, [{ type: 'storyTarget', id: 'bihyeongrang' }]);
    step(s, [{ type: 'storyTarget', id: T }]);
    expect(s.econ!.story.log).toEqual([]);
    expect(startAt(s, 31).some(e => e.type === 'storyOffer')).toBe(false);
  });

  test('20 normal kills, 60 coins and 1 buckwheat at the end of 31 award cheonnyeonjing', () => {
    const s = setup();
    toOffer(s);
    killNormals(s, 20);
    s.coins = 60;
    const ev = endRound(s);
    expect(ends(ev)).toEqual(['award']);
    expect(ev).toContainEqual({ type: 'questReward', quest: 'story', coins: 0, buckwheat: 0, tokens: 0 });
    expect(ev.some(e => e.type === 'summon' && e.defId === T)).toBe(true);
    expect([s.coins, s.buckwheat]).toEqual([0, 0]);
    expect(s.slots[0]!.defId).toBe(T);
    expect(s.slots[0]!.cost).toBe(0);
    expect(s.slots[1]).toBeNull();
    expect(ids(s)).not.toContain('janggu');
    expect(s.econ!.ledger.story).toBe(16);
    expect(s.econ!.story.awarded).toBe(true);
    expect(s.econ!.story.active).toBeNull();
  });

  test('19 kills → kills; 59 coins → funds; nothing is paid', () => {
    const s = setup();
    toOffer(s);
    killNormals(s, 19);
    s.coins = 60;
    const before = ids(s);
    expect(ends(endRound(s))).toEqual(['kills']);
    expect([s.coins, s.buckwheat, ids(s)]).toEqual([60, 1, before]);

    const f = setup();
    toOffer(f);
    killNormals(f, 20);
    f.coins = 59;
    expect(ends(endRound(f))).toEqual(['funds']);
    expect([f.coins, f.buckwheat, ids(f).length]).toEqual([59, 1, before.length]);
  });

  test('caps: existing Q 4 and N after payment 59 → cap with storyView short 1; N 60 → award', () => {
    const s = setup(59);
    s.econ!.ledger.tokens = 4;
    toOffer(s);
    expect(nonQuestValue(s)).toBe(59 + 24);
    expect(storyView(s)).toMatchObject({ target: T, have: [true, false, true], total: 40, paid: 24, support: 16, used: 4, cap: 20, short: 1 });
    killNormals(s, 20);
    s.coins = 60;
    expect(ends(endRound(s))).toEqual(['cap']);
    expect(s.econ!.ledger.story).toBe(0);

    const ok = setup(60);
    ok.econ!.ledger.tokens = 4;
    toOffer(ok);
    expect(storyView(ok)!.short).toBe(0);
    killNormals(ok, 20);
    ok.coins = 60;
    expect(ends(endRound(ok))).toEqual(['award']);
  });

  test('getting the third material ends the request at once and normal combine works', () => {
    const s = setup();
    toOffer(s);
    placeUnitForTest(s, 'kkwaenggwari', 2);
    expect(ends(step(s, []).events)).toEqual(['gotMaterial']);
    expect(step(s, [{ type: 'combine', result: T }]).rejected).toEqual([]);
    expect(ids(s)).toContain(T);
  });

  test('crafting and selling the last material in one tick ends the story', () => {
    const s = setup();
    toOffer(s);
    placeUnitForTest(s, 'moru', 2);
    placeUnitForTest(s, 'soemangchi', 3);
    const r = step(s, [{ type: 'combine', result: 'kkwaenggwari', slot: 2 }, { type: 'sell', slot: 2 }]);
    expect(r.rejected).toEqual([]);
    expect(ends(r.events)).toEqual(['gotMaterial']);
    expect(s.econ!.story.active).toBeNull();
  });

  test('forfeiting ends an active story on the eliminated lane', () => {
    const m = createMatch(d3, 1, [1, 2]);
    jumpToTick(m, roundStartTick(d3, 31) + 1);
    const lane = m.lanes[1]!;
    placeUnitForTest(lane, 'janggu', 0);
    placeUnitForTest(lane, 'moru', 1);
    lane.econ!.story.active = { target: T, missing: 1, round: 31 };
    stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'forfeit' } }]);
    expect(lane.econ!.story.active).toBeNull();
  });

  test('selling moru ends with lostMaterial; decline ends with declined and costs nothing', () => {
    const s = setup();
    toOffer(s);
    expect(ends(step(s, [{ type: 'sell', slot: 1 }]).events)).toEqual(['lostMaterial']);
    expect(step(s, [{ type: 'storyDecline' }]).rejected[0]!.reason).toBe('notOffered');

    const d = setup();
    toOffer(d);
    const coins = d.coins;
    expect(ends(step(d, [{ type: 'storyDecline' }]).events)).toEqual(['declined']);
    expect([d.coins, d.econ!.story.active]).toEqual([coins, null]);
  });

  test('a failed 31 can be offered again at 46; after an award no offer comes at 46', () => {
    const s = setup();
    toOffer(s);
    endRound(s);
    startAt(s, 44); endRound(s);
    startAt(s, 45); endRound(s);
    expect(startAt(s, 46)).toContainEqual({ type: 'storyOffer', target: T, missing: 'kkwaenggwari', round: 46 });
    expect(s.econ!.story.offers).toBe(2);

    const a = setup();
    toOffer(a);
    killNormals(a, 20);
    a.coins = 60;
    endRound(a);
    placeUnitForTest(a, 'janggu', 2); placeUnitForTest(a, 'moru', 3);
    startAt(a, 44); endRound(a);
    startAt(a, 45); endRound(a);
    expect(startAt(a, 46).some(e => e.type === 'storyOffer')).toBe(false);
  });

  test('pinned unit ids choose which duplicate material is paid', () => {
    const s = setup();
    const extra = placeUnitForTest(s, 'moru', 4);
    expect(storySlots(s, T).have).toEqual([0, null, 1]);
    step(s, [{ type: 'storyTarget', id: T, unitIds: [extra.id] }]);
    expect(storySlots(s, T).have).toEqual([0, null, 4]);
    toOffer(s);
    killNormals(s, 20);
    s.coins = 60;
    expect(ends(endRound(s))).toEqual(['award']);
    expect(s.slots[4]).toBeNull();
    expect(s.slots[1]!.defId).toBe('moru');
  });
});
