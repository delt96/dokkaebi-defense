// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { loadGameData, type ClientView, type GateView, type RowView, type YeoksinView } from '@dorandi/logic';
import { devCreateOptions, roomCreateOptions } from '../src/net/room';
import { arrivalModel, fallenSeats, gateCountdown, gateDeadlineRound, noteSupport, returnedSeats, rightNotices, rowsModel, STAGE_NAME, topModel, watchSupport } from '../src/online/models';
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
      tick, tokens: 0, coins: 0, buckwheat: 0, upgrades: { physical: 0, magical: 0, polish: 0 },
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
    expect(r.map(x => x.status)).toEqual(['생존', '주의', '초과 4초', '끊김 · 1:01', '탈락·포기', '']);
    expect(r.map(x => x.level)).toEqual(['ok', 'warn', 'over', 'warn', null, null]);
    expect(r.map(x => x.chip)).toEqual(['next', 'current', null, null, null, null]);
    expect(r.map(x => x.offline)).toEqual([false, false, true, true, false, false]);
    expect(r[0]!.title).toBe('1 가 · 나'); expect(r[4]!.count).toBe('넋'); expect(r[5]!.title).toBe('빈 고개');
    expect(r[1]!.progress).toBeCloseTo(120 / 240, 9);
    expect(rowsModel(viewWith({ ...o, tick: 5011 }), data)[4]!.status).toBe('탈락·넋');
  });
  test('the lone survivor is the current lane, without the next-lane label', () => {
    const view = viewWith({ me: 1, rows: [row({}), row({ seat: 2, status: 'spirit' })],
      yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 1, enterTick: 0, nextSeat: 1 } });
    expect(rowsModel(view, data)[0]).toMatchObject({ status: '생존', chip: 'current' });
  });
  test('my row shows the arrival countdown alongside the warning', () => {
    document.body.innerHTML = '<div id="left"></div>';
    const v = viewWith({ me: 1, rows: [row({ count: 49 }), row({ seat: 2 })],
      yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 2, enterTick: 0, nextSeat: 1 } });
    renderRows(v, data);
    const mine = document.querySelector('.lane-row.me')!;
    expect(mine.textContent).toContain('주의');
    expect(mine.textContent).toContain('역신이 옵니다 · 12초');
  });

  test('a seat that just got a grade 6 or hidden unit flashes its row', () => {
    document.body.innerHTML = '<div id="left"></div>';
    const v = viewWith({ me: 1, rows: [row({}), row({ seat: 2 })], yeoksin: null });
    renderRows(v, data, '', new Set([2]));
    const rows = Array.from(document.querySelectorAll('.lane-row'));
    expect(rows.map(r => r.classList.contains('birth-flash'))).toEqual([false, true, ...rows.slice(2).map(() => false)]);
  });

  test('top lines', () => {
    const o: ViewOpts = { me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 12 }), row({ seat: 2 })],
      gate: { stage: 1, kills: 0, deadlineTick: 7799 }, yeoksin: { stage: 1, hp: 7950, maxHp: 8800, seat: 2, enterTick: 4881, nextSeat: 1 } };
    expect(topModel(viewWith(o), data)).toEqual({ line1: '6 / 20 라운드 · 남은 20초 · 내 잡귀 12 / 60', line2: '관문 1/2 · 마감까지 3라운드 · 역신(첫째) 체력 7,950 / 8,800', gateUrgent: false, mine: '내 잡귀 12 / 60', mineLevel: 'ok', mineTail: null });
    expect(topModel(viewWith({ ...o, yeoksin: null, round: 3 }), data).line2).toBe('관문 1/2 · 6라운드에 역신 등장');
    expect(topModel(viewWith({ ...o, yeoksin: null, gate: { stage: 3, kills: 2, deadlineTick: null } }), data).line2).toBe('관문 통과');
    expect(topModel(viewWith({ me: 1, tick: 100, phase: 'prep', roundEndTick: 600, rows: [row({})] }), data).line1).toBe('준비 · 남은 25초');
  });
  test('top line 1 for an over-limit player and for a spirit', () => {
    const over = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 62, overLimitTicks: 40 })] });
    expect(topModel(over, data)).toMatchObject({ line1: '6 / 20 라운드 · 남은 20초 · 내 잡귀 62 / 60', mine: '내 잡귀 62 / 60', mineLevel: 'over', mineTail: '초과' });
    const hot = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, count: 58 })] });
    expect(topModel(hot, data)).toMatchObject({ mineLevel: 'danger', mineTail: '2마리 남음' });
    const spirit = viewWith({ me: 1, tick: 5000, round: 6, roundEndTick: 5400, rows: [row({ seat: 1, status: 'spirit', cause: 'limit', eliminatedTick: 4000 })] });
    expect(topModel(spirit, data)).toMatchObject({ line1: '6 / 20 라운드 · 남은 20초 · 관전 중', mine: null, mineLevel: null, mineTail: null });
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
    expect(top.textContent).toContain('역신(첫째) 체력 7,950 / 8,800');
  });
});

const deadline = 7799;
type GateOpts = { round: number; tick?: number; yeoksin?: YeoksinView | null };
const gateRows = [row({ seat: 1 }), row({ seat: 2, name: '범수' }), row({ seat: 3, name: '다' })];
function gateView(o: GateOpts): ClientView {
  return viewWith({ me: 1, round: o.round, tick: o.tick ?? 5000, rows: gateRows, gate: { stage: 1, kills: 0, deadlineTick: deadline },
    yeoksin: o.yeoksin === undefined ? { stage: 1, hp: 6632, maxHp: 7480, seat: 2, enterTick: 4881, nextSeat: 3 } : o.yeoksin });
}
const stayTicks = data.coop!.staySeconds * 20;
const nextIsMe = (left: number): ClientView => viewWith({ me: 1, tick: 5000, rows: gateRows,
  yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 2, enterTick: 5000 - stayTicks + left, nextSeat: 1 } });
const hereIsMe = (left: number): ClientView => viewWith({ me: 1, tick: 5000, rows: gateRows,
  yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 1, enterTick: 5000 - stayTicks + left, nextSeat: 2 } });
const withRow = (seat: number, over: Partial<RowView>, y: Partial<YeoksinView> = {}): ClientView => viewWith({ me: 1, tick: 5000,
  rows: [1, 2, 3].map(s => row({ seat: s, ...(s === seat ? over : {}) })),
  yeoksin: { stage: 1, hp: 80, maxHp: 100, seat: 3, enterTick: 4900, nextSeat: 1, ...y } });

describe('online gate signals', () => {
  test('stage names are shared', () => {
    expect(STAGE_NAME[1]).toBe('첫째'); expect(STAGE_NAME[5]).toBe('다섯째');
  });
  test('second line counts rounds to the deadline, then seconds in the deadline round', () => {
    expect(topModel(gateView({ round: 7 }), data).line2).toBe('관문 1/2 · 마감까지 2라운드 · 역신(첫째) 체력 6,632 / 7,480');
    expect(topModel(gateView({ round: 7 }), data).gateUrgent).toBe(false);
    const last = topModel(gateView({ round: 9, tick: deadline - 360 }), data);
    expect([last.line2, last.gateUrgent]).toEqual(['관문 마감 · 남은 18초 · 역신(첫째) 체력 6,632 / 7,480', true]);
    expect(topModel(gateView({ round: 3, yeoksin: null }), data)).toMatchObject({ line2: '관문 1/2 · 6라운드에 역신 등장', gateUrgent: false });
  });
  test('deadline round of the gate now, null once both gates are through', () => {
    expect(gateDeadlineRound(gateView({ round: 7 }), data)).toBe(9);
    const through = viewWith({ me: 1, rows: gateRows, gate: { stage: 3, kills: 2, deadlineTick: null } });
    expect(gateDeadlineRound(through, data)).toBeNull();
  });
  test('countdown only in the last 10 s with the 역신 alive; speaks at 10 and 5 only', () => {
    expect(gateCountdown(gateView({ round: 9, tick: deadline - 201 }), data)).toBeNull();
    expect(gateCountdown(gateView({ round: 9, tick: deadline - 200 }), data)).toEqual({ seconds: 10, hp: 6632, maxHp: 7480, where: '2번 범수 고개', say: '관문 마감 10초 전 · 역신 체력 6,632' });
    expect(gateCountdown(gateView({ round: 9, tick: deadline - 120 }), data)?.say).toBeNull();
    expect(gateCountdown(gateView({ round: 9, tick: deadline - 100 }), data)?.say).toBe('관문 마감 5초 전 · 역신 체력 6,632');
    expect(gateCountdown(gateView({ round: 9, tick: deadline - 100, yeoksin: null }), data)).toBeNull();
    expect(gateCountdown(gateView({ round: 9, tick: deadline }), data)).toBeNull();
    const between = gateView({ round: 9, tick: deadline - 100, yeoksin: { stage: 1, hp: 10, maxHp: 7480, seat: null, enterTick: 0, nextSeat: 2 } });
    expect(gateCountdown(between, data)?.where).toBe('');
  });
  test('arrival: coming, here, urgent from 5 s', () => {
    expect(arrivalModel(nextIsMe(160), data)).toEqual({ text: '역신이 옵니다 · 8초', seconds: 8, urgent: false });
    expect(arrivalModel(hereIsMe(140), data)?.text).toBe('역신이 내 고개에 · 7초 뒤 떠남');
    expect(arrivalModel(nextIsMe(100), data)?.urgent).toBe(true);
    expect(arrivalModel(gateView({ round: 7 }), data)).toBeNull();
    const fallen = nextIsMe(160); fallen.rows[0] = row({ seat: 1, status: 'spirit' });
    expect(arrivalModel(fallen, data)).toBeNull();
  });
});

describe('online row levels', () => {
  test('the next chip stays when the next lane is in danger', () => {
    const r = rowsModel(withRow(2, { count: 58 }, { nextSeat: 2 }), data)[1]!;
    expect([r.status, r.chip, r.level]).toEqual(['위험', 'next', 'danger']);
  });
  test('48 is 주의, 57 위험; a disconnected lane in danger keeps 위험 and the dashed mark', () => {
    expect(rowsModel(withRow(2, { count: 50 }), data)[1]!.status).toBe('주의');
    expect(rowsModel(withRow(2, { count: 56 }), data)[1]!.level).toBe('warn');
    expect(rowsModel(withRow(2, { count: 57 }), data)[1]!.level).toBe('danger');
    const r = rowsModel(withRow(2, { count: 58, connected: false, reconnectTicksLeft: 3300 }), data)[1]!;
    expect([r.status, r.offline]).toEqual(['위험', true]);
    expect(rowsModel(withRow(2, { connected: false, reconnectTicksLeft: 3300 }), data)[1]!.status).toBe('끊김 · 2:45');
    expect(rowsModel(withRow(2, { count: 50, connected: false, reconnectTicksLeft: 3300 }), data)[1]!.status).toBe('끊김 · 2:45');
  });
  test('spirit row reads 넋 in the count place', () => {
    const r = rowsModel(withRow(2, { status: 'spirit', count: 61, cause: 'limit', eliminatedTick: 1000 }), data)[1]!;
    expect(r).toMatchObject({ count: '넋', spirit: true, level: null, status: '탈락·넋' });
    expect(rowsModel(withRow(2, {}), data)[1]!.spirit).toBe(false);
  });
  test('a lane that came back reads 돌아옴 unless a warning outranks it', () => {
    expect(rowsModel(withRow(2, {}), data, new Set([2]))[1]!.status).toBe('돌아옴');
    expect(rowsModel(withRow(2, { count: 50 }), data, new Set([2]))[1]!.status).toBe('주의');
    expect(rowsModel(withRow(2, {}), data)[1]!.status).toBe('생존');
  });
  test('fallen and returned seats', () => {
    const rowsBefore = [row({ seat: 1 }), row({ seat: 2 }), row({ seat: 3 }), row({ seat: 4, status: 'spirit' })];
    const rowsAfter = [row({ seat: 1 }), row({ seat: 2, status: 'spirit' }), row({ seat: 3, status: 'spirit' }), row({ seat: 4, status: 'spirit' })];
    expect(fallenSeats(null, rowsAfter).length).toBe(0);
    expect(fallenSeats(rowsBefore, rowsAfter).map(r => r.seat)).toEqual([2, 3]);
    const offlineRows = [row({ seat: 1 }), row({ seat: 4, connected: false, reconnectTicksLeft: 100 }), row({ seat: 5, connected: false, reconnectTicksLeft: 100 })];
    const onlineRows = [row({ seat: 1 }), row({ seat: 4 }), row({ seat: 5, connected: false, reconnectTicksLeft: 80 })];
    expect(returnedSeats(offlineRows, onlineRows)).toEqual([4]);
    expect(returnedSeats(null, onlineRows)).toEqual([]);
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
