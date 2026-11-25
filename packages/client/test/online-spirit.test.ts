import { describe, expect, test } from 'vitest';
import type { ClientView, RowView } from '@dorandi/logic';
import { rejectText } from '../src/ui/models';
import { spiritModel } from '../src/online/spirit';

const row = (over: Partial<RowView>): RowView => ({ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null, ...over });

type ViewOpts = { me: number; watching?: number; tick?: number; rows: RowView[] };

function viewWith(o: ViewOpts): ClientView {
  const tick = o.tick ?? 0;
  return {
    n: 0, dataVersion: 'x',
    clock: { tick, phase: 'round', round: 1, roundStartTick: 0, roundEndTick: tick + 400 },
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
