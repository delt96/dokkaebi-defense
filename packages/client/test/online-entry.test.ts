// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { renderEntry } from '../src/online/entry';
import { lobbyModel } from '../src/online/lobby';
import { joinErrorText } from '../src/online/text';

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
