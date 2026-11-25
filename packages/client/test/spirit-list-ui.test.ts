// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildFull, createMatch, loadGameData, roundStartTick, type FullMsg, type GameData } from '@dorandi/logic';
import { jumpToTick, withoutMarketLock } from '@dorandi/logic/testing';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { gameAudio } from '../src/audio/engine';
import { watchSupport } from '../src/online/models';
import { onlineActions } from '../src/online/spirit';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data, fixtureFull, key, press } from './fixtures/net';

class FakeScene {
  selectedId: number | null = null;
  storageCovered = false;
  pulseHeld = false;
  shakeJangseung = false;
  reduceEffects = false;
  onFrame?: () => void;
  onToast?: (text: string, color: number) => void;
  onSelect(): void {}
  onEvents(): void {}
  showGambleResult(): void {}
  showGambleNotice(): void {}
  showBirth = vi.fn();
  hideBirth = vi.fn();
  setNoticeSpan = vi.fn();
}

let clock = 1000;
const listeners: [string, EventListenerOrEventListenerObject][] = [];
beforeEach(() => {
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    listeners.push([type, fn]);
    add(type, fn, o);
  });
  document.body.innerHTML = STAGE_HTML;
  delete document.documentElement.dataset.wins;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

function mountOnline(full: FullMsg, d: GameData = data, reduced = false) {
  const room = new FakeRoom();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  watchSupport(net, () => clock);
  const driver = new NetDriver(net, d, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  scene.reduceEffects = reduced;
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data: d, actions: onlineActions(net) });
  const frame = (ms = 150): void => { clock += ms; driver.update(16); scene.onFrame?.(); };
  frame();
  let tick = full.mine.tick;
  /** A `mine` message on top of the current one. */
  const mine = (patch: Partial<FullMsg['mine']>): void => {
    tick += 1;
    room.emit('mine', { ...structuredClone(net.view!.mine), tick, supportIn: [], ...patch });
  };
  const receive = (from = 3): void => mine({ coins: net.view!.mine.coins + 5, supportIn: [{ from, coins: 5 }] });
  return { room, net, scene, frame, mine, receive };
}

function spiritFull(): FullMsg {
  const full = fixtureFull([1, 2, 3]);
  full.rows = full.rows.map(r => (r.seat === 1 ? { ...r, status: 'spirit' as const } : r));
  full.watching = 2;
  full.mine.supportTokens = 1;
  return full;
}

function stage3Full(): { full: FullMsg; d3: GameData } {
  const d3 = withoutMarketLock(loadGameData('stage3'));
  const match = createMatch(d3, 5, [1, 2, 3]);
  jumpToTick(match, roundStartTick(d3, 3) + 1);
  return { full: buildFull(match, 1, { watching: 1, names: { 1: '하나', 2: 'two', 3: '셋' }, key: 'k', n: 0 }), d3 };
}

describe('spirit survivors list', () => {
  test('a spirit sees the living lanes on the right, not the old watch hint', () => {
    mountOnline(spiritFull());
    const rows = document.querySelectorAll('#right .sv-row');
    expect(rows).toHaveLength(2);
    expect($('#right')!.textContent).not.toContain('고개 관전');
    expect($('#right')!.textContent).toContain('지원 토큰 1 · 이번 라운드 안에 보내세요');
  });

  test('5냥 sends to its own lane, not the watched one; the row watches; the card counts the sends', () => {
    const { room, frame } = mountOnline(spiritFull());
    press($('#right [data-action="supportTo"][data-arg="3"]'));
    expect(room.cmds('support').map(c => c.args)).toEqual([{ target: 3 }]);
    frame();
    expect($('#right .sv-sent')!.textContent).toBe('3번 셋에게 5냥을 보냈습니다');
    expect($('#bottom')!.textContent).toContain('이번 판 보낸 엽전 1회');
    frame(3100);
    expect($('#right .sv-sent')!.textContent).toBe('');
    press($('#right .sv-watch[data-arg="3"]'));
    expect(room.sent.filter(s => s.type === 'watch').map(s => s.msg)).toEqual([{ seat: 3 }]);
  });

  test('the card has no send count before the first send', () => {
    mountOnline(spiritFull());
    expect($('#bottom')!.textContent).not.toContain('보낸 엽전');
  });
});

describe('the receiver sees the coins it got', () => {
  test('엽전이 바뀌어도 밝아짐이 남는다', () => {
    const { frame, mine, receive } = mountOnline(fixtureFull([1, 2, 3]));
    receive();
    frame();
    expect($('#right .res .coin-glow')).not.toBeNull();
    const float = $('#stage .coin-float')!;
    expect(float.textContent).toBe('+5');
    // the right panel still says who sent it
    expect($('#right .notices')!.textContent).toContain('3번 넋이 보낸 엽전 +5');
    mine({ coins: 999 });
    frame(300);
    expect($('#right .res .coin-glow')!.textContent).toBe('999');
    frame(550);
    expect($('#right .coin-glow')).not.toBeNull();
    expect($('#stage .coin-float')).toBeNull();
    frame(200);
    expect($('#right .coin-glow')).toBeNull();
  });

  test('효과 줄이기에서는 떠오름 없이 색만', () => {
    const { frame, receive } = mountOnline(fixtureFull([1, 2, 3]), data, true);
    receive();
    frame();
    expect($('#right .coin-glow')).not.toBeNull();
    expect($('.coin-float')).toBeNull();
  });

  test('with the market pillar open, its head coin number lights up', () => {
    const { full, d3 } = stage3Full();
    const { frame, mine, receive } = mountOnline(full, d3);
    key('KeyB');
    frame();
    expect($('#win-right .econ-panel')).not.toBeNull();
    receive();
    frame();
    expect($('#win-right .win-money .coin-glow')).not.toBeNull();
    expect($('#win-right .coin-float')!.textContent).toBe('+5');
    expect($('#round-banner')!.textContent).not.toContain('엽전 +5');
    // a redraw of the window keeps both
    mine({ coins: 777 });
    frame(300);
    expect($('#win-right .win-money .coin-glow')!.textContent).toBe('777');
    expect($('#win-right .coin-float')).not.toBeNull();
  });

  test('with the quest pillar open (no coin number in view), the notice slot says it', () => {
    const { full, d3 } = stage3Full();
    const { frame, receive } = mountOnline(full, d3);
    key('KeyJ');
    frame();
    expect($('#win-right .quest-modal')).not.toBeNull();
    receive();
    frame();
    expect($('#round-banner')!.textContent).toContain('3번 넋이 보낸 엽전 +5');
    expect($('.coin-float')).toBeNull();
  });
});
