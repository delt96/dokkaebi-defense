// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { loadGameData, type ClientView, type GateView, type RowView, type YeoksinView } from '@dorandi/logic';
import { devCreateOptions, roomCreateOptions } from '../src/net/room';
import { noteSupport, rightNotices, rowsModel, topModel, watchSupport } from '../src/online/models';
import { renderRows, renderTop } from '../src/online/panels';
import { NetClient } from '../src/net/NetClient';
import { FakeRoom, fixtureFull } from './fixtures/net';

const data = loadGameData('stage2');

const row = (over: Partial<RowView>): RowView => ({ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null, ...over });

type ViewOpts = { me: number; watching?: number; tick?: number; phase?: 'prep' | 'round'; round?: number; roundEndTick?: number; rows: RowView[]; gate?: GateView; yeoksin?: YeoksinView | null };

function viewWith(o: ViewOpts): ClientView {
  const tick = o.tick ?? 0;
  return {
    n: 0, dataVersion: 'x',
    clock: { tick, phase: o.phase ?? 'round', round: o.round ?? 1, roundStartTick: 0, roundEndTick: o.roundEndTick ?? tick + 400 },
    rows: o.rows,
    gate: o.gate ?? { stage: 1, kills: 0, deadlineTick: 7799 },
    yeoksin: o.yeoksin ?? null,
    me: { seat: o.me, key: 'k' },
    mine: {
      tick, tokens: 0, coins: 0, buckwheat: 0, upgrades: { physical: 0, magical: 0, polish: 0, slots: 0 },
      grade1Summons: 0, helperOpens: 0, supportTokens: 0, received: false, lastSeq: 0, open: [], units: [], acks: [], supportIn: [],
    },
    watching: o.watching ?? o.me,
    lane: { seat: o.watching ?? o.me, tick, open: [], units: [], enemies: [], fires: [] },
    result: null,
  };
}

describe('online rows', () => {
  test('status priority and numbers', () => {
    const o: ViewOpts = { me: 1, tick: 5000, rows: [
      row({ seat: 1, count: 47 }), row({ seat: 2, name: '나', count: 48 }), row({ seat: 3, name: '다', count: 61, overLimitTicks: 30, connected: false, reconnectTicksLeft: 1210 }),
      row({ seat: 4, name: '라', connected: false, reconnectTicksLeft: 1210, count: 50 }), row({ seat: 5, name: '마', status: 'spirit', cause: 'forfeit', eliminatedTick: 4950 }),
      row({ seat: 6, name: '', status: 'empty' }),
    ], yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 2, enterTick: 4881, nextSeat: 1 } };
    const r = rowsModel(viewWith(o), data);
    expect(r.map(x => x.status)).toEqual(['다음', '위험', '초과 4초', '재접속 61초', '탈락·포기', '']);
    expect(r.map(x => x.danger)).toEqual([false, true, true, true, false, false]);
    expect(r[0]!.title).toBe('1 가 · 나'); expect(r[4]!.count).toBe('–'); expect(r[5]!.title).toBe('빈 고개');
    expect(r[1]).toMatchObject({ mark: 'current' }); expect(r[1]!.progress).toBeCloseTo(120 / 240, 9);
    expect(rowsModel(viewWith({ ...o, tick: 5011 }), data)[4]!.status).toBe('탈락·넋');
  });
  test('the lone survivor is the current lane, without the next-lane label', () => {
    const view = viewWith({ me: 1, rows: [row({}), row({ seat: 2, status: 'spirit' })],
      yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 1, enterTick: 0, nextSeat: 1 } });
    expect(rowsModel(view, data)[0]).toMatchObject({ status: '생존', mark: 'current' });
  });
  test('my row shows the arrival countdown alongside the danger warning', () => {
    document.body.innerHTML = '<div id="left"></div>';
    const v = viewWith({ me: 1, rows: [row({ count: 49 }), row({ seat: 2 })],
      yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 2, enterTick: 0, nextSeat: 1 } });
    renderRows(v, data);
    const mine = document.querySelector('.lane-row.me')!;
    expect(mine.textContent).toContain('위험');
    expect(mine.textContent).toContain('다음은 내 고개 · 12초');
  });

  test('top lines and my-turn notice', () => {
    const o: ViewOpts = { me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 12 }), row({ seat: 2 })],
      gate: { stage: 1, kills: 0, deadlineTick: 7799 }, yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 2, enterTick: 4881, nextSeat: 1 } };
    expect(topModel(viewWith(o), data)).toEqual({ line1: '6 / 20 라운드 · 남은 20초 · 내 잡귀 12 / 60', line2: '관문 1/2 · 9라운드 끝까지 · 역신 첫째 탈 7,950 / 8,800', myTurn: '다음은 내 고개 · 7초' });
    expect(topModel(viewWith({ ...o, yeoksin: { ...o.yeoksin!, seat: 1, nextSeat: 1 } }), data).myTurn).toBe('내 고개 순환');
    expect(topModel(viewWith({ ...o, yeoksin: null, round: 3 }), data).line2).toBe('관문 1/2 · 6라운드에 역신 등장');
    expect(topModel(viewWith({ ...o, yeoksin: null, gate: { stage: 3, kills: 2, deadlineTick: null } }), data).line2).toBe('관문 통과');
    expect(topModel(viewWith({ me: 1, tick: 100, phase: 'prep', roundEndTick: 600, rows: [row({})] }), data).line1).toBe('준비 · 남은 25초');
  });
  test('top line 1 for an over-limit player and for a spirit', () => {
    const over = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 62, overLimitTicks: 40 })] });
    expect(topModel(over, data).line1).toBe('6 / 20 라운드 · 남은 20초 · 내 잡귀 62 / 60 · 초과 3초');
    const spirit = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, status: 'spirit', cause: 'limit', eliminatedTick: 4000 })] });
    expect(topModel(spirit, data).line1).toBe('6 / 20 라운드 · 남은 20초 · 관전 중');
  });
  test('support arrival notice lasts 3 seconds, once per message', () => {
    const v = viewWith({ me: 1, rows: [row({})] }); v.mine.supportIn = [{ from: 3, coins: 5 }];
    noteSupport(v.mine.supportIn, 1000);
    noteSupport(v.mine.supportIn, 1500);
    expect(rightNotices(1000)).toEqual(['3번 넋이 보낸 엽전 +5']);
    expect(rightNotices(4001)).toEqual([]);
  });
  test('a support arrival shows although the next mine replaces supportIn before any redraw (checkpoint 17-19, finding 2)', () => {
    const full = fixtureFull();
    const room = new FakeRoom();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    watchSupport(net, () => 20000);
    room.emit('mine', { ...structuredClone(full.mine), tick: full.mine.tick + 1, supportIn: [{ from: 2, coins: 5 }] });
    room.emit('mine', { ...structuredClone(full.mine), tick: full.mine.tick + 2, supportIn: [] });
    expect(net.view!.mine.supportIn).toEqual([]);
    expect(rightNotices(20000)).toEqual(['2번 넋이 보낸 엽전 +5']);
    expect(rightNotices(23001)).toEqual([]);
  });
  test('rendered markup fits six rows and two lines', () => {
    const rows = [1, 2, 3, 4, 5, 6].map(seat => row({ seat, name: seat === 1 ? '가나다라마바사아' : '', status: seat === 1 ? 'alive' : 'empty', count: 12 }));
    const v = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows, yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 1, enterTick: 4881, nextSeat: 2 } });
    document.body.innerHTML = '<div id="top"></div><div id="left"></div>';
    const left = document.getElementById('left')!;
    const top = document.getElementById('top')!;
    renderRows(v, data);
    renderTop(v, data);
    expect(left.querySelectorAll('.lane-row')).toHaveLength(6);
    expect(left.querySelector('.lane-row.current .bar')).not.toBeNull();
    expect(left.textContent).toContain('가나다라마바사아');
    expect(top.querySelectorAll('.line')).toHaveLength(2);
    expect(top.textContent).toContain('역신 첫째 탈 7,950 / 8,800');
  });
});

describe('dev jump option', () => {
  test('only dev mode turns ?dev=jump<tick> into a room option', () => {
    expect(devCreateOptions('?dev=jump4590', true)).toEqual({ devJumpTick: 4590 });
    expect(devCreateOptions('?dev=jump4590', false)).toEqual({});
    expect(devCreateOptions('?dev=jumpx', true)).toEqual({});
    expect(devCreateOptions('', true)).toEqual({});
  });
  test('a new room is always the 60-round game', () => {
    expect(roomCreateOptions('하나')).toEqual({ name: '하나', stage: 'stage3' });
    expect(roomCreateOptions('하나', { devJumpTick: 4590 })).toEqual({ name: '하나', stage: 'stage3', devJumpTick: 4590 });
    expect(roomCreateOptions('하나', { difficulty: 'hard' })).toEqual({ name: '하나', stage: 'stage3', difficulty: 'hard' });
  });
});
