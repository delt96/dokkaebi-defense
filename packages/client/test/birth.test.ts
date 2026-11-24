import { describe, expect, test } from 'vitest';
import { loadGameData } from '@dorandi/logic';
import { BIRTH_MS, BirthHold, BirthQueue, FirstSix, birthBanner, type BirthAlert, type BirthBanner } from '../src/ui/birth';

const d3 = loadGameData('stage3');

describe('birth banner text', () => {
  test('a peer combine reads with the seat and name', () => {
    const b = birthBanner(d3, { seat: 2, name: '범수', defId: 'bihyeongrang', unitId: 1, via: 'combine', firstSix: true }, { mine: false, team: true });
    expect(b).toMatchObject({ who: '2 범수 님이 만들었습니다', title: '귀교 목수', sub: '6등급 · 마딜 · 이번 판 팀 첫 6등급', color: 0xffe35a, mine: false, defId: 'bihyeongrang' });
  });

  test('my own reads with the way it came, solo has no 팀', () => {
    expect(birthBanner(d3, { defId: 'bihyeongrang', unitId: 1, via: 'gamble', firstSix: true }, { mine: true, team: false }))
      .toMatchObject({ who: '도박 당첨', sub: '6등급 · 마딜 · 이번 판 첫 6등급', mine: true });
    expect(birthBanner(d3, { seat: 1, name: '나', defId: 'bihyeongrang', unitId: 1, via: 'combine', firstSix: false }, { mine: true, team: true }))
      .toMatchObject({ who: '조합', sub: '6등급 · 마딜' });
  });

  test('a hidden grade 4 is violet and never the first six', () => {
    expect(birthBanner(d3, { seat: 3, name: '손님', defId: 'bulgasari', unitId: 1, via: 'tame', firstSix: false }, { mine: false, team: true }))
      .toMatchObject({ who: '3 손님 님이 길들였습니다', title: '쇠밥짐승', sub: '히든 4등급 · 물딜', color: 0xc48cff });
    expect(birthBanner(d3, { seat: 3, name: '손님', defId: 'bulgasari', unitId: 1, via: 'gamble', firstSix: false }, { mine: false, team: true }).who)
      .toBe('3 손님 님이 도박에서 뽑았습니다');
    expect(birthBanner(d3, { defId: 'bulgasari', unitId: 1, via: 'tame', firstSix: false }, { mine: true, team: false }).who).toBe('길들이기 성공');
  });
});

const banner = (n: number): BirthBanner => ({ who: '', title: String(n), sub: '', color: 0, defId: 'x', mine: true });

describe('BirthQueue', () => {
  test('shows each in turn and drops the oldest waiting past four', () => {
    const q = new BirthQueue();
    for (let n = 1; n <= 6; n++) q.push(banner(n));
    expect(q.current(0)).toEqual({ banner: banner(1), start: 0 });
    expect(q.current(BIRTH_MS - 1)?.banner.title).toBe('1');
    expect(q.current(BIRTH_MS)).toEqual({ banner: banner(3), start: BIRTH_MS });
    expect(q.current(BIRTH_MS * 2)?.banner.title).toBe('4');
    expect(q.current(BIRTH_MS * 3)?.banner.title).toBe('5');
    expect(q.current(BIRTH_MS * 4)?.banner.title).toBe('6');
    expect(q.current(BIRTH_MS * 5)).toBeNull();
  });

  test('a banner pushed while idle starts at the time it is first asked for', () => {
    const q = new BirthQueue();
    expect(q.current(100)).toBeNull();
    q.push(banner(1));
    expect(q.current(900)).toEqual({ banner: banner(1), start: 900 });
    q.clear();
    expect(q.current(901)).toBeNull();
  });
});

describe('BirthHold', () => {
  const alert: BirthAlert = { defId: 'bihyeongrang', unitId: 7, via: 'gamble', firstSix: true };

  test('notice first, then the reveal gives it once', () => {
    const h = new BirthHold();
    expect(h.hold(alert)).toBeNull();
    expect(h.reveal(7)).toEqual(alert);
    expect(h.reveal(7)).toBeNull();
  });

  test('reveal first, then the notice gives it once', () => {
    const h = new BirthHold();
    expect(h.reveal(7)).toBeNull();
    expect(h.hold(alert)).toEqual(alert);
    expect(h.hold(alert)).toBeNull();
  });

  test('clear forgets both sides', () => {
    const h = new BirthHold();
    h.hold(alert);
    h.clear();
    expect(h.reveal(7)).toBeNull();
  });
});

describe('FirstSix', () => {
  test('only the first grade 6 is first, and again after reset', () => {
    const f = new FirstSix();
    expect([f.take(4), f.take(6), f.take(6)]).toEqual([false, true, false]);
    f.reset();
    expect(f.take(6)).toBe(true);
  });
});
