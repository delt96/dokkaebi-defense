// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { loadGameData, type ClientView, type RowView } from '@dorandi/logic';
import { NetClient } from '../src/net/NetClient';
import { rejectText } from '../src/ui/models';
import { onlineActions, sentCount, spiritModel, survivorsHtml, survivorsModel } from '../src/online/spirit';
import { FakeRoom, fixtureFull } from './fixtures/net';

const data = loadGameData('stage2');

const row = (over: Partial<RowView>): RowView => ({ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null, ...over });

type ViewOpts = { me: number; watching?: number; tick?: number; rows: RowView[]; endIn?: number; phase?: 'prep' | 'round' };

function viewWith(o: ViewOpts): ClientView {
  const tick = o.tick ?? 0;
  return {
    n: 0, dataVersion: 'x',
    clock: { tick, phase: o.phase ?? 'round', round: 1, roundStartTick: 0, roundEndTick: tick + (o.endIn ?? 400) },
    rows: o.rows,
    gate: { stage: 1, kills: 0, deadlineTick: 7799 },
    yeoksin: null,
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

describe('spirit', () => {
  test('survivors get no spirit card', () => {
    expect(spiritModel(viewWith({ me: 1, rows: [row({ seat: 1 })] }))).toBeNull();
  });
  test('card text and reasons', () => {
    const base = viewWith({ me: 2, watching: 1, rows: [row({ seat: 1, name: '가' }), row({ seat: 2, status: 'spirit' })] });
    base.mine.supportTokens = 1;
    expect(spiritModel(base)).toEqual({ title: '관전: 1번 가', tokens: 1, canSend: true, reason: null, sentTo: null });
    base.rows[0]!.received = true;
    expect(spiritModel(base)).toMatchObject({ canSend: false, reason: '이번 라운드에 이미 받았습니다' });
    base.rows[0]!.received = false; base.mine.supportTokens = 0;
    expect(spiritModel(base)).toMatchObject({ canSend: false, reason: '지원 토큰이 없습니다' });
  });
  test('a spirit target cannot be supported', () => {
    const v = viewWith({ me: 2, watching: 3, rows: [row({ seat: 2, status: 'spirit' }), row({ seat: 3, name: '다', status: 'spirit' })] });
    v.mine.supportTokens = 1;
    expect(spiritModel(v)).toMatchObject({ title: '관전: 3번 다', canSend: false, reason: '그 고개는 이미 뚫렸습니다' });
  });
  test('new reject texts', () => {
    expect(rejectText('staleUnit')).toBe('배치가 바뀌었습니다. 다시 시도해 주세요');
    expect(rejectText('targetAlreadyReceived')).toBe('이번 라운드에 이미 지원을 받았습니다');
    expect(rejectText('notAlive')).toBe('넋은 할 수 없습니다');
    expect(rejectText('noSupportToken')).toBe('지원 토큰이 없습니다');
    expect(rejectText('targetNotAlive')).toBe('그 고개는 이미 뚫렸습니다');
    expect(rejectText('badArgs')).toBe('잘못된 입력입니다');
  });
});

describe('spirit survivors list', () => {
  const sixRows = (): RowView[] => [
    row({ seat: 5, name: '하늘', count: 18 }),
    row({ seat: 1, name: '이랑', status: 'spirit' }),
    row({ seat: 3, name: '도깨비', count: 52 }),
    row({ seat: 2, name: '범수', count: 41 }),
    row({ seat: 4, name: '손님', status: 'spirit' }),
    row({ seat: 6, name: '바다', count: 9 }),
  ];

  test('a survivor gets no list', () => {
    expect(survivorsModel(viewWith({ me: 2, rows: sixRows() }), data)).toBeNull();
  });

  test('the head says how long the token lasts, or when the next one comes', () => {
    const v = viewWith({ me: 1, rows: sixRows(), endIn: 360 });
    v.mine.supportTokens = 1;
    expect(survivorsModel(v, data)!.head).toBe('지원 토큰 1 · 이번 라운드 안에 보내세요 · 남은 18초');
    v.mine.supportTokens = 0;
    expect(survivorsModel(v, data)!.head).toBe('다음 라운드에 토큰 1개');
  });

  test('rows are the living lanes but mine, in seat order (not by count)', () => {
    const v = viewWith({ me: 1, rows: sixRows() });
    v.mine.supportTokens = 1;
    v.rows.find(r => r.seat === 5)!.received = true;
    const m = survivorsModel(v, data)!;
    expect(m.rows.map(r => r.seat)).toEqual([2, 3, 5, 6]);
    expect(m.rows[1]).toEqual({ seat: 3, name: '도깨비', count: 52, level: 'warn', received: false, canSend: true });
    expect(m.rows[2]).toMatchObject({ seat: 5, received: true, canSend: false });
    v.mine.supportTokens = 0;
    expect(survivorsModel(v, data)!.rows.some(r => r.canSend)).toBe(false);
    v.mine.supportTokens = 1;
    v.clock.phase = 'prep';
    expect(survivorsModel(v, data)!.rows.some(r => r.canSend)).toBe(false);
  });

  test('the sent note lasts 3 seconds', () => {
    const v = viewWith({ me: 1, rows: sixRows() });
    const sent = { seat: 2, round: 1, at: 1000, name: '범수' };
    expect(survivorsModel(v, data, sent, 3900)!.sentNote).toBe('2번 범수에게 5냥을 보냈습니다');
    expect(survivorsModel(v, data, sent, 4100)!.sentNote).toBeNull();
    expect(survivorsModel(v, data, null, 1000)!.sentNote).toBeNull();
  });

  test('markup: one row per lane with a watch button and a 5냥 button, 받음 instead for a lane that got one', () => {
    const v = viewWith({ me: 1, rows: sixRows() });
    v.mine.supportTokens = 1;
    v.rows.find(r => r.seat === 5)!.received = true;
    const box = document.createElement('div');
    box.innerHTML = survivorsHtml(survivorsModel(v, data, null, 0)!);
    const rows = Array.from(box.querySelectorAll('.sv-row'));
    expect(rows).toHaveLength(4);
    const watch = rows[1]!.querySelector<HTMLElement>('.sv-watch')!;
    expect([watch.dataset.action, watch.dataset.arg]).toEqual(['watch', '3']);
    expect(watch.querySelector('b')!.className).toBe('lv-warn');
    const send = rows[1]!.querySelector<HTMLElement>('.sv-send')!;
    expect([send.dataset.action, send.dataset.arg, send.textContent]).toEqual(['supportTo', '3', '5냥']);
    expect(rows[2]!.querySelector('.sv-send')).toBeNull();
    expect(rows[2]!.querySelector('.sv-got')!.textContent).toBe('받음');
    // the sent line keeps its place while empty
    expect(box.querySelector('.sv-sent')!.textContent).toBe('');
  });

  test('support(target) sends to that lane, support() to the watched one, and a refused send is not counted', () => {
    const full = fixtureFull([1, 2, 3]);
    full.rows = full.rows.map(r => (r.seat === 1 ? { ...r, status: 'spirit' as const } : r));
    full.watching = 2;
    full.mine.supportTokens = 1;
    const room = new FakeRoom();
    const net = new NetClient(room, full.dataVersion);
    room.emit('full', full);
    const actions = onlineActions(net);
    expect(sentCount()).toBe(0);
    actions.support(3);
    expect(room.cmds('support').map(c => c.args)).toEqual([{ target: 3 }]);
    expect(sentCount()).toBe(1);
    expect(survivorsModel(net.view!, data, undefined, performance.now())!.sentNote).toBe('3번 셋에게 5냥을 보냈습니다');
    actions.support();
    expect(room.cmds('support').map(c => c.args)).toEqual([{ target: 3 }, { target: 2 }]);
    expect(sentCount()).toBe(2);
    const second = room.cmds('support')[1]!.seq;
    room.emit('mine', { ...structuredClone(full.mine), tick: full.mine.tick + 1, supportTokens: 0, lastSeq: second, acks: [{ seq: second - 1, ok: true }, { seq: second, ok: false, reason: 'noSupportToken' }] });
    expect(sentCount()).toBe(1);
    // the refused send does not take the note of the one that went
    expect(survivorsModel(net.view!, data, undefined, performance.now())!.sentNote).toBe('3번 셋에게 5냥을 보냈습니다');
    // a new battle screen starts its count again
    onlineActions(net);
    expect(sentCount()).toBe(0);
  });
});
