import { describe, expect, test } from 'vitest';
import {
  applyFull, applyLane, applyMine, applyTick, buildFull, diffViews, loadGameData, matchHash, replayMatch, toWire,
  type Ack, type ClientView, type TickMsg,
} from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { normalBot, type Bot } from '@dorandi/sim/src/bots';
import { spiritSupport } from '@dorandi/sim/src/coop';
import { FakeLink, send, started, tickOnce } from './helpers';

describe('match room', () => {
  test('commands go to the next tick and the mine ack arrives right after that tick', () => {
    const { core, deps, links: [a] } = started(['가']);
    send(core, 'a', 1, 'summon');
    expect(a!.all('mine').length).toBe(0);
    tickOnce(core, deps);
    expect(a!.last('mine')).toMatchObject({ tick: 0, acks: [{ seat: 1, seq: 1, tick: 0, ok: true }], tokens: 3 });
    expect(core.log).toEqual([{ tick: 0, inputs: [{ seat: 1, seq: 1, cmd: { type: 'summon' } }] }]);
  });
  test('a command after the tick closes is logged on the next tick', () => {
    const { core, deps } = started(['가']);
    tickOnce(core, deps); send(core, 'a', 1, 'summon'); tickOnce(core, deps);
    expect(core.log[0]!.tick).toBe(1);
  });
  test('same-tick combine/sell conflict applies once; the rejected one costs nothing', () => {
    const { core, deps, links: [a] } = started(['가']);
    const lane = core.match!.lanes[1]!;
    const s = placeUnitForTest(lane, 'sotlid', 0); const b = placeUnitForTest(lane, 'bujigaengi', 1);
    send(core, 'a', 1, 'combine', { result: 'gamasot', slot: 0, unitId: s.id });
    send(core, 'a', 2, 'sell', { slot: 1, unitId: b.id });
    tickOnce(core, deps);
    expect(a!.last('mine').acks.map((x: Ack) => (x.ok ? 'ok' : x.reason))).toEqual(['ok', 'staleUnit']);
    expect(lane.coins).toBe(0); expect(lane.slots[0]!.defId).toBe('gamasot');
  });
  test('duplicate seq is not re-run; seats come from the connection, not the payload', () => {
    const { core, deps, links: [, b] } = started(['가', '나']);
    send(core, 'a', 1, 'summon'); send(core, 'a', 1, 'summon');
    core.message('b', 'cmd', { seq: 1, type: 'summon', seat: 1 });
    tickOnce(core, deps);
    expect(core.match!.lanes[1]!.tokens).toBe(3);
    expect(b!.last('mine').acks).toEqual([{ seat: 2, seq: 1, tick: 0, ok: false, reason: 'badArgs' }]);
  });
  test('the 21st command in one tick is dropped without an ack', () => {
    const { core, deps, links: [a] } = started(['가']);
    for (let i = 1; i <= 21; i++) send(core, 'a', i, 'helperOpened');
    tickOnce(core, deps);
    expect(a!.last('mine').acks.length).toBe(20);
    expect(core.match!.lanes[1]!.helperOpens).toBe(20);
  });
  test('garbled messages never throw and only well-numbered ones get badArgs (review focus 4)', () => {
    const { core, deps, links: [a] } = started(['가']);
    for (const raw of [null, 'x', { seq: 1.5 }, { seq: 1, type: '__proto__' }, { seq: 2, type: 'move', args: { from: '3', to: 1, unitId: 1, toUnitId: null } }]) core.message('a', 'cmd', raw);
    core.message('a', 'nope', { x: 1 }); core.message('zzz', 'cmd', { seq: 1, type: 'summon' });
    tickOnce(core, deps);
    expect(a!.last('mine').acks.map((x: Ack) => (x.ok ? x.seq : `${x.seq}:${x.reason}`))).toEqual(['1:badArgs', '2:badArgs']);
    tickOnce(core, deps); expect(core.match!.tick).toBe(2);
  });
  test('a 2 s stall runs all 40 ticks and sends 20 numbered updates in order (review focus 2)', () => {
    const { core, deps, links: [a] } = started(['가']);
    deps.clock.t += 2000; core.advance();
    expect(core.match!.tick).toBe(40);
    expect(a!.all('tick').map((m: TickMsg) => m.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  test('initial full + stream equals a new full; a skipped update is answered by resync', () => {
    const { core, deps, links: [a] } = started(['가', '나']);
    let view = applyFull(a!.last('full'));
    let seen = 0;
    const pump = () => { for (const { type, msg } of a!.sent.slice(seen)) {
      if (type === 'tick') applyTick(view, msg); if (type === 'lane') applyLane(view, msg); if (type === 'mine') applyMine(view, msg); }
      seen = a!.sent.length; };
    for (let i = 0; i < 300; i++) { if (i % 37 === 0) send(core, 'a', i / 37 + 1, 'summon'); tickOnce(core, deps); pump(); }
    core.message('a', 'resync', {});
    expect(diffViews(view, applyFull(a!.last('full')))).toEqual([]);
    view = applyFull(a!.last('full')); seen = a!.sent.length;
    tickOnce(core, deps); tickOnce(core, deps); a!.sent.splice(seen);
    tickOnce(core, deps); tickOnce(core, deps);
    expect(applyTick(view, a!.last('tick'))).toBe('gap');
  });
  test('whole game: 6 normal bots through the room; clients match the server full every 100 ticks; replay matches', () => {
    const names = ['가', '나', '다', '라', '마', '바'];
    const { core, deps, links } = started(names);
    const match = core.match!;
    const ids = new Map<number, string>(links.map((l, i) => [i + 1, l.id]));
    const bots = new Map<number, Bot>(links.map((_, i) => [i + 1, normalBot()]));
    const seqs = new Map<number, number>(links.map((_, i) => [i + 1, 0]));
    const nextSeq = (seat: number) => { const n = seqs.get(seat)! + 1; seqs.set(seat, n); return n; };

    // Each link keeps its own client view, built only from the messages it received.
    const views = new Map<FakeLink, ClientView>();
    const seen = new Map<FakeLink, number>();
    for (const l of links) { views.set(l, applyFull(l.last('full'))); seen.set(l, l.sent.length); }
    const pump = (l: FakeLink) => {
      let view = views.get(l)!;
      for (const { type, msg } of l.sent.slice(seen.get(l)!)) {
        if (type === 'full') view = applyFull(msg);
        else if (type === 'tick') expect(applyTick(view, msg)).toBe('ok');
        else if (type === 'lane') expect(applyLane(view, msg)).not.toBe('gap');
        else if (type === 'mine') applyMine(view, msg);
        else if (type === 'result') view.result = structuredClone(msg.result);
      }
      views.set(l, view);
      seen.set(l, l.sent.length);
    };

    const hashes: [number, string][] = [];
    const mismatches: string[] = [];
    let watchChanges = 0;
    while (core.phase === 'playing') {
      const t = match.tick;
      if (t % 10 === 0) {
        for (const seat of match.ring) {
          if (match.seats[seat]!.alive) {
            for (const cmd of bots.get(seat)!.decide(match.lanes[seat]!)) {
              const w = toWire(cmd, match.lanes[seat]!);
              send(core, ids.get(seat)!, nextSeq(seat), w.type, w.args);
            }
          } else {
            const cmd = spiritSupport(match, seat);
            if (cmd && cmd.type === 'support') send(core, ids.get(seat)!, nextSeq(seat), 'support', { target: cmd.target });
          }
        }
      }
      if (t === 3000) send(core, 'f', nextSeq(6), 'forfeit');
      if (t === 4000 || t === 6000) {
        const before = views.get(links[5]!)!.watching;
        core.message('f', 'watch', { seat: t === 4000 ? 2 : 3 });
        pump(links[5]!);
        if (views.get(links[5]!)!.watching !== before) watchChanges++;
      }
      tickOnce(core, deps);
      for (const l of links) pump(l);
      if (match.tick % 100 === 0) {
        hashes.push([match.tick, matchHash(match)]);
        for (const l of links) {
          const view = views.get(l)!;
          const fresh = applyFull(buildFull(match, view.me.seat, { watching: view.watching, names: core.names, key: view.me.key, n: core.n }));
          const diff = diffViews(view, fresh);
          if (diff.length > 0) mismatches.push(`tick ${match.tick} seat ${view.me.seat}: ${diff.slice(0, 5).join(', ')}`);
        }
        expect(mismatches.slice(0, 3)).toEqual([]);
      }
    }
    if (match.tick % 100 !== 0) hashes.push([match.tick, matchHash(match)]);

    expect(core.phase).toBe('result');
    expect(match.seats[6]!.alive).toBe(false);
    expect(watchChanges).toBeGreaterThan(0);
    for (const l of links) expect(l.last('result')).toEqual({ result: match.result });
    expect(core.log.length).toBeGreaterThan(0);

    const replayed = replayMatch(loadGameData('stage2'), match.seed, match.ring, core.log);
    const firstDiff = replayed.findIndex((h, i) => h[0] !== hashes[i]?.[0] || h[1] !== hashes[i]?.[1]);
    const diffTick = firstDiff < 0 ? (replayed.length === hashes.length ? null : Math.min(replayed.length, hashes.length)) : replayed[firstDiff]![0];
    expect(diffTick, `replay first differs at tick ${diffTick}`).toBeNull();
  }, 300_000);
});
