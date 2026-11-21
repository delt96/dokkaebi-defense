import { describe, expect, test } from 'vitest';
import {
  createMatch, loadGameData, roundStartTick, stepMatch, storySlots,
  type MatchCommand, type MatchEvent, type MatchState, type StepMatchResult,
} from '../src/index';
import { jumpToTick, placeUnitForTest } from '../src/testing';

const d3 = loadGameData('stage3');
const rst = (r: number) => roundStartTick(d3, r);

function match(seats: number[] = [1, 2], round = 22): MatchState {
  const m = createMatch(d3, 1, seats);
  for (const s of seats) m.lanes[s]!.econ!.jige = 1;
  jumpToTick(m, rst(round) + 1);
  return m;
}

function go(m: MatchState, inputs: [number, MatchCommand][] = []): StepMatchResult {
  return stepMatch(m, inputs.map(([seat, cmd]) => ({ seat, seq: 0, cmd })));
}

/** Like go() but with acknowledgements, returning each input's rejection reason or null. */
function send(m: MatchState, inputs: [number, MatchCommand][]): { r: StepMatchResult; reasons: (string | null)[] } {
  const r = stepMatch(m, inputs.map(([seat, cmd], i) => ({ seat, seq: m.seats[seat]!.lastSeq + 1 + i, cmd })));
  return { r, reasons: r.acks.map(a => (a.ok ? null : a.reason)) };
}

const ends = (r: StepMatchResult) => r.events.filter(e => e.type === 'transferEnd') as Extract<MatchEvent, { type: 'transferEnd' }>[];
const totals = (m: MatchState) => {
  let units = 0; let cost = 0;
  for (const s of m.ring) for (const u of m.lanes[s]!.slots) if (u) { units++; cost += u.cost ?? 0; }
  return { units, cost };
};

describe('jige transfer', () => {
  test('a delayed response cannot accept or decline a replacement offer', () => {
    for (const type of ['transferAccept', 'transferDecline'] as const) {
      const m = match();
      const u = placeUnitForTest(m.lanes[1]!, 'moru', 0);
      const proposal = { type: 'transferOffer', target: 2, slot: 0, unitId: u.id } as const;
      send(m, [[1, proposal]]);
      const offerId = m.econ!.offers[0]!.offerId;
      send(m, [[1, { type: 'transferDecline', offerId }], [1, proposal]]);
      const response = type === 'transferAccept' ? { type, slot: 1, offerId } : { type, offerId };
      expect(send(m, [[2, response]]).reasons).toEqual(['noOffer']);
      expect(m.econ!.offers).toHaveLength(1);
      expect(m.lanes[1]!.slots[0]).toBe(u);
    }
  });

  test('offer needs a jige, a grade 1-4 normal unit and a connected living target', () => {
    const m = match([1, 2, 3]);
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    const janggu = placeUnitForTest(m.lanes[1]!, 'janggu', 1);
    const hidden = placeUnitForTest(m.lanes[1]!, 'gangcheori', 2);
    m.lanes[3]!.econ!.jige = 0;
    const p3 = placeUnitForTest(m.lanes[3]!, 'jipsin', 0);
    const offer = (slot: number, unitId: number, target = 2) => ({ type: 'transferOffer', target, slot, unitId }) as MatchCommand;
    expect(send(m, [[3, offer(0, p3.id, 1)]]).reasons).toEqual(['noJige']);
    expect(send(m, [[1, offer(1, janggu.id)]]).reasons).toEqual(['badArgs']);
    expect(send(m, [[1, offer(2, hidden.id)]]).reasons).toEqual(['badArgs']);
    expect(send(m, [[1, offer(0, moru.id + 100)]]).reasons).toEqual(['staleUnit']);
    expect(send(m, [[1, offer(0, moru.id, 1)]]).reasons).toEqual(['targetNotAlive']);
    expect(send(m, [[1, offer(0, moru.id, 5)]]).reasons).toEqual(['targetNotAlive']);
    send(m, [[2, { type: 'disconnect' }]]);
    expect(send(m, [[1, offer(0, moru.id, 2)]]).reasons).toEqual(['targetAway']);
    moru.delivered = true;
    expect(send(m, [[1, offer(0, moru.id, 3)]]).reasons).toEqual(['badArgs']);
    delete moru.delivered;
    const ok = send(m, [[1, offer(0, moru.id, 3)]]);
    expect(ok.reasons).toEqual([null]);
    expect(ok.r.events).toContainEqual({ type: 'transferOffer', from: 1, to: 3, defId: 'moru', tick: ok.r.tick });
    expect(moru.locked).toBe(true);
  });

  test('an offered unit attacks but cannot move, be sold, be combined or pay a story request', () => {
    const m = match();
    const lane = m.lanes[1]!;
    const moru = placeUnitForTest(lane, 'moru', 0);
    placeUnitForTest(lane, 'soemangchi', 1);
    placeUnitForTest(lane, 'jipsin', 2);
    lane.buckwheat = 5;
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    expect(send(m, [[1, { type: 'move', from: 0, to: 5 }]]).reasons).toEqual(['locked']);
    expect(send(m, [[1, { type: 'move', from: 2, to: 0 }]]).reasons).toEqual(['locked']);
    expect(send(m, [[1, { type: 'sell', slot: 0 }]]).reasons).toEqual(['locked']);
    expect(send(m, [[1, { type: 'combine', result: 'kkwaenggwari' }]]).reasons).toEqual(['missingMaterials']);
    expect(send(m, [[1, { type: 'combine', result: 'kkwaenggwari', slot: 0, unitId: moru.id }]]).reasons).toEqual(['locked']);
    expect(storySlots(lane, 'cheonnyeonjing').have[2]).toBeNull();
    expect(lane.slots[0]).toBe(moru);
  });

  test('accept at tick +199 moves the unit; +200 has already expired', () => {
    for (const [wait, expected] of [[199, null], [200, 'noOffer']] as const) {
      const m = match();
      const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
      const { r } = send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
      while (m.tick < r.tick + wait) go(m);
      const acc = send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 3 }]]);
      expect(acc.reasons).toEqual([expected]);
      if (expected === null) {
        expect(m.lanes[2]!.slots[3]!.defId).toBe('moru');
        expect(m.lanes[1]!.slots[0]).toBeNull();
      } else {
        expect(moru.locked).toBeUndefined();
        expect(m.lanes[1]!.slots[0]).toBe(moru);
      }
    }
    const m = match();
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    const { r } = send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    while (m.tick < r.tick + 199) go(m);
    const last = go(m);
    expect(ends(last)).toEqual([]);
    expect(ends(go(m))).toEqual([{ type: 'transferEnd', from: 1, to: 2, defId: 'moru', outcome: 'expired', by: null, cause: null }]);
  });

  test('success moves cost and N, marks delivered, starts a 5-round cooldown on both seats and pays the first-delivery buckwheat', () => {
    const m = match([1, 2, 3]);
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    moru.cost = 5;
    const before = totals(m);
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    const acc = send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 4 }]]);
    expect(acc.reasons).toEqual([null]);
    const got = m.lanes[2]!.slots[4]!;
    expect([got.defId, got.cost, got.delivered, got.locked]).toEqual(['moru', 5, true, undefined]);
    expect(got.id).toBe(m.lanes[2]!.nextId - 1);
    expect(acc.r.lanes[2]!.events.some(e => e.type === 'summon' && e.defId === 'moru' && e.slot === 4)).toBe(true);
    expect(ends(acc.r)).toEqual([{ type: 'transferEnd', from: 1, to: 2, defId: 'moru', outcome: 'accepted', by: null, cause: null }]);
    expect(totals(m)).toEqual(before);
    expect([m.lanes[1]!.buckwheat, m.lanes[2]!.buckwheat]).toEqual([2, 2]);
    expect(m.econ!.readyRound).toEqual({ 1: 27, 2: 27 });
    expect(m.econ!.rewarded).toEqual([1, 2]);

    const p = placeUnitForTest(m.lanes[1]!, 'jipsin', 1);
    expect(send(m, [[1, { type: 'transferOffer', target: 3, slot: 1, unitId: p.id }]]).reasons).toEqual(['cooldown']);
    expect(send(m, [[2, { type: 'transferOffer', target: 3, slot: 4, unitId: got.id }]]).reasons).toEqual(['badArgs']);
    const q = placeUnitForTest(m.lanes[3]!, 'jipsin', 0);
    expect(send(m, [[3, { type: 'transferOffer', target: 2, slot: 0, unitId: q.id }]]).reasons).toEqual(['cooldown']);
    jumpToTick(m, rst(26) + 1);
    expect(send(m, [[1, { type: 'transferOffer', target: 3, slot: 1, unitId: p.id }]]).reasons).toEqual(['cooldown']);
    jumpToTick(m, rst(27) + 1);
    expect(send(m, [[1, { type: 'transferOffer', target: 3, slot: 1, unitId: p.id }]]).reasons).toEqual([null]);
    send(m, [[3, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 5 }]]);
    expect([m.lanes[1]!.buckwheat, m.lanes[2]!.buckwheat, m.lanes[3]!.buckwheat]).toEqual([2, 2, 2]);
    expect(m.econ!.rewarded).toEqual([1, 2, 3]);
  });

  test('five senders to one receiver in one tick open one offer; the rest are busy', () => {
    const seats = [1, 2, 3, 4, 5, 6];
    const m = match(seats);
    const inputs: [number, MatchCommand][] = [2, 3, 4, 5, 6].map(s => {
      const u = placeUnitForTest(m.lanes[s]!, 'jipsin', 0);
      return [s, { type: 'transferOffer', target: 1, slot: 0, unitId: u.id }];
    });
    const { reasons } = send(m, inputs);
    expect(reasons).toEqual([null, 'targetBusy', 'targetBusy', 'targetBusy', 'targetBusy']);
    expect(m.econ!.offers.length).toBe(1);
    expect([3, 4, 5, 6].every(s => !m.lanes[s]!.slots[0]!.locked)).toBe(true);
  });

  test('a seat eliminated or disconnected ends the offer as invalid, says which seat and why, and unlocks the unit', () => {
    const cases = [
      [2, { type: 'forfeit' }, 'eliminated'], [2, { type: 'disconnect' }, 'disconnected'],
      [1, { type: 'forfeit' }, 'eliminated'], [1, { type: 'disconnect' }, 'disconnected'],
    ] as const;
    for (const [seat, cmd, cause] of cases) {
      const m = match([1, 2, 3]);
      const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
      send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
      const r = go(m, [[seat, cmd]]);
      expect(ends(r), `${seat} ${cmd.type}`).toEqual([{ type: 'transferEnd', from: 1, to: 2, defId: 'moru', outcome: 'invalid', by: seat, cause }]);
      if (seat === 2) expect(moru.locked).toBeUndefined();
      expect(m.econ!.offers).toEqual([]);
    }
    const m = match([1, 2]);
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    expect(send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 0 }]]).reasons).toEqual([null]);
    expect(send(m, [[1, { type: 'transferDecline', offerId: m.econ?.offers[0]?.offerId ?? 1 }]]).reasons).toEqual(['noOffer']);
  });

  test('decline from either side ends the offer; accepting onto a taken or closed slot is refused', () => {
    const m = match();
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    placeUnitForTest(m.lanes[2]!, 'jipsin', 3);
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    expect(send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 3 }]]).reasons).toEqual(['noSlot']);
    expect(send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 20 }]]).reasons).toEqual(['noSlot']);
    expect(send(m, [[1, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 4 }]]).reasons).toEqual(['noOffer']);
    const { r, reasons } = send(m, [[1, { type: 'transferDecline', offerId: m.econ?.offers[0]?.offerId ?? 1 }]]);
    expect(reasons).toEqual([null]);
    expect(ends(r)).toEqual([{ type: 'transferEnd', from: 1, to: 2, defId: 'moru', outcome: 'declined', by: 1, cause: null }]);
    expect(moru.locked).toBeUndefined();
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    expect(ends(send(m, [[2, { type: 'transferDecline', offerId: m.econ?.offers[0]?.offerId ?? 1 }]]).r)).toEqual([{ type: 'transferEnd', from: 1, to: 2, defId: 'moru', outcome: 'declined', by: 2, cause: null }]);
  });

  test('busy tells the sender\'s own open offer apart from a target already in one', () => {
    const m = match([1, 2, 3, 4]);
    const a = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    const b = placeUnitForTest(m.lanes[1]!, 'jipsin', 1);
    const c = placeUnitForTest(m.lanes[3]!, 'jipsin', 0);
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: a.id }]]);
    expect(send(m, [[1, { type: 'transferOffer', target: 4, slot: 1, unitId: b.id }]]).reasons).toEqual(['busy']);
    expect(send(m, [[3, { type: 'transferOffer', target: 2, slot: 0, unitId: c.id }]]).reasons).toEqual(['targetBusy']);
    expect(send(m, [[3, { type: 'transferOffer', target: 1, slot: 0, unitId: c.id }]]).reasons).toEqual(['targetBusy']);
  });

  test('team reward cap: no more than 6 transfer buckwheat in a match', () => {
    const m = match();
    m.econ!.rewarded = [3, 4, 5, 6, 7, 8];
    const moru = placeUnitForTest(m.lanes[1]!, 'moru', 0);
    send(m, [[1, { type: 'transferOffer', target: 2, slot: 0, unitId: moru.id }]]);
    send(m, [[2, { type: 'transferAccept', offerId: m.econ!.offers[0]?.offerId ?? 1, slot: 4 }]]);
    expect([m.lanes[1]!.buckwheat, m.lanes[2]!.buckwheat]).toEqual([1, 1]);
  });

  test('stage 2 matches refuse transfer commands', () => {
    const m = createMatch(loadGameData('stage2'), 1, [1, 2]);
    jumpToTick(m, roundStartTick(m.data, 2));
    const r = stepMatch(m, [{ seat: 1, seq: 1, cmd: { type: 'transferDecline', offerId: m.econ?.offers[0]?.offerId ?? 1 } }]);
    expect(r.acks[0]).toMatchObject({ ok: false, reason: 'unknown' });
  });
});
