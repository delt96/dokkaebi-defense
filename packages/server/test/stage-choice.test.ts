import { describe, expect, test } from 'vitest';
import { canonicalJson, fnv1a, loadGameData } from '@dorandi/logic';
import { RoomCore } from '../src/core/RoomCore';
import { FakeLink, fakeDeps, send, started, tickOnce } from './helpers';

const version = (stage: 'stage2' | 'stage3') => fnv1a(canonicalJson(loadGameData(stage), new Set()));
const settle = () => new Promise(r => setTimeout(r, 0));

function lobby(n: number, options = {}) {
  const deps = fakeDeps();
  const core = new RoomCore('room-1', deps, options);
  const links = Array.from({ length: n }, (_, i) => new FakeLink(String.fromCharCode(97 + i)));
  links.forEach((l, i) => core.join(l, { name: `P${i}` }));
  return { core, deps, links };
}

describe('round count choice', () => {
  test('lobby says 20 rounds by default; only the host switches, and that clears every ready', () => {
    const { core, links: [a, b] } = lobby(2);
    expect(a!.last('lobby').stage).toBe('stage2');
    core.message('a', 'ready', { ready: true }); core.message('b', 'ready', { ready: true });
    core.message('b', 'stage', { stage: 'stage3' });
    expect(b!.last('notice')).toEqual({ kind: 'roomError', reason: 'notHost' });
    expect(core.stage).toBe('stage2');
    core.message('a', 'stage', { stage: 'stage9' });
    expect(core.stage).toBe('stage2');
    core.message('a', 'stage', { stage: 'stage3' });
    expect(core.stage).toBe('stage3');
    for (const l of [a!, b!]) expect(l.last('lobby')).toMatchObject({ stage: 'stage3', seats: [{ ready: false }, { ready: false }] });
  });

  test('the switch and the cleared readies arrive in one lobby message; a ready sent for the old choice is dropped', () => {
    const { core, links: [a, b] } = lobby(2);
    core.message('a', 'ready', { ready: true, stage: 'stage2' });
    core.message('b', 'ready', { ready: true, stage: 'stage2' });
    const before = b!.all('lobby').length;
    core.message('a', 'stage', { stage: 'stage3' });
    expect(b!.all('lobby').length).toBe(before + 1);
    expect(b!.last('lobby')).toMatchObject({ stage: 'stage3', seats: [{ ready: false }, { ready: false }] });
    // the guest pressed while the switch was on its way: that press named 20 rounds
    core.message('b', 'ready', { ready: true, stage: 'stage2' });
    expect(core.seats.get(2)!.ready).toBe(false);
    expect(b!.last('lobby')).toMatchObject({ stage: 'stage3', seats: [{ ready: false }, { ready: false }] });
    core.message('b', 'ready', { ready: true, stage: 'stage3' });
    expect(core.seats.get(2)!.ready).toBe(true);
    // un-ready never needs the stage to match
    core.message('b', 'ready', { ready: false, stage: 'stage2' });
    expect(core.seats.get(2)!.ready).toBe(false);
    core.message('a', 'start', {});
    expect(a!.last('notice')).toEqual({ kind: 'roomError', reason: 'notReady' });
  });

  test('a legacy ready only consents to a 20-round room', () => {
    const { core } = lobby(2);
    core.message('a', 'stage', { stage: 'stage3' });
    core.message('b', 'ready', { ready: true });
    core.message('a', 'start', {});
    expect(core.phase).toBe('lobby');
    core.message('a', 'stage', { stage: 'stage2' });
    core.message('b', 'ready', { ready: true });
    core.message('a', 'start', {});
    expect(core.phase).toBe('playing');
  });

  test('a 70-round room starts on stage 3 data and a rejoin gets the same data version', () => {
    const { core, deps, links: [a] } = lobby(2);
    core.message('a', 'stage', { stage: 'stage3' });
    core.message('a', 'difficulty', { difficulty: 'hard' });
    core.message('a', 'ready', { ready: true, stage: 'stage3', difficulty: 'hard' }); core.message('b', 'ready', { ready: true, stage: 'stage3', difficulty: 'hard' });
    core.message('a', 'start', {});
    expect(core.match!.data.balance.rounds).toBe(70);
    const key = a!.last('full').me.key;
    expect(a!.last('full').dataVersion).toBe(version('stage3'));
    expect(version('stage3')).not.toBe(version('stage2'));
    core.message('a', 'stage', { stage: 'stage2' });
    expect(a!.last('notice')).toEqual({ kind: 'roomError', reason: 'notInLobby' });
    core.leave('a', false); tickOnce(core, deps);
    const a2 = new FakeLink('a2'); core.join(a2, { rejoinKey: key }); tickOnce(core, deps);
    expect(a2.last('full').dataVersion).toBe(version('stage3'));
  });

  test('a 20-round room plays stage 2 data exactly as before', () => {
    const { core, links: [a] } = started(['가', '나']);
    expect(core.stage).toBe('stage2');
    expect(a!.last('full').dataVersion).toBe(version('stage2'));
  });

  test('rematch keeps the choice; a room created with stage 3 opens on it', async () => {
    const r = started(['가', '나'], {}, { stage: 'stage3', difficulty: 'hard' });
    expect(r.core.match!.data.balance.rounds).toBe(70);
    send(r.core, 'a', 1, 'forfeit'); send(r.core, 'b', 1, 'forfeit'); tickOnce(r.core, r.deps);
    r.core.message('a', 'rematch', {}); await settle();
    expect(r.deps.createRematchRoom).toHaveBeenCalledWith({ hostToken: expect.any(String), keepOpenMs: expect.any(Number), stage: 'stage3', difficulty: 'hard' });
    const next = lobby(1, { stage: 'stage3' });
    expect(next.links[0]!.last('lobby').stage).toBe('stage3');
  });
});

test('room difficulty is host-owned and pinned on start, rejoin and rematch', async () => {
  expect(() => lobby(1, { difficulty: 'easy' })).toThrow();
  expect(() => lobby(1, { stage: 'stage3', difficulty: 'bad' })).toThrow();
  const { core, deps, links: [a, b] } = lobby(2, { stage: 'stage3', difficulty: 'easy' });
  expect(b!.last('lobby').difficulty).toBe('easy');
  core.message('b', 'difficulty', { difficulty: 'hard' });
  expect(b!.last('notice').reason).toBe('notHost');
  core.message('a', 'difficulty', { difficulty: 'bad' });
  expect(a!.last('notice').reason).toBe('badDifficulty');
  core.message('a', 'stage', { stage: 'stage2' });
  const notices = a!.all('notice').length;
  core.message('a', 'difficulty', { difficulty: 'easy' });
  expect(a!.all('notice')).toHaveLength(notices + 1);
  expect(a!.last('notice').reason).toBe('badDifficulty');
  expect(a!.last('lobby')).not.toHaveProperty('difficulty');
  core.message('a', 'stage', { stage: 'stage3' });
  core.message('b', 'ready', { ready: true, stage: 'stage3' });
  core.message('a', 'difficulty', { difficulty: 'hard' });
  core.message('b', 'ready', { ready: true, stage: 'stage3', difficulty: 'normal' });
  expect(core.seats.get(2)!.ready).toBe(false);
  for (const id of ['a', 'b']) core.message(id, 'ready', { ready: true, stage: 'stage3', difficulty: 'hard' });
  core.message('a', 'start', {});
  expect(a!.last('full').difficulty).toBe('hard');
  expect(core.recording().options.difficulty).toBe('hard');
  core.message('a', 'difficulty', { difficulty: 'easy' });
  expect(a!.last('notice').reason).toBe('notInLobby');
  const key = a!.last('full').me.key;
  core.leave('a', false); tickOnce(core, deps);
  const back = new FakeLink('back');
  core.join(back, { rejoinKey: key }); tickOnce(core, deps);
  expect(back.last('full').difficulty).toBe('hard');
  send(core, 'back', 1, 'forfeit'); send(core, 'b', 1, 'forfeit'); tickOnce(core, deps);
  core.message('back', 'rematch', {}); await settle();
  expect(deps.createRematchRoom).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }));
});
