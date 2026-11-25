// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ClientView, RowView } from '@dorandi/logic';
import { NetClient } from '../src/net/NetClient';
import { NetDriver } from '../src/net/NetDriver';
import { gameAudio } from '../src/audio/engine';
import { BIRTH_MS } from '../src/ui/birth';
import { mountUi } from '../src/ui/mount';
import { FakeRoom, STAGE_HTML, data, fixtureFull } from './fixtures/net';

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
});
afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  delete document.documentElement.dataset.wins;
  vi.restoreAllMocks();
});

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const rowOf = (seat: number) => document.querySelectorAll<HTMLElement>('#left .lane-row')[seat - 1]!;
const statusOf = (seat: number) => rowOf(seat).querySelector('.status')!.textContent;
const slotText = () => $('#round-banner')!.textContent ?? '';

function mountOnline() {
  const room = new FakeRoom();
  const full = fixtureFull([1, 2, 3]);
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const driver = new NetDriver(net, data, () => clock);
  driver.update(16);
  const scene = new FakeScene();
  const play = vi.spyOn(gameAudio, 'play').mockImplementation(() => {});
  mountUi(driver, scene as never, {}, { online: true, view: () => net.view, data, actions: { support: vi.fn(), watch: vi.fn(), forfeit: vi.fn() } });
  const frame = (ms = 150): void => { clock += ms; driver.update(16); scene.onFrame?.(); };
  const view = (): ClientView => net.view!;
  const setRow = (seat: number, patch: Partial<RowView>): void => {
    view().rows = view().rows.map(r => (r.seat === seat ? { ...r, ...patch } : r));
  };
  const fall = (seat: number): void => setRow(seat, { status: 'spirit', cause: 'limit', eliminatedTick: view().clock.tick });
  const sounds = () => play.mock.calls.map(c => c[0]);
  return { room, scene, frame, view, setRow, fall, sounds };
}

describe('online left rows', () => {
  test('a danger lane that is next keeps 위험 and shows the 다음 chip', () => {
    const { frame, view, setRow } = mountOnline();
    setRow(2, { count: 58 });
    view().yeoksin = { stage: 1, hp: 80, maxHp: 100, seat: 3, enterTick: view().clock.tick, nextSeat: 2 };
    frame();
    const row = rowOf(2);
    expect(row.classList.contains('lv-danger')).toBe(true);
    expect(statusOf(2)).toBe('위험');
    expect(row.querySelector('.chip.next')!.textContent).toBe('다음');
  });

  test('the lane with the yeoksin shows the 역신 chip and bar, no 탈', () => {
    const { frame, view } = mountOnline();
    view().yeoksin = { stage: 1, hp: 80, maxHp: 100, seat: 3, enterTick: view().clock.tick, nextSeat: 2 };
    frame();
    const row = rowOf(3);
    expect(row.querySelector('.chip.current')!.textContent).toBe('역신');
    expect(row.querySelector('.bar')).not.toBeNull();
    expect(statusOf(3)).toBe('생존');
    expect($('#left')!.textContent).not.toContain('탈');
  });

  test('a warn lane is 주의 with lv-warn, no red background class', () => {
    const { frame, setRow } = mountOnline();
    setRow(2, { count: 50 });
    frame();
    expect(statusOf(2)).toBe('주의');
    expect(rowOf(2).classList.contains('lv-warn')).toBe(true);
    expect(rowOf(2).classList.contains('lv-danger')).toBe(false);
  });

  test('한 번에 둘이 쓰러지면 알림 둘, 소리 하나', () => {
    const { frame, fall, sounds } = mountOnline();
    frame();
    fall(2);
    fall(3);
    frame();
    expect([2, 3].map(s => rowOf(s).classList.contains('fallen-flash'))).toEqual([true, true]);
    expect(rowOf(2).classList.contains('spirit')).toBe(true);
    expect(rowOf(2).querySelector('.count')!.textContent).toBe('넋');
    expect(sounds().filter(s => s === 'fallen')).toHaveLength(1);
    expect(slotText()).toContain('2 two 님이 쓰러졌습니다 · 잡귀 한도');
    expect($('#slot-say')!.textContent).toBe('2번 two 님이 쓰러졌습니다');
    frame(1000);
    expect(rowOf(2).classList.contains('fallen-flash')).toBe(false);
    frame(2000);
    frame();
    expect(slotText()).toContain('3 셋 님이 쓰러졌습니다 · 잡귀 한도');
    expect(sounds().filter(s => s === 'fallen')).toHaveLength(1);
  });

  test('my own fall flashes my row but sends no notice', () => {
    const { frame, fall, sounds } = mountOnline();
    frame();
    fall(1);
    frame();
    expect(rowOf(1).classList.contains('fallen-flash')).toBe(true);
    expect(slotText()).not.toContain('쓰러졌습니다');
    expect(sounds()).not.toContain('fallen');
  });

  test('reduced effects: the fallen row is still red for 1 s, no flash class', () => {
    const { scene, frame, fall } = mountOnline();
    scene.reduceEffects = true;
    frame();
    fall(2);
    frame();
    expect(rowOf(2).classList.contains('fallen-still')).toBe(true);
    expect(rowOf(2).classList.contains('fallen-flash')).toBe(false);
    frame(1000);
    expect(rowOf(2).classList.contains('fallen-still')).toBe(false);
  });

  test('a disconnected lane: dashed, 끊김 · 2:45; back again: 돌아옴 for 2 s', () => {
    const { frame, setRow } = mountOnline();
    frame();
    setRow(2, { connected: false, reconnectTicksLeft: 3300 });
    frame();
    expect(rowOf(2).classList.contains('offline')).toBe(true);
    expect(statusOf(2)).toBe('끊김 · 2:45');
    setRow(2, { connected: true, reconnectTicksLeft: null });
    frame();
    expect(rowOf(2).classList.contains('offline')).toBe(false);
    expect(statusOf(2)).toBe('돌아옴');
    frame(1800);
    expect(statusOf(2)).toBe('돌아옴');
    frame(300);
    expect(statusOf(2)).toBe('생존');
  });

  test('a peer birth writes ★ name on that row for 2.5 s, unless the row is in danger', () => {
    const { room, frame, setRow } = mountOnline();
    const birth = (seat: number, name: string) => ({ kind: 'birth', seat, name, defId: 'jumadeung', unitId: 3, via: 'combine', firstSix: false });
    room.emit('notice', birth(2, 'two'));
    frame();
    expect(statusOf(2)).toBe('★ 주마등');
    expect(rowOf(2).querySelector('.status.birth')).not.toBeNull();
    expect(rowOf(2).classList.contains('birth-flash')).toBe(true);
    frame(BIRTH_MS);
    expect(statusOf(2)).toBe('생존');

    setRow(3, { count: 58 });
    room.emit('notice', birth(3, '셋'));
    frame();
    expect(statusOf(3)).toBe('위험');
    expect(rowOf(3).classList.contains('birth-flash')).toBe(true);
  });
});

describe('a spirit watching a lane over the limit', () => {
  test('the edge countdown runs on the watched lane, not on my own zeroed row', () => {
    const { frame, view, setRow, fall } = mountOnline();
    frame();
    fall(1);
    const v = view();
    const e = v.lane.enemies.find(x => !x.boss)!;
    const b = data.balance;
    v.watching = 2;
    v.lane = { ...v.lane, enemies: Array.from({ length: b.limit + 3 }, (_, i) => ({ ...e, id: 10_000 + i })) };
    const ticks = Math.round(2000 / b.tickMs);
    setRow(2, { count: b.limit + 3, overLimitTicks: ticks });
    frame();
    const box = $('#alert')!;
    expect(box.classList.contains('on')).toBe(true);
    expect(box.querySelector('strong')!.textContent).toBe(`${Math.ceil(b.limitSeconds - 2)}초`);
  });
});
