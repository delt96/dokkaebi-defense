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

  for (const [label, code, text] of [
    ['the room is gone (522)', 522, TEXT.noRoom],
    // the room is still there, only the seat is lost (final review 1)
    ['the key is refused (badKey)', JOIN_ERROR_CODES.badKey, TEXT.badKey],
  ] as const) {
    test(`reconnect stops when ${label} and offers only a new-room link, never a second entry form (checkpoint 17-19, finding 4)`, async () => {
      const { room } = await inBattle();
      room.close(1006);
      join.mockRejectedValueOnce(fail(code));
      await vi.advanceTimersByTimeAsync(2000);
      expect(join).toHaveBeenCalledTimes(2);
      expect(band().textContent).toBe('');
      expect(screen().querySelector('form')).toBeNull();
      expect(screen().textContent).toContain(text);
      if (code !== 522) expect(screen().textContent).not.toContain(TEXT.noRoom);
      const link = screen().querySelector('a[href="/"]');
      expect(link?.textContent).toBe(TEXT.newRoom);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(join).toHaveBeenCalledTimes(2);
      expect(create).not.toHaveBeenCalled();
      expect(battle).toHaveBeenCalledTimes(1);
    });
  }

  test('a reconnected link that drops before its snapshot keeps retrying instead of leaving the band up forever (final review 1)', async () => {
    const { room } = await inBattle();
    room.close(1006);
    const fresh = new FakeRoom('r1');
    join.mockResolvedValueOnce(fresh);
    await vi.advanceTimersByTimeAsync(2000);
    expect(join).toHaveBeenCalledTimes(2);
    fresh.close(1006);
    const again = new FakeRoom('r1');
    join.mockResolvedValueOnce(again);
    await vi.advanceTimersByTimeAsync(2000);
    expect(join).toHaveBeenCalledTimes(3);
    expect(join).toHaveBeenLastCalledWith('r1', { name: '하나', rejoinKey: 'k1' });
    expect(band().textContent).toBe(TEXT.disconnected);
    // the next snapshot reloads the page as before
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, reload, href: 'http://localhost/room/r1', search: '', origin: 'http://localhost' });
    again.emit('full', fixtureFull());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('a reconnected link taken over by another tab stops with the replaced notice', async () => {
    const { room } = await inBattle();
    room.close(1006);
    const fresh = new FakeRoom('r1');
    join.mockResolvedValueOnce(fresh);
    await vi.advanceTimersByTimeAsync(2000);
    fresh.emit('notice', { kind: 'replaced' });
    fresh.close(4001);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(join).toHaveBeenCalledTimes(2);
    expect(screen().textContent).toBe(TEXT.replaced);
    expect(band().textContent).toBe('');
  });

  test('a page load whose stored key is refused says the seat is lost and offers a new room, not a nickname form that cannot get in (final review 1)', async () => {
    saveSession('r1', { key: 'stale', name: '하나' });
    join.mockRejectedValueOnce(fail(JOIN_ERROR_CODES.badKey));
    startOnline({ roomId: 'r1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(screen().querySelector('form')).toBeNull();
    expect(screen().textContent).toContain(TEXT.badKey);
    expect(screen().querySelector('a[href="/"]')?.textContent).toBe(TEXT.newRoom);
  });

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

  test('entering a rematch stores the host token, leaves, and the new page joins with it', async () => {
    const { room } = await inBattle();
    battle.mock.calls[0]![2]('r2', 'h2');
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

describe('online app: music in the ready room', () => {
  test('the lobby plays the normal track and offers the sound controls, kept across lobby updates', async () => {
    const { gameAudio } = await import('../src/audio/engine');
    const music = vi.spyOn(gameAudio, 'musicMode');
    saveSession('r1', { key: 'k0', name: '하나' });
    const room = new FakeRoom('r1');
    join.mockResolvedValueOnce(room);
    startOnline({ roomId: 'r1' });
    await vi.advanceTimersByTimeAsync(0);
    const lobby = { roomId: 'r1', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: false }] };
    room.emit('lobby', lobby);
    expect(music).toHaveBeenLastCalledWith('normal');
    const panel = screen().querySelector('.lobby .lobby-audio');
    expect(panel?.querySelector('#audio-music')).not.toBeNull();
    expect(panel?.querySelector('#audio-effects')).not.toBeNull();
    room.emit('lobby', { ...lobby, seats: [{ seat: 1, name: '하나', ready: true }] });
    expect(screen().querySelector('.lobby .lobby-audio')).toBe(panel);
    music.mockRestore();
  });
});

describe('online app: the sound panel in the ready room closes like a popup', () => {
  test('a press outside or Esc closes it; a press inside keeps it open', async () => {
    saveSession('r1', { key: 'k0', name: '하나' });
    const room = new FakeRoom('r1');
    join.mockResolvedValueOnce(room);
    startOnline({ roomId: 'r1' });
    await vi.advanceTimersByTimeAsync(0);
    room.emit('lobby', { roomId: 'r1', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: false }] });
    const panel = screen().querySelector<HTMLDetailsElement>('.lobby .lobby-audio')!;
    const down = (target: Element) => target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    panel.open = true;
    down(panel.querySelector('#audio-music')!);
    expect(panel.open).toBe(true);
    down(screen().querySelector('.lobby')!);
    expect(panel.open).toBe(false);
    panel.open = true;
    panel.querySelector<HTMLElement>('#audio-music')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.open).toBe(false);
    expect(document.activeElement).toBe(panel.querySelector('summary'));
  });
});

describe('online app: the room link in the ready room', () => {
  async function inLobby(): Promise<FakeRoom> {
    saveSession('r1', { key: 'k0', name: '하나' });
    const room = new FakeRoom('r1');
    join.mockResolvedValueOnce(room);
    startOnline({ roomId: 'r1' });
    await vi.advanceTimersByTimeAsync(0);
    room.emit('lobby', { roomId: 'r1', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: false }] });
    return room;
  }
  const copyButton = () => Array.from(screen().querySelectorAll('button')).find(b => b.textContent === TEXT.copy || b.textContent === TEXT.copied)!;
  const setClipboard = (clipboard: unknown) => Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard'); });

  test('says copied only after the clipboard took the address', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    await inLobby();
    copyButton().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith('http://localhost/room/r1');
    expect(copyButton().textContent).toBe(TEXT.copied);
    expect(screen().querySelector('.lobby-link')).toBeNull();
  });

  for (const [label, clipboard] of [
    ['there is no clipboard (plain http)', undefined],
    ['the clipboard refuses', { writeText: () => Promise.reject(new Error('denied')) }],
  ] as const) {
    test(`shows the address to copy by hand when ${label}`, async () => {
      setClipboard(clipboard);
      const room = await inLobby();
      copyButton().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(copyButton().textContent).toBe(TEXT.copy);
      const field = screen().querySelector<HTMLInputElement>('input.lobby-link')!;
      expect(field.value).toBe('http://localhost/room/r1');
      expect(field.readOnly).toBe(true);
      expect(document.activeElement).toBe(field);
      expect(screen().textContent).toContain(TEXT.copyByHand);
      // a lobby update redraws the screen; the address stays
      room.emit('lobby', { roomId: 'r1', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: true }] });
      expect(screen().querySelector<HTMLInputElement>('input.lobby-link')?.value).toBe('http://localhost/room/r1');
    });
  }

  test('a lobby update while the hand-copy address is selected keeps it focused and selected', async () => {
    setClipboard(undefined);
    const room = await inLobby();
    copyButton().click();
    await vi.advanceTimersByTimeAsync(0);
    const old = screen().querySelector<HTMLInputElement>('input.lobby-link')!;
    old.setSelectionRange(7, 16);
    room.emit('lobby', { roomId: 'r1', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: true }, { seat: 2, name: '둘', ready: false }] });
    const field = screen().querySelector<HTMLInputElement>('input.lobby-link')!;
    expect(field).not.toBe(old);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([7, 16]);
  });
});

describe('online app: leaving the ready room (design 3-2, 3-3)', () => {
  test('leaving the lobby goes back to a new-room start screen with a 4 s note (review focus 2)', async () => {
    const replace = vi.spyOn(history, 'replaceState');
    saveSession('r1', { name: '하나' });
    const room = new FakeRoom('r1');
    join.mockResolvedValueOnce(room);
    startOnline({ roomId: 'r1' });
    screen().querySelector('input')!.value = '하나';
    screen().querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.advanceTimersByTimeAsync(0);
    expect(join).toHaveBeenLastCalledWith('r1', { name: '하나' });
    saveSession('r1', { key: 'k0', name: '하나' });
    room.emit('lobby', { roomId: 'r1', you: 2, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: false }, { seat: 2, name: '하나', ready: false }] });
    Array.from(screen().querySelectorAll('button')).find(b => b.textContent === TEXT.leave)!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(room.left).toBe(1);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/');
    expect(sessionStorage.getItem('dorandi:room:r1')).toBeNull();
    const submit = screen().querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe(TEXT.create);
    expect(screen().querySelector('[data-difficulty]')).not.toBeNull();
    expect(screen().querySelector('.entry-invite')).toBeNull();
    const toast = document.querySelector('.screen-toast');
    expect(toast?.textContent).toBe(TEXT.left);
    expect(toast?.getAttribute('role')).toBe('status');
    expect(screen().contains(toast)).toBe(false);

    // the old link's consented close can arrive late; the start screen stays as it is
    room.close(4000);
    expect(screen().textContent).not.toContain(TEXT.connectFail);
    expect(screen().querySelector('button[type="submit"]')?.textContent).toBe(TEXT.create);

    await vi.advanceTimersByTimeAsync(3999);
    expect(document.querySelector('.screen-toast')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.screen-toast')).toBeNull();
    replace.mockRestore();
  });

  test('a room made after leaving is not disturbed by the old link closing late', async () => {
    const room = new FakeRoom('r1');
    join.mockResolvedValueOnce(room);
    startOnline({ roomId: 'r1' });
    screen().querySelector('input')!.value = '하나';
    screen().querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.advanceTimersByTimeAsync(0);
    room.emit('lobby', { roomId: 'r1', you: 2, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: false }, { seat: 2, name: '하나', ready: false }] });
    Array.from(screen().querySelectorAll('button')).find(b => b.textContent === TEXT.leave)!.click();
    await vi.advanceTimersByTimeAsync(0);

    let resolveCreate!: (r: FakeRoom) => void;
    create.mockReturnValueOnce(new Promise(r => { resolveCreate = r; }) as never);
    screen().querySelector('input')!.value = '하나';
    screen().querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(screen().textContent).toBe(TEXT.connecting);
    room.close(4000);
    expect(screen().textContent).toBe(TEXT.connecting);
    const next = new FakeRoom('r2');
    resolveCreate(next);
    await vi.advanceTimersByTimeAsync(0);
    next.emit('lobby', { roomId: 'r2', you: 1, hostSeat: 1, seats: [{ seat: 1, name: '하나', ready: false }] });
    expect(screen().querySelector('.lobby')).not.toBeNull();
  });
});

