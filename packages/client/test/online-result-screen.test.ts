// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadGameData, type GameData, type MatchResult } from '@dorandi/logic';
import { NetClient } from '../src/net/NetClient';
import { mountResult, renderResult } from '../src/online/result';
import { graph } from '../src/ui/result';
import { FakeRoom, data, fixtureFull, press } from './fixtures/net';

const result: MatchResult = { outcome: 'gate', tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
  { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3, 4, 5, 6, 7, 8, 20], bestUnit: { defId: 'gamasot', grade: 2 }, yeoksinDamage: 3000, helperOpens: 2 },
  { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 9, 30, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0 },
] };

const lastX = (svg: Element): number => {
  const pts = svg.querySelector('polyline')!.getAttribute('points')!.trim().split(' ');
  return Number(pts[pts.length - 1]!.split(',')[0]);
};

describe('team result screen', () => {
  test('an eliminated player graph runs on the 20-round axis and stops at elimination (checkpoint 17-19, finding 6)', () => {
    const root = document.createElement('div');
    renderResult(root, result, { 1: '가', 2: '나' }, data, { rematch: () => {}, leave: () => {} }, { opened: null, rematching: false });
    press(root.querySelectorAll('.result-row')[1]!);
    const svg = root.querySelector('.result-detail svg')!;
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(lastX(svg)).toBeCloseTo(300 * 3 / 19, 1);
  });

  test('a shortened history still ends at the recorded elimination round', () => {
    const root = document.createElement('div');
    const short = structuredClone(result);
    short.seats[1]!.series = [30, 61];
    renderResult(root, short, {}, data, { rematch() {}, leave() {} }, { opened: 2, rematching: false });
    expect(lastX(root.querySelector('.graph')!)).toBeCloseTo(300 * 3 / 19, 1);
  });

  test('the graph scale names the last round of the match (20 and 60 rounds)', () => {
    const scale = (d: GameData): string[] => {
      const root = document.createElement('div');
      renderResult(root, result, {}, d, { rematch() {}, leave() {} }, { opened: 1, rematching: false });
      return Array.from(root.querySelectorAll('.graph-scale span'), s => s.textContent ?? '');
    };
    expect(scale(data)).toEqual(['1라운드', '20라운드']);
    expect(scale(loadGameData('stage3'))).toEqual(['1라운드', '60라운드']);
  });

  test('graph breaks the line at empty rounds; a full series spans the width as before', () => {
    const host = document.createElement('div');
    host.innerHTML = graph([1, 2, null, 4, 5, null], 60);
    expect(host.querySelectorAll('polyline')).toHaveLength(2);
    host.innerHTML = graph([1, 2, 3], 60);
    expect(lastX(host)).toBe(300);
  });
});

function resultOnScreen() {
  const full = fixtureFull();
  const room = new FakeRoom();
  const net = new NetClient(room, full.dataVersion);
  room.emit('full', full);
  const root = document.createElement('div');
  const go = vi.fn();
  const goRematch = vi.fn();
  mountResult(net, root, data, go, goRematch);
  room.emit('result', { result });
  const again = (): HTMLButtonElement => Array.from(root.querySelectorAll<HTMLButtonElement>('button.big')).find(b => b.textContent !== '나가기')!;
  return { room, net, root, go, goRematch, again };
}

describe('result screen connection (checkpoint 17-19, finding 5)', () => {
  afterEach(() => { vi.useRealTimers(); });

  test('the room closing after the result hold turns off rematch and offers a new room', () => {
    const { room, root, again } = resultOnScreen();
    expect(again().disabled).toBe(false);
    room.close(4000);
    expect(root.textContent).toContain('방이 닫혔습니다');
    expect(again().disabled).toBe(true);
    const link = root.querySelector<HTMLAnchorElement>('a[href="/"]');
    expect(link?.textContent).toBe('새 방 만들기');
  });

  test('my own leave is not reported as a closed room', () => {
    const { root, go } = resultOnScreen();
    press(Array.from(root.querySelectorAll('button.big')).find(b => b.textContent === '나가기')!);
    expect(root.textContent).not.toContain('방이 닫혔습니다');
    return Promise.resolve().then(() => Promise.resolve()).then(() => expect(go).toHaveBeenCalledWith('/'));
  });

  test('rematch shows who is ready and waits for the rest before moving', () => {
    const { room, root, again, goRematch } = resultOnScreen();
    press(again());
    room.emit('notice', { kind: 'rematchReady', seats: [1] });
    room.emit('notice', { kind: 'rematch', roomId: 'r2', hostToken: 'host' });
    expect(root.querySelector('[role="status"]')?.textContent).toContain('재경기 준비 1/6명');
    expect(root.textContent).toContain('응답 대기');
    expect(Array.from(root.querySelectorAll('button')).find(b => b.textContent === '준비 완료')?.disabled).toBe(true);
    expect(goRematch).not.toHaveBeenCalled();
    room.emit('notice', { kind: 'rematchReady', seats: [1, 2] });
    expect(goRematch).toHaveBeenCalledWith('r2', 'host');
  });

  test('a ready player can enter the new lobby while others are deciding', () => {
    const { room, root, again, goRematch } = resultOnScreen();
    press(again());
    room.emit('notice', { kind: 'rematchReady', seats: [1] });
    room.emit('notice', { kind: 'rematch', roomId: 'r2' });
    press(Array.from(root.querySelectorAll('button')).find(b => b.textContent === '새 대기실로 이동')!);
    expect(goRematch).toHaveBeenCalledWith('r2', undefined);
  });

  test('rematch can be pressed again when no rematch notice comes within 5 seconds', () => {
    vi.useFakeTimers();
    const { room, again } = resultOnScreen();
    press(again());
    expect(again().disabled).toBe(true);
    expect(room.sent.filter(s => s.type === 'rematch')).toHaveLength(1);
    vi.advanceTimersByTime(4999);
    expect(again().disabled).toBe(true);
    vi.advanceTimersByTime(1);
    expect(again().disabled).toBe(false);
    expect(again().textContent).toBe('다시 하기');
    press(again());
    expect(room.sent.filter(s => s.type === 'rematch')).toHaveLength(2);
  });
});
