import { describe, expect, test } from 'vitest';
import { loadGameData, roundStartTick, unitDefFast } from '@dorandi/logic';
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
  test('gamble validates shape, configured stake and living seat before rolling', () => {
    const r = room60(30);
    const match = r.core.match!;
    const lane = match.lanes[1]!;
    lane.coins = 400;
    lane.econ!.marketOpen = true;
    send(r.core, 'a', 1, 'gambleCoins', { stake: 10, seat: 2 });
    send(r.core, 'a', 2, 'gambleCoins', { stake: 11 });
    send(r.core, 'a', 3, 'gambleUnit', { table: 'huge' });
    send(r.core, 'a', 4, 'gambleUnit', { table: 'small' });
    send(r.core, 'a', 5, 'gambleUnit', { table: 'big' });
    send(r.core, 'a', 6, 'gambleCoins', { stake: 50 });
    tickOnce(r.core, r.deps);
    const mine = r.links[0]!.last('mine');
    expect(mine.acks.map((a: { reason?: string }) => a.reason ?? 'ok')).toEqual([
      'badArgs', 'badArgs', 'badArgs', 'ok', 'noBuckwheat', 'badArgs',
    ]);
    expect(mine.buckwheat).toBe(0);
    expect(mine.econ.market.gamble.units.left).toBe(1);
    expect(match.lanes[2]!.econ!.gamble).toBeUndefined();

    send(r.core, 'a', 7, 'forfeit');
    tickOnce(r.core, r.deps);
    expect(match.seats[1]!.alive).toBe(false);
    const coins = lane.coins;
    send(r.core, 'a', 8, 'gambleCoins', { stake: 10 });
    tickOnce(r.core, r.deps);
    expect(r.links[0]!.last('mine').acks[0]).toMatchObject({ ok: false, reason: 'notAlive' });
    expect(lane.coins).toBe(coins);
  });

  test('a 20-round room declines valid gamble shapes', () => {
    const r = started(['가', '나']);
    send(r.core, 'a', 1, 'gambleCoins', { stake: 10 });
    send(r.core, 'a', 2, 'gambleUnit', { table: 'small' });
    tickOnce(r.core, r.deps);
    expect(r.links[0]!.last('mine').acks.map((a: { reason: string }) => a.reason)).toEqual(['badArgs', 'badArgs']);
  });

  test('only peers get the room notice for a big hit', () => {
    const r = room60(30);
    const lane = r.core.match!.lanes[1]!;
    lane.econ!.marketOpen = true;
    lane.coins = 100;
    lane.econ!.rng.gambleCoins = { s: 43 }; // ×10
    send(r.core, 'a', 1, 'gambleCoins', { stake: 100 });
    tickOnce(r.core, r.deps);
    expect(r.links[1]!.last('notice')).toMatchObject({ kind: 'gamble', hit: '×10 당첨' });
    expect(r.links[0]!.last('notice')).toBeUndefined();
  });

  test.each([67, 43])('a grade 6 or hidden bundle hit tells everyone of the birth instead (seed %s)', seed => {
    const r = room60(30);
    const lane = r.core.match!.lanes[1]!;
    lane.econ!.marketOpen = true;
    lane.buckwheat = 3;
    lane.econ!.rng.gambleUnit = { s: seed };
    send(r.core, 'a', 1, 'gambleUnit', { table: 'big' });
    tickOnce(r.core, r.deps);
    const unitId = r.links[0]!.last('notice')?.unitId;
    const defId = lane.slots.find(u => u?.id === unitId)?.defId;
    expect(defId).toBeDefined();
    for (const link of r.links) {
      expect(link.last('notice')).toEqual({
        kind: 'birth', seat: 1, name: '가', defId, unitId, via: 'gamble', firstSix: unitDefFast(d3, defId!).grade === 6,
      });
      expect(link.all('notice').some(n => n.kind === 'gamble')).toBe(false);
    }
  });

  test('a grade 6 combine tells everyone, and only the first is the team first', () => {
    const r = room60(30);
    const match = r.core.match!;
    for (const [seat, link] of [[1, 'a'], [2, 'b']] as const) {
      const lane = match.lanes[seat]!;
      ['top', 'kkeul', 'jumadeung'].forEach((id, i) => placeUnitForTest(lane, id, i));
      lane.coins = 200;
      lane.buckwheat = 2;
      send(r.core, link, 1, 'combine', { result: 'bihyeongrang' });
      tickOnce(r.core, r.deps);
      for (const l of r.links) {
        expect(l.last('notice')).toMatchObject({ kind: 'birth', seat, defId: 'bihyeongrang', via: 'combine', firstSix: seat === 1 });
      }
    }
  });

  test('a grade 5 combine sends no birth', () => {
    const r = room60(30);
    const lane = r.core.match!.lanes[1]!;
    ['meok', 'jige'].forEach((id, i) => placeUnitForTest(lane, id, i));
    lane.buckwheat = 2;
    send(r.core, 'a', 1, 'combine', { result: 'top' });
    tickOnce(r.core, r.deps);
    expect(lane.slots.some(u => u?.defId === 'top')).toBe(true);
    for (const l of r.links) expect(l.all('notice').some(n => n.kind === 'birth')).toBe(false);
  });

  test('the retired draw is invalid and leaves the wallet and quota untouched', () => {
    const r = room60(30);
    const lane = r.core.match!.lanes[1]!;
    lane.econ!.marketOpen = true;
    lane.buckwheat = 3;
    send(r.core, 'a', 1, 'buy', { item: 'draw' });
    tickOnce(r.core, r.deps);
    const mine = r.links[0]!.last('mine');
    expect(mine.acks).toMatchObject([{ seat: 1, seq: 1, ok: false, reason: 'badArgs' }]);
    expect(lane.buckwheat).toBe(3);
    expect(lane.econ!.gamble).toBeUndefined();
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

  test('a 격파 summon is checked by the room: bad args, closed round, then accepted into the own lane, then out', () => {
    const hunts = d3.economy!.hunts!;
    const [first, , third] = hunts.targets;
    const r = room60(first!.fromRound);
    const match = r.core.match!;
    match.lanes[1]!.coins = 100;
    send(r.core, 'a', 1, 'hunt', { enemy: first!.enemy, level: 9 });
    send(r.core, 'a', 2, 'hunt', {});
    send(r.core, 'a', 3, 'hunt', { enemy: third!.enemy });
    send(r.core, 'a', 4, 'hunt', { enemy: 'japgwi' });
    send(r.core, 'a', 5, 'hunt', { enemy: first!.enemy });
    send(r.core, 'a', 6, 'hunt', { enemy: first!.enemy });
    tickOnce(r.core, r.deps);
    const mine = r.links[0]!.last('mine');
    expect(mine.acks.map((a: { ok: boolean; reason?: string }) => a.reason ?? 'ok')).toEqual(['badArgs', 'badArgs', 'huntClosed', 'noTarget', 'ok', 'huntOut']);
    expect(mine.coins).toBe(100 - first!.fee);
    expect(match.lanes[1]!.enemies.filter(e => e.defId === first!.enemy).length).toBe(1);
    expect(match.lanes[2]!.enemies.some(e => e.defId === first!.enemy)).toBe(false);
    expect(mine.econ.hunts[0]).toMatchObject({ enemy: first!.enemy, level: 1, why: 'huntOut' });
    // the other seat cannot afford it and is told so
    match.lanes[2]!.coins = 0;
    send(r.core, 'b', 1, 'hunt', { enemy: first!.enemy });
    tickOnce(r.core, r.deps);
    expect(r.links[1]!.last('mine').acks).toEqual([{ seat: 2, seq: 1, tick: expect.any(Number), ok: false, reason: 'noCoins' }]);
  });

  test('a 20-round room refuses the economy commands without a crash', () => {
    const r = started(['가', '나']);
    send(r.core, 'a', 1, 'buy', { item: 'draw' });
    send(r.core, 'a', 2, 'transferAccept', { offerId: 1, slot: 0 });
    send(r.core, 'a', 3, 'hunt', { enemy: 'ev_soebap' });
    tickOnce(r.core, r.deps);
    const acks = r.links[0]!.last('mine').acks.map((a: { reason?: string }) => a.reason);
    expect(acks).toEqual(['badArgs', 'badArgs', 'noTarget']);
    expect('econ' in r.links[0]!.last('mine')).toBe(false);
  });
});
