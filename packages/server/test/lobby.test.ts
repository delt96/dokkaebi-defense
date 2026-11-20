import { describe, expect, test } from 'vitest';
import { RoomCore, JoinError } from '../src/core/RoomCore';
import { FakeLink, fakeDeps } from './helpers';

const room = (over = {}, options = {}) => { const deps = fakeDeps(over); return { deps, core: new RoomCore('room-1', deps, options) }; };
const joinErr = (fn: () => void) => { try { fn(); } catch (e) { return (e as JoinError).reason; } return null; };

describe('lobby', () => {
  test('seats, host, duplicate names (case-insensitive), 7th join', () => {
    const { core } = room();
    const links = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => new FakeLink(id));
    links.forEach((l, i) => core.join(l, { name: `P${i}` }));
    expect(links[0]!.last('lobby')).toMatchObject({ you: 1, hostSeat: 1, seats: [{ seat: 1, name: 'P0', ready: false }, { seat: 2 }, { seat: 3 }, { seat: 4 }, { seat: 5 }, { seat: 6 }] });
    expect(joinErr(() => core.join(new FakeLink('g'), { name: 'Q' }))).toBe('roomFull');
    core.leave('a', true); core.leave('c', true);
    expect(links[1]!.last('lobby')).toMatchObject({ hostSeat: 2 });
    expect(joinErr(() => core.join(new FakeLink('h'), { name: 'p1' }))).toBe('dupName');
    expect(joinErr(() => core.join(new FakeLink('i'), { name: ' ' }))).toBe('badName');
    const n = new FakeLink('j'); core.join(n, { name: '새' });
    expect(n.last('lobby')!.you).toBe(1);
  });
  test('start needs host and everyone ready; double start makes one match', () => {
    const { core, deps } = room();
    const a = new FakeLink('a'), b = new FakeLink('b');
    core.join(a, { name: '가' }); core.join(b, { name: '나' });
    core.message('b', 'start', {});
    expect(b.last('notice')).toEqual({ kind: 'roomError', reason: 'notHost' });
    core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(a.last('notice')).toEqual({ kind: 'roomError', reason: 'notReady' });
    core.message('b', 'ready', { ready: true });
    core.message('a', 'start', {}); core.message('a', 'start', {});
    expect(core.phase).toBe('playing');
    expect(a.all('full').length).toBe(1);
    expect(a.last('full')).toMatchObject({ me: { seat: 1 }, watching: 1, clock: { tick: -1 } });
    expect(a.last('full').me.key).not.toBe(b.last('full').me.key);
    expect(core.match!.ring).toEqual([1, 2]);
    expect(deps.autoDispose).toBe(false);
  });
  test('one player can start alone', () => {
    const { core } = room(); const a = new FakeLink('a');
    core.join(a, { name: '혼자' }); core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(core.match!.ring).toEqual([1]);
  });
  test('after start a new name cannot join', () => {
    const { core } = room(); const a = new FakeLink('a');
    core.join(a, { name: '가' }); core.message('a', 'ready', { ready: true }); core.message('a', 'start', {});
    expect(joinErr(() => core.join(new FakeLink('b'), { name: '나' }))).toBe('alreadyStarted');
  });
  test('seed option only in dev mode; empty lobby disposes', () => {
    const prod = room({}, { seed: 7 }); const a = new FakeLink('a');
    prod.core.join(a, { name: '가' }); prod.core.message('a', 'ready', { ready: true }); prod.core.message('a', 'start', {});
    expect(prod.core.match!.seed).toBe(42);
    const dev = room({ dev: true }, { seed: 7 }); const b = new FakeLink('b');
    dev.core.join(b, { name: '가' }); dev.core.message('b', 'ready', { ready: true }); dev.core.message('b', 'start', {});
    expect(dev.core.match!.seed).toBe(7);
    const empty = room(); const c = new FakeLink('c');
    empty.core.join(c, { name: '가' }); empty.core.leave('c', false);
    expect(empty.deps.disposed).toBe(true);
  });
  test('rematch host token outranks earlier joiners', () => {
    const { core } = room({}, { hostToken: 'tok' });
    const a = new FakeLink('a'), b = new FakeLink('b');
    core.join(a, { name: '가' }); core.join(b, { name: '나', hostToken: 'tok' });
    expect(a.last('lobby')!.hostSeat).toBe(2);
  });
});
