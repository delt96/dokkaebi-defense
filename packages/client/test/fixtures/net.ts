import { buildFull, createMatch, loadGameData, type FullMsg } from '@dorandi/logic';
import { placeUnitForTest, stepMatchUntil } from '@dorandi/logic/testing';
import type { RoomLike } from '../../src/net/room';

export const data = loadGameData('stage2');

/** A Colyseus room stand-in: records what the client sends and lets a test push messages and closes. */
export class FakeRoom implements RoomLike {
  sent: { type: string; msg?: any }[] = [];
  private handlers = new Map<string, ((msg: any) => void)[]>();
  private leaveHandlers: ((code: number) => void)[] = [];
  left = 0;
  constructor(public roomId = 'room-1') {}
  send(type: string, msg?: unknown): void { this.sent.push({ type, msg }); }
  onMessage(type: string, cb: (msg: any) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
  }
  onLeave(cb: (code: number) => void): void { this.leaveHandlers.push(cb); }
  async leave(): Promise<unknown> { this.left++; this.close(4000); return undefined; }
  emit(type: string, msg: unknown): void { for (const cb of this.handlers.get(type) ?? []) cb(msg); }
  close(code: number): void { for (const cb of this.leaveHandlers) cb(code); }
  cmds(type: string): any[] { return this.sent.filter(s => s.type === 'cmd' && s.msg?.type === type).map(s => s.msg); }
}

/** Seat 1 has a sotlid at slot 0 and enemies on the lane, 700 ticks into a two-seat match. */
export function fixtureFull(seats: number[] = [1, 2]): FullMsg {
  const match = createMatch(data, 7, seats);
  placeUnitForTest(match.lanes[1]!, 'sotlid', 0);
  stepMatchUntil(match, 700);
  const names: Record<number, string> = { 1: '하나', 2: 'two', 3: '셋' };
  return buildFull(match, 1, { watching: 1, names, key: 'k1', n: 0 });
}

/** The page elements the battle UI draws into (as in index.html). */
export const STAGE_HTML = `<div id="stage"><div id="top"></div><div id="left"></div><div id="lane"></div><div id="right"></div>
  <div id="bottom"></div><div id="round-banner"></div><div id="modal"></div><div id="alert"></div>
  <div id="error" hidden><span id="error-message"></span><button id="error-restart" data-action="restart">다시 하기</button></div></div>
  <div id="screen"></div>`;

/** Presses a control the way the UI listens for it (a keyboard-style click, detail 0). */
export function press(node: Element | null): void {
  if (!node) throw new Error('nothing to press');
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
}

export function key(code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init }));
}
