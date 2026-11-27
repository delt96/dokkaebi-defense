// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import type { LobbyMsg } from '@dorandi/logic';
import { renderLobby, type LobbyActions } from '../src/online/lobby';
import { TEXT } from '../src/online/text';

const seats = (...r: boolean[]) => r.map((ready, i) => ({ seat: i + 1, name: `p${i + 1}`, ready }));
const lobby = (you: number, ...r: boolean[]): LobbyMsg => ({ roomId: 'r', you, hostSeat: 1, seats: seats(...r), stage: 'stage3', difficulty: 'normal' });
const noop: LobbyActions = { ready() {}, start() {}, copy: async () => true, leave() {} };
const draw = (msg: LobbyMsg, art: { done: number; total: number }) => {
  const root = document.createElement('div');
  renderLobby(root, msg, noop, undefined, undefined, art);
  return root;
};
const big = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.screen-actions button')!;
const load = (root: HTMLElement) => root.querySelector('.lobby-load');

describe('the ready room waits for the art', () => {
  test('a guest still loading sees the progress and cannot ready yet', () => {
    const root = draw(lobby(2, false, false), { done: 88, total: 140 });
    expect(load(root)!.textContent).toBe('그림 받는 중 62% (88/140)');
    expect(root.querySelector<HTMLElement>('.lobby-load-bar > i')!.style.width).toBe('62%');
    expect(big(root).disabled).toBe(true);
    expect(big(root).textContent).toBe('그림 받는 중…');
  });

  test('a guest already ready can still take it back', () => {
    const root = draw(lobby(2, false, true), { done: 88, total: 140 });
    expect(big(root).disabled).toBe(false);
    expect(big(root).textContent).toBe(TEXT.unreadyBtn);
  });

  test('the host still loading cannot start, and says why once every guest is ready', () => {
    const root = draw(lobby(1, false, true), { done: 88, total: 140 });
    expect(big(root).disabled).toBe(true);
    expect(root.querySelector('.lobby-start-hint')!.textContent).toBe('그림을 다 받으면 시작할 수 있습니다');
  });

  test('with every file in, the line goes and the buttons are as before', () => {
    const guest = draw(lobby(2, false, false), { done: 140, total: 140 });
    expect(load(guest)).toBeNull();
    expect([big(guest).disabled, big(guest).textContent]).toEqual([false, TEXT.readyBtn]);
    const host = draw(lobby(1, false, true), { done: 140, total: 140 });
    expect(big(host).disabled).toBe(false);
  });

  test('nothing warmed (0 of 0) does not hold the room', () => {
    const root = draw(lobby(2, false, false), { done: 0, total: 0 });
    expect(load(root)).toBeNull();
    expect(big(root).disabled).toBe(false);
  });
});
