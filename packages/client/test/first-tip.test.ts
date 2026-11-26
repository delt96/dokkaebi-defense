// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, unitDefFast, type GameData, type GameState } from '@dorandi/logic';
import { forceRound, makeData, placeUnitForTest, spawnEnemyForTest, withoutMarketLock } from '@dorandi/logic/testing';
import { firstTip, type FirstTip } from '../src/ui/first-visit';
import { helpLineHtml, renderBottom } from '../src/ui/panels';
import { STAGE_HTML } from './fixtures/net';

const data = withoutMarketLock(loadGameData('stage3'));
const game = (d: GameData = data): GameState => createGame(d, 1);
const ofGrade = (d: GameData, grade: number) => d.units.filter(u => u.grade === grade).map(u => u.id);
const [g1a, g1b] = ofGrade(data, 1) as [string, string];
const g2 = ofGrade(data, 2)[0]!;
const lane = (d: GameData) => d.enemies.find(e => !e.boss && !e.shared && !e.event)!.id;
const firstBoss = (d: GameData) => d.waves.find(w => w.type === 'boss' && w.round === 10) as { boss: string };
const text = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; return box.textContent; };
const emptyGame = (tokens: number) => { const s = game(); s.tokens = tokens; return s; };
const withGrade2 = (d: GameData = data) => { const s = game(d); placeUnitForTest(s, ofGrade(d, 2)[0]!, 0); return s; };

describe('firstTip', () => {
  test('an empty board and storage: summon, with the tokens in hand', () => {
    expect(firstTip(emptyGame(4), false)).toEqual({ step: 'summon', text: 'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개)', drop: ['W', 'Space', 'G'] });
    expect(firstTip(emptyGame(0), true)?.text).toBe('Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 0개)');
  });

  test('a grade 1 unit only in storage is not an empty board', () => {
    const s = emptyGame(3);
    const unit = placeUnitForTest(s, g1a, 0);
    s.slots[0] = null;
    s.storage = [unit];
    expect(firstTip(s, false)?.step).toBe('short');
  });

  test('grade 1 only: combine when a recipe is ready, short when none', () => {
    const s = game();
    placeUnitForTest(s, g1a, 0);
    placeUnitForTest(s, g1b, 1);
    expect(firstTip(s, true)).toEqual({ step: 'combine', text: 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터', drop: ['W'] });
    s.tokens = 2;
    expect(firstTip(s, false)).toEqual({ step: 'short', text: '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 2개)', drop: ['Space'] });
  });

  test('a grade 2 unit in storage ends the combine lines too', () => {
    const s = game();
    placeUnitForTest(s, g1a, 0);
    const unit = placeUnitForTest(s, g2, 1);
    s.slots[1] = null;
    s.storage = [unit];
    expect(firstTip(s, true)).toBeNull();
  });

  test('with a grade 2 unit: nothing in prep, the limit line in rounds 1-5, nothing in 6-7, the boss line in 8-10 until it is caught', () => {
    const s = withGrade2();
    expect(s.phase).toBe('prep');
    expect(firstTip(s, false)).toBeNull();
    forceRound(s, 1);
    expect(firstTip(s, false)).toEqual({ step: 'limit', text: '잡귀가 60마리를 넘긴 채 5초가 지나면 집니다 · 지금 0마리', drop: [] });
    forceRound(s, 5);
    spawnEnemyForTest(s, lane(data), 0);
    spawnEnemyForTest(s, lane(data), 1);
    expect(firstTip(s, false)).toEqual({ step: 'limit', text: '잡귀가 60마리를 넘긴 채 5초가 지나면 집니다 · 지금 2마리', drop: [] });
    forceRound(s, 6); expect(firstTip(s, false)).toBeNull();
    forceRound(s, 7); expect(firstTip(s, false)).toBeNull();
    forceRound(s, 8);
    expect(firstTip(s, false)).toEqual({ step: 'boss', text: '10라운드 보스는 그 라운드 안에 잡아야 합니다', drop: [] });
    forceRound(s, 10);
    expect(firstTip(s, false)?.step).toBe('boss');
    s.stats.find(r => r.round === 10)!.bossKillSeconds = 30;
    expect(firstTip(s, false)).toBeNull();
    forceRound(s, 11); expect(firstTip(s, false)).toBeNull();
  });

  test('a first boss tamed away ends the boss line (review focus 4)', () => {
    const s = withGrade2();
    forceRound(s, 10);
    expect(firstTip(s, false)?.step).toBe('boss');
    const boss = spawnEnemyForTest(s, firstBoss(data).boss, 0);
    s.spawned = 1;
    expect(boss.boss).toBe(true);
    expect(firstTip(s, false)?.step).toBe('boss');
    s.enemies.splice(s.enemies.indexOf(boss), 1);
    expect(s.stats.find(r => r.round === 10)!.bossKillSeconds).toBeNull();
    expect(firstTip(s, false)).toBeNull();
  });

  test('the old 20-round data and data without bosses', () => {
    const old = makeData(d => { d.balance.limit = 40; d.balance.limitSeconds = 3; });
    const s = withGrade2(old);
    forceRound(s, 2);
    expect(firstTip(s, false)?.text).toBe('잡귀가 40마리를 넘긴 채 3초가 지나면 집니다 · 지금 0마리');
    forceRound(s, 9);
    expect(firstTip(s, false)?.text).toBe('10라운드 보스는 그 라운드 안에 잡아야 합니다');
    const plain = makeData(d => { d.waves = d.waves.filter(w => w.type !== 'boss'); }, 'stage3');
    const p = withGrade2(plain);
    forceRound(p, 8);
    expect(firstTip(p, false)).toBeNull();
    forceRound(p, 3);
    expect(firstTip(p, false)?.step).toBe('limit');
  });
});

describe('the help line with the tip', () => {
  const combine: FirstTip = { step: 'combine', text: 'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터', drop: ['W'] };

  test('the tip comes first and the keys it names drop out', () => {
    const tip = firstTip(emptyGame(4), false);
    expect(text(helpLineHtml('B 장터', { quests: true, pause: true, tip }))).toBe(
      'Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개) · E 강화 · D 도감 · Q 이 유닛/전체 · B 장터 · J 퀘스트 · P 멈춤');
    expect(text(helpLineHtml('B 장터', { quests: true, pause: true, tip: combine }))).toBe(
      'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터 · Space 소환 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · B 장터 · J 퀘스트 · P 멈춤');
    expect(text(helpLineHtml('B 장터', { online: true, quests: true, tip: combine }))).toBe(
      'W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터 · Space 소환 · E 강화 · D 도감 · Q 도우미 · G 1·2등급 보관 · B 장터 · J 퀘스트');
    const short: FirstTip = { step: 'short', text: '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 2개)', drop: ['Space'] };
    expect(text(helpLineHtml(undefined, { pause: true, tip: short }))).toBe(
      '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 2개) · W 다음 조합 고르기 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · P 멈춤');
  });

  test('the tip is a bold gold lead, not a live region', () => {
    const html = helpLineHtml(undefined, { tip: combine });
    expect(html).toContain('<b class="tip">W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터</b>');
    // two lines: the tip over the keys, so the stage 3 line no longer runs past the 640px panel
    expect(html).toContain('class="card hint tipped"');
    expect(html).toContain('<span class="hint-keys">Space 소환');
    expect(html).not.toContain('aria-live');
    expect(helpLineHtml(undefined, { tip: null })).toBe(helpLineHtml(undefined, {}));
  });

  test('a selected or moving unit hides the tip', () => {
    expect(text(helpLineHtml(undefined, { selected: true, tip: combine }))).toBe(
      'Z/X/C 조합(판에 짝 표시) · S 판매 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
    expect(text(helpLineHtml(undefined, { moving: true, tip: combine }))).toBe('옮길 칸을 누르세요 · Esc 취소');
  });
});

describe('renderBottom', () => {
  const bottom = () => document.getElementById('bottom')!;

  test('the tip follows the board, hides on a selection and with the help line off', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = emptyGame(4);
    renderBottom(s, null);
    expect(bottom().textContent!.startsWith('Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개) · E 강화')).toBe(true);
    expect(bottom().querySelector('.hint .tip')).not.toBeNull();
    placeUnitForTest(s, g1a, 0);
    renderBottom(s, null);
    expect(bottom().querySelector('.tip')!.textContent).toBe('조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 4개)');
    renderBottom(s, 0);
    expect(bottom().querySelector('.tip')).toBeNull();
    expect(bottom().textContent!.startsWith('Z/X/C 조합')).toBe(true);
    renderBottom(s, null, false, null);
    expect(bottom().innerHTML).toBe('');
    renderBottom(s, 0, false, undefined, undefined, false, null, true);
    expect(bottom().querySelector('.tip')).toBeNull();
  });

  test('a ready recipe on the board turns the short line into the combine line', () => {
    document.body.innerHTML = STAGE_HTML;
    const s = game();
    const recipe = data.recipes.find(r => unitDefFast(data, r.result).grade === 2 && r.materials.every(m => unitDefFast(data, m).grade === 1))!;
    recipe.materials.forEach((m, i) => placeUnitForTest(s, m, i));
    renderBottom(s, null);
    expect(bottom().querySelector('.tip')!.textContent).toBe('W로 재료 유닛을 고르고 Z로 조합합니다 · 왼쪽 목록 맨 위부터');
    expect(bottom().textContent).not.toContain('W 다음 조합 고르기');
  });

  test('online: watching another lane drops the tip, the board on screen is not mine', () => {
    document.body.innerHTML = STAGE_HTML;
    renderBottom(emptyGame(4), null, true, 'B 장터', undefined, false, null, false, true);
    expect(bottom().querySelector('.tip')).toBeNull();
    expect(bottom().textContent).not.toContain('뽑으세요');
  });

  test('online: the same tip leads the line with Q 도우미', () => {
    document.body.innerHTML = STAGE_HTML;
    renderBottom(emptyGame(4), null, true, 'B 장터');
    expect(bottom().textContent).toBe('Space나 뚝딱!으로 유닛을 뽑으세요 (도깨비불 4개) · E 강화 · D 도감 · Q 도우미 · B 장터 · J 퀘스트');
  });
});
