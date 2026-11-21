// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { JOIN_ERROR_CODES } from '@dorandi/logic';

vi.mock('../src/net/room', () => ({ connectJoin: vi.fn(), connectCreate: vi.fn(), devCreateOptions: () => ({}) }));
vi.mock('../src/online/battle', () => ({ startBattle: vi.fn() }));

import { connectCreate, connectJoin } from '../src/net/room';
import type { NetClient } from '../src/net/NetClient';
import { saveSession } from '../src/net/session';
import { startOnline } from '../src/online/app';
import { startBattle } from '../src/online/battle';
import { TEXT } from '../src/online/text';
import { FakeRoom, fixtureFull } from './fixtures/net';

const join = vi.mocked(connectJoin);
const create = vi.mocked(connectCreate);
const battle = vi.mocked(startBattle);
const fail = (code: number) => Object.assign(new Error('join failed'), { code });
const screen = () => document.getElementById('screen')!;
const band = () => document.getElementById('conn-band')!;

let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="screen"></div>';
  join.mockReset(); create.mockReset(); battle.mockReset();
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign, href: 'http://localhost/room/r1', search: '', origin: 'http://localhost' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** A page opened at /room/r1 with a stored key, in a running match. */
async function inBattle(): Promise<{ room: FakeRoom; net: NetClient }> {
  saveSession('r1', { key: 'k0', name: '하나' });
  const room = new FakeRoom('r1');
  join.mockResolvedValueOnce(room);
  startOnline({ roomId: 'r1' });
  await vi.advanceTimersByTimeAsync(0);
  expect(join).toHaveBeenLastCalledWith('r1', { name: '하나', rejoinKey: 'k0' });
  room.emit('full', fixtureFull());
  expect(battle).toHaveBeenCalledTimes(1);
  return { room, net: battle.mock.calls[0]![0] };
}

describe('online app: leaving and coming back (spec 6)', () => {
  test('a lost link shows the band and retries every 2 seconds with the stored key (checkpoint 17-19, finding 7)', async () => {
    const { room } = await inBattle();
    room.close(1006);
    expect(band().textContent).toBe(TEXT.disconnected);
    join.mockRejectedValue(fail(0));
    await vi.advanceTimersByTimeAsync(1999);
    expect(join).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(join).toHaveBeenCalledTimes(2);
    expect(join).toHaveBeenLastCalledWith('r1', { name: '하나', rejoinKey: 'k1' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(join).toHaveBeenCalledTimes(3);
    expect(band().textContent).toBe(TEXT.disconnected);
  });

  for (const [label, code] of [['the room is gone (522)', 522], ['the key is refused (badKey)', JOIN_ERROR_CODES.badKey]] as const) {
    test(`reconnect stops when ${label} and offers only a new-room link, never a second entry form (checkpoint 17-19, finding 4)`, async () => {
      const { room } = await inBattle();
      room.close(1006);
      join.mockRejectedValueOnce(fail(code));
      await vi.advanceTimersByTimeAsync(2000);
      expect(join).toHaveBeenCalledTimes(2);
      expect(band().textContent).toBe('');
      expect(screen().querySelector('form')).toBeNull();
      expect(screen().textContent).toContain(TEXT.noRoom);
      const link = screen().querySelector('a[href="/"]');
      expect(link?.textContent).toBe(TEXT.newRoom);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(join).toHaveBeenCalledTimes(2);
      expect(create).not.toHaveBeenCalled();
      expect(battle).toHaveBeenCalledTimes(1);
    });
  }

  test('opening an expired invite offers only a new room link', async () => {
    join.mockRejectedValueOnce(fail(522));
    startOnline({ roomId: 'expired' });
    screen().querySelector('input')!.value = '달빛';
    screen().querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.advanceTimersByTimeAsync(0);
    expect(screen().textContent).toContain(TEXT.noRoom);
    expect(screen().querySelector('form')).toBeNull();
    expect(screen().querySelectorAll('a')).toHaveLength(1);
    expect(screen().querySelector('a')?.getAttribute('href')).toBe('/');
  });

  test('a replaced tab shows the notice and does not reconnect (checkpoint 17-19, finding 7)', async () => {
    const { room } = await inBattle();
    room.emit('notice', { kind: 'replaced' });
    room.close(4001);
    expect(screen().textContent).toBe(TEXT.replaced);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(join).toHaveBeenCalledTimes(1);
    expect(band().textContent).toBe('');
  });

  test('my own leave (4000) does not reconnect (checkpoint 17-19, finding 7)', async () => {
    const { net } = await inBattle();
    await net.leave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(join).toHaveBeenCalledTimes(1);
    expect(band().textContent).toBe('');
    expect(screen().textContent).toBe('');
  });

  test('a server close (4000) in a match I did not leave ends with a new-room link (checkpoint 17-19, finding 5)', async () => {
    const { room } = await inBattle();
    room.close(4000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(join).toHaveBeenCalledTimes(1);
    expect(screen().textContent).toContain(TEXT.roomClosed);
    expect(screen().querySelector('a[href="/"]')).not.toBeNull();
  });

  test('a rematch notice stores the host token, leaves, and the new page joins with it (checkpoint 17-19, finding 7)', async () => {
    const { room } = await inBattle();
    room.emit('notice', { kind: 'rematch', roomId: 'r2', hostToken: 'h2' });
    await vi.advanceTimersByTimeAsync(0);
    expect(room.left).toBe(1);
    expect(assign).toHaveBeenCalledWith('/room/r2');
    expect(JSON.parse(sessionStorage.getItem('dorandi.rematch')!)).toEqual({ roomId: 'r2', hostToken: 'h2' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(join).toHaveBeenCalledTimes(1);

    // the new page load
    document.body.innerHTML = '<div id="screen"></div>';
    const next = new FakeRoom('r2');
    join.mockResolvedValueOnce(next);
    startOnline({ roomId: 'r2' });
    await vi.advanceTimersByTimeAsync(0);
    expect(join).toHaveBeenLastCalledWith('r2', { name: '하나', hostToken: 'h2' });
    expect(sessionStorage.getItem('dorandi.rematch')).toBeNull();
  });
});
