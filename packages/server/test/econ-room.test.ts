import { describe, expect, test } from 'vitest';
import { loadGameData, roundStartTick } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { send, started, tickOnce } from './helpers';

const d3 = loadGameData('stage3');

/** A two-seat 60-round room jumped to just after `round` started. */
function room60(round: number) {
  const r = started(['가', '나'], { dev: true }, { stage: 'stage3', devJumpTick: roundStartTick(d3, round) + 1 });
  tickOnce(r.core, r.deps);
  return r;
}

describe('stage 3 economy commands through the room', () => {
  test('a bundle buy is parsed, stepped, acked and shows in the buyer\'s mine', () => {
    const r = room60(2);
    const lane = r.core.match!.lanes[1]!;
    lane.coins = 200;
    send(r.core, 'a', 1, 'buy', { item: 'draw' });
    tickOnce(r.core, r.deps);
    const mine = r.links[0]!.last('mine');
    expect(mine.acks).toEqual([{ seat: 1, seq: 1, tick: expect.any(Number), ok: true }]);
    expect(mine.coins).toBe(200);
    expect(mine.econ.market.draw.left).toBe(d3.economy!.market!.draw.perDay - 1);
    expect(mine.units.filter(Boolean).length).toBe(1);
    // the other seat's mine carries its own economy, untouched
    expect(r.links[1]!.last('full').mine.econ.market.draw.left).toBe(d3.economy!.market!.draw.perDay);
    send(r.core, 'a', 2, 'buy', { item: 'crate' });
    tickOnce(r.core, r.deps);
    expect(r.links[0]!.last('mine').acks).toEqual([{ seat: 1, seq: 2, tick: expect.any(Number), ok: false, reason: 'badArgs' }]);
  });

  test('delivery inputs are invalid in a new room', () => {
    const r = room60(3);
    const match = r.core.match!;
    const unit = placeUnitForTest(match.lanes[1]!, 'jipsin', 4);
    const before = [1, 2].map(s => ({ ids: match.lanes[s]!.slots.map(u => u?.id ?? null), buckwheat: match.lanes[s]!.buckwheat }));
    send(r.core, 'a', 1, 'transferOffer', { target: 2, slot: 4, unitId: unit.id });
    send(r.core, 'a', 2, 'transferAccept', { offerId: 1, slot: 2 });
    send(r.core, 'a', 3, 'transferDecline', { offerId: 1 });
    tickOnce(r.core, r.deps);
    const mine = r.links[0]!.last('mine');
    expect(mine.acks.map((a: { reason?: string }) => a.reason)).toEqual(['badArgs', 'badArgs', 'badArgs']);
    for (let i = 0; i < 200; i++) tickOnce(r.core, r.deps);
    const after = [1, 2].map(s => ({ ids: match.lanes[s]!.slots.map(u => u?.id ?? null), buckwheat: match.lanes[s]!.buckwheat }));
    expect(after).toEqual(before);
    expect('transfer' in r.links[0]!.last('mine').econ).toBe(false);
    expect('transferEnds' in r.links[0]!.last('mine')).toBe(false);
    expect('offers' in match.econ!).toBe(false);
  });

  test('a 20-round room refuses the economy commands without a crash', () => {
    const r = started(['가', '나']);
    send(r.core, 'a', 1, 'buy', { item: 'draw' });
    send(r.core, 'a', 2, 'transferAccept', { offerId: 1, slot: 0 });
    tickOnce(r.core, r.deps);
    const acks = r.links[0]!.last('mine').acks.map((a: { reason?: string }) => a.reason);
    expect(acks).toEqual(['marketClosed', 'badArgs']);
    expect('econ' in r.links[0]!.last('mine')).toBe(false);
  });
});
