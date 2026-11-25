// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { NICKNAME_MAX, normalizeNickname } from '@dorandi/logic';
import { renderEntry } from '../src/online/entry';
import { lobbyModel } from '../src/online/lobby';
import { joinErrorText, TEXT } from '../src/online/text';

describe('entry and lobby', () => {
  test('join error texts', () => {
    expect(joinErrorText(4102)).toBe('방에 같은 닉네임이 있습니다');
    expect(joinErrorText(4103)).toBe('가득 찬 방입니다');
    expect(joinErrorText(522)).toBe('없거나 끝난 방입니다');
    expect(joinErrorText(9999)).toBe('서버에 연결하지 못했습니다');
  });
  test('lobby model', () => {
    const m = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: [{ seat: 1, name: '가', ready: true }, { seat: 2, name: '나', ready: false }] });
    expect(m.rows.length).toBe(6);
    expect(m.rows[0]).toMatchObject({ text: '1번 가', host: true, ready: true, me: false });
    expect(m.rows[1]).toMatchObject({ text: '2번 나', me: true, ready: false });
    expect(m.rows[2]).toMatchObject({ empty: true, text: '빈 자리' });
    expect(m).toMatchObject({ isHost: false, myReady: false, canStart: false });
  });
  test('lobby model: the host never readies, the hint counts the guests', () => {
    const seats = (...r: boolean[]) => r.map((ready, i) => ({ seat: i + 1, name: `p${i + 1}`, ready }));
    const alone = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false) });
    expect(alone).toMatchObject({ canStart: true, hint: '혼자 시작합니다 · 시작하면 더 들어올 수 없습니다' });
    expect(alone.rows[0]!.showState).toBe(false);
    const waiting = lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, false) });
    expect(waiting).toMatchObject({ canStart: false, guests: 2, readyGuests: 1, hint: '모두 준비하면 시작할 수 있습니다 · 1/2명 준비' });
    expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true) }))
      .toMatchObject({ canStart: true, hint: '3명으로 시작합니다 · 시작하면 더 들어올 수 없습니다' });
    expect(lobbyModel({ roomId: 'r', you: 1, hostSeat: 1, seats: seats(false, true, true, true, true, true) }))
      .toMatchObject({ canStart: true, hint: '' });
    const guest = lobbyModel({ roomId: 'r', you: 2, hostSeat: 1, seats: seats(false, false) });
    expect(guest).toMatchObject({ isHost: false, canStart: false, hint: '' });
    expect(guest.rows[1]!.showState).toBe(true);
  });
  test('submitting twice (Enter during IME, double click) sends one join (review focus 5)', async () => {
    const root = document.createElement('div');
    let calls = 0; let release!: () => void;
    renderEntry(root, { onSubmit: () => { calls++; return new Promise<void>(r => { release = r; }); } });
    const input = root.querySelector('input')!; input.value = '가나';
    const form = root.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    root.querySelector('button')!.click();
    expect(calls).toBe(1); release();
  });
  test('the name box stops at the length the hint and the server allow', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: () => Promise.resolve() });
    const input = root.querySelector('input')!;
    expect(input.maxLength).toBe(NICKNAME_MAX);
    expect(TEXT.namePlaceholder).toContain(`1~${NICKNAME_MAX}자`);
    expect(TEXT.badName).toContain(`1~${NICKNAME_MAX}자`);
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX))).not.toBeNull();
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX + 1))).toBeNull();
  });
  test('Enter that only commits an IME composition does not submit; a plain Enter still does', () => {
    const root = document.createElement('div');
    renderEntry(root, { onSubmit: () => Promise.resolve() });
    const input = root.querySelector('input')!;
    const enter = (init: KeyboardEventInit) => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
      input.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(enter({ isComposing: true })).toBe(true);
    expect(enter({ keyCode: 229 })).toBe(true);
    expect(enter({})).toBe(false);
  });

  test('the normal solo link can reuse this page, while a modified click keeps link navigation', () => {
    const root = document.createElement('div');
    const routes: string[] = [];
    renderEntry(root, { onSubmit: () => Promise.resolve(), onSolo: href => routes.push(href) });
    const link = root.querySelector('.entry-link')!;
    const click = (ctrlKey: boolean) => link.dispatchEvent(new MouseEvent('click', { ctrlKey, cancelable: true }));
    expect(click(true)).toBe(true);
    expect(click(false)).toBe(false);
    expect(routes).toEqual([expect.stringContaining('/solo?rounds=70&difficulty=normal')]);
  });
});
