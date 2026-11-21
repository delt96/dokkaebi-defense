// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData, type GameState } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { dexHtml } from '../src/ui/dex';
import { loadView } from '../src/ui/dex-memory';
import { dexEntries, dexGo, dexNavStart, dexShows, mineMatches, roleList, skillSearchText, type DexMore } from '../src/ui/models';
import { mountUi } from '../src/ui/mount';
import { STAGE_HTML, key, press } from './fixtures/net';

const d3 = loadGameData('stage3');
const d2 = loadGameData('stage2');
const entries3 = dexEntries(d3);
const ids = (html: string) => [...html.matchAll(/data-dex-id="([^"]+)"/g)].map(m => m[1]!);
const shown = (data: typeof d3, more: DexMore) =>
  dexEntries(data).filter(e => dexShows(data, e, 'all', '', more)).map(e => e.id);

class FakeScene {
  selectedId: number | null = null;
  reduceEffects = false;
  onFrame?: () => void;
  onSelect(): void {}
  onEvents(): void {}
}

/** A recipe of two different materials: c = a + b. */
const pair = d3.recipes.find(r => r.materials.length === 2 && r.materials[0] !== r.materials[1])!;
const [matA, matB] = pair.materials as [string, string];

function board(withA: boolean, storedB: boolean): GameState {
  const s = createGame(d3, 1);
  if (withA) placeUnitForTest(s, matA, 0);
  if (storedB) s.storage = [{ id: 900, defId: matB } as never];
  return s;
}

describe('roles with AND', () => {
  test('roleList reads one role, a list, or all', () => {
    expect(roleList('all')).toEqual([]);
    expect(roleList(undefined)).toEqual([]);
    expect(roleList('slow')).toEqual(['slow']);
    expect(roleList('slow,magVuln')).toEqual(['slow', 'magVuln']);
  });

  test('two roles show only the units that have both', () => {
    const has = (role: string) => entries3.filter(e => e.roles.some(t => t.role === role)).map(e => e.id);
    const both = has('physVuln').filter(id => has('stun').includes(id));
    expect(both.length).toBeGreaterThan(0);
    expect(shown(d3, { role: 'physVuln,stun' })).toEqual(both);
    expect(both.length).toBeLessThan(has('physVuln').length);
    expect(shown(d3, { role: 'physVuln' })).toEqual(has('physVuln'));
  });
});

describe('기술로 찾기', () => {
  test('a stun unit is found by 기절 and by 스턴, an explosion by 폭발', () => {
    const stun = entries3.filter(e => e.roles.some(t => t.role === 'stun')).map(e => e.id);
    expect(stun.length).toBeGreaterThan(0);
    for (const word of ['기절', '스턴']) {
      expect(shown(d3, { skill: word })).toEqual(expect.arrayContaining(stun));
    }
    const blast = entries3.filter(e => e.skillText.includes('폭발')).map(e => e.id);
    expect(blast.length).toBeGreaterThan(0);
    expect(shown(d3, { skill: '폭발' })).toEqual(blast);
    expect(shown(d3, { skill: ' 폭 발 ' })).toEqual(blast);
  });

  test('관통 units answer to 꿰뚫, 불길 and nonsense', () => {
    const pierce = entries3.filter(e => e.skillText.includes('관통')).map(e => e.id);
    expect(shown(d3, { skill: '꿰뚫' })).toEqual(pierce);
    expect(shown(d3, { skill: '불길' }).length).toBeGreaterThan(0);
    expect(shown(d3, { skill: '없는기술이름' })).toEqual([]);
  });

  test('it uses the card skill text and role names, and ANDs with grade, name, kind and role', () => {
    const e = entries3.find(x => x.roles.length && x.skillText)!;
    expect(e.search).toBe(skillSearchText(e.skillText, e.roles));
    expect(e.search).toContain(e.skillText.replace(/\s+/g, ''));
    const word = '기절';
    const combined = entries3.filter(x => x.search.includes(word) && x.kind === 'physical').map(x => x.id);
    expect(shown(d3, { skill: word, kind: 'physical' })).toEqual(combined);
    expect(dexShows(d3, e, 'all', e.name, { skill: e.skillText.slice(0, 3) })).toBe(true);
    expect(dexShows(d3, e, String(e.grade === 1 ? 2 : 1), '', { skill: e.skillText.slice(0, 3) })).toBe(false);
  });

  test('works on the 20-round data', () => {
    const e2 = dexEntries(d2);
    expect(shown(d2, { skill: '스턴' })).toEqual(e2.filter(e => e.search.includes('스턴')).map(e => e.id));
    expect(shown(d2, { skill: '스턴' }).length).toBeGreaterThan(0);
  });
});

describe('내 판 기준', () => {
  test('조합 가능: every material on the board or in the storage', () => {
    const s = board(true, true);
    expect(mineMatches(s, pair.result, 'ready')).toBe(true);
    expect(mineMatches(s, pair.result, 'one')).toBe(false);
    expect(shown(d3, { mine: ['ready'], state: s })).toContain(pair.result);
    const noStore = board(true, false);
    expect(mineMatches(noStore, pair.result, 'ready')).toBe(false);
  });

  test('재료 1개 부족: exactly one missing; units without a recipe never match', () => {
    const s = board(true, false);
    expect(mineMatches(s, pair.result, 'one')).toBe(true);
    expect(shown(d3, { mine: ['one'], state: s })).toContain(pair.result);
    const empty = board(false, false);
    expect(mineMatches(empty, pair.result, 'one')).toBe(false);
    const grade1 = d3.units.find(u => !d3.recipes.some(r => r.result === u.id))!.id;
    for (const k of ['ready', 'one', 'uses']) expect(mineMatches(s, grade1, k)).toBe(false);
  });

  test('보유 재료 사용: recipes with a unit I own, including one in the storage', () => {
    const s = board(false, true);
    const users = d3.recipes.filter(r => r.materials.includes(matB)).map(r => r.result);
    expect(shown(d3, { mine: ['uses'], state: s }).sort()).toEqual([...new Set(users)].sort());
    expect(shown(d3, { mine: ['uses'], state: board(false, false) })).toEqual([]);
  });

  test('chips add up with AND, and with the other filters; without a game they match nothing', () => {
    const s = board(true, false);
    const both = shown(d3, { mine: ['one', 'uses'], state: s });
    expect(both).toContain(pair.result);
    expect(both.every(id => mineMatches(s, id, 'one') && mineMatches(s, id, 'uses'))).toBe(true);
    expect(shown(d3, { mine: ['one'], state: s, kind: pair.result ? (entries3.find(e => e.id === pair.result)!.kind === 'physical' ? 'magical' : 'physical') : 'all' })).not.toContain(pair.result);
    expect(shown(d3, { mine: ['one'] })).toEqual([]);
  });

  test('following a link clears 상세검색 criteria that hide the target', () => {
    const s = board(true, false);
    const nav = { ...dexNavStart(), mine: ['one'], skill: '폭발', role: 'slow,stun' };
    const away = entries3.find(e => !shown(d3, { ...nav, state: s }).includes(e.id) && e.id !== pair.result)!;
    const next = dexGo(d3, nav, away.id, pair.result, s);
    expect(dexShows(d3, away, next.filter, next.query, { ...next, state: s })).toBe(true);
    expect(next.focus).toBe(away.id);
  });
});

describe('dex html', () => {
  test('the toggle is closed by default; open it shows the skill box and, with a game, the 내 판 chips', () => {
    const closed = dexHtml(d3);
    expect(closed).toContain('data-action="dexAdv" aria-expanded="false"');
    expect(closed).not.toContain('dex-skillsearch');
    const open = dexHtml(d3, 'all', '', 1, { adv: true });
    expect(open).toContain('dex-skillsearch');
    expect(open).not.toContain('data-action="dexMine"');
    const withGame = dexHtml(d3, 'all', '', 1, { adv: true, state: board(true, true) });
    for (const k of ['ready', 'one', 'uses']) expect(withGame).toContain(`data-action="dexMine" data-arg="${k}"`);
    expect(dexHtml(d2, 'all', '', 1, { adv: true })).toContain('dex-skillsearch');
    expect(dexHtml(d2, 'all', '', 1, { adv: true })).not.toContain('dex-search"');
  });

  test('the toggle counts the criteria that are on, and the list follows them', () => {
    const html = dexHtml(d3, 'all', '', 1, {}, { skill: '폭발', role: 'slow,stun' });
    expect(html).toContain('상세검색 ▸ (2)');
    expect(html).toContain('data-action="dexReset"');
    const rows = ids(html);
    expect(rows.every(id => entries3.find(e => e.id === id)!.search.includes('폭발'))).toBe(true);
  });
});

describe('상세검색 in the mounted ui', () => {
  beforeEach(() => { document.body.innerHTML = STAGE_HTML; localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });
  const modalEl = () => document.getElementById('modal')!;
  const open = (state: GameState = createGame(d3, 1)) => {
    mountUi(new GameDriver(state), new FakeScene() as never);
    press(document.querySelector('[data-action="openDex"]'));
  };

  test('closed, the role row is single-select; open, it is multi-select with AND; the toggle is remembered', () => {
    open();
    const modal = modalEl();
    const role = (r: string) => modal.querySelector(`[data-action="dexRole"][data-arg="${r}"]`)!.getAttribute('aria-pressed');
    press(modal.querySelector('[data-action="dexRole"][data-arg="physVuln"]'));
    press(modal.querySelector('[data-action="dexRole"][data-arg="stun"]'));
    expect([role('physVuln'), role('stun')]).toEqual(['false', 'true']);

    press(modal.querySelector('[data-action="dexAdv"]'));
    expect(modal.querySelector('.dex-adv')).not.toBeNull();
    expect(modal.textContent).toContain('역할 모두 포함');
    press(modal.querySelector('[data-action="dexRole"][data-arg="physVuln"]'));
    expect([role('physVuln'), role('stun')]).toEqual(['true', 'true']);
    const both = ids(modal.innerHTML);
    expect(both).toEqual(shown(d3, { role: 'physVuln,stun' }));
    expect(JSON.parse(localStorage.getItem('dorandi.dexView')!)).toMatchObject({ adv: true, role: 'stun,physVuln' });

    press(modal.querySelector('[data-action="closeModal"]'));
    press(document.querySelector('[data-action="openDex"]'));
    expect(modal.querySelector('.dex-adv')).not.toBeNull();

    press(modal.querySelector('[data-action="dexRole"][data-arg="all"]'));
    expect(ids(modal.innerHTML)).toHaveLength(d3.units.length);
  });

  test('기술로 찾기 filters on submit, keeps the typed text over a chip press, and reset clears it all', () => {
    const s = board(true, true);
    open(s);
    const modal = modalEl();
    press(modal.querySelector('[data-action="dexAdv"]'));
    const input = modal.querySelector<HTMLInputElement>('.dex-skillsearch input')!;
    input.value = '폭발';
    modal.querySelector<HTMLFormElement>('.dex-skillsearch')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(ids(modal.innerHTML)).toEqual(shown(d3, { skill: '폭발' }));
    expect(modal.querySelector('.dex-summary')!.textContent).toContain(`${ids(modal.innerHTML).length}종`);

    modal.querySelector<HTMLInputElement>('.dex-skillsearch input')!.value = '스턴';
    press(modal.querySelector('[data-action="dexKind"][data-arg="physical"]'));
    expect(modal.querySelector<HTMLInputElement>('.dex-skillsearch input')!.value).toBe('스턴');
    expect(ids(modal.innerHTML)).toEqual(shown(d3, { skill: '스턴', kind: 'physical' }));

    press(modal.querySelector('[data-action="dexMine"][data-arg="uses"]'));
    expect(ids(modal.innerHTML)).toEqual(shown(d3, { skill: '스턴', kind: 'physical', mine: ['uses'], state: s }));
    expect(loadView().skill).toBe('스턴');

    press(modal.querySelector('[data-action="dexReset"]'));
    expect(ids(modal.innerHTML)).toHaveLength(d3.units.length);
    expect(modal.querySelector<HTMLInputElement>('.dex-skillsearch input')!.value).toBe('');
    expect(modal.querySelector('[data-action="dexMine"][aria-pressed="true"]')).toBeNull();
    expect(modal.querySelector('.dex-adv')).not.toBeNull();
    expect(loadView()).toMatchObject({ skill: '', mine: [], role: 'all', adv: true });
  });

  test('내 판 chips use the live board and storage; 조합 가능 and 1개 부족 replace each other', () => {
    open(board(true, true));
    const modal = modalEl();
    press(modal.querySelector('[data-action="dexAdv"]'));
    press(modal.querySelector('[data-action="dexMine"][data-arg="ready"]'));
    expect(ids(modal.innerHTML)).toContain(pair.result);
    press(modal.querySelector('[data-action="dexMine"][data-arg="one"]'));
    expect(modal.querySelector('[data-action="dexMine"][data-arg="ready"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(modal.querySelector('[data-action="dexMine"][data-arg="one"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(ids(modal.innerHTML)).not.toContain(pair.result);
    press(modal.querySelector('[data-action="dexMine"][data-arg="uses"]'));
    expect(modal.querySelectorAll('[data-action="dexMine"][aria-pressed="true"]')).toHaveLength(2);
  });

  test('the 20-round dex has 상세검색 without the name search; D still toggles', () => {
    mountUi(new GameDriver(createGame(d2, 1)), new FakeScene() as never);
    const modal = modalEl();
    press(document.querySelector('[data-action="openDex"]'));
    expect(modal.querySelector('.dex-search')).toBeNull();
    press(modal.querySelector('[data-action="dexAdv"]'));
    expect(modal.querySelector('.dex-skillsearch')).not.toBeNull();
    modal.querySelector<HTMLInputElement>('.dex-skillsearch input')!.value = '스턴';
    modal.querySelector<HTMLFormElement>('.dex-skillsearch')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(ids(modal.innerHTML)).toEqual(shown(d2, { skill: '스턴' }));
    press(modal.querySelector('[data-action="closeModal"]'));
    key('KeyD');
    expect(modal.querySelector('.dex-modal')).not.toBeNull();
    key('KeyD');
  });
});

describe('dex two-column layout', () => {
  test('filters sit in the side column, the count and reset above the scrolling list, in both dexes', () => {
    for (const data of [d2, d3]) {
      const html = dexHtml(data, 'all', '', 1, { adv: true }, { skill: '폭발' });
      const side = html.slice(html.indexOf('class="dex-side"'), html.indexOf('class="dex-main"'));
      const main = html.slice(html.indexOf('class="dex-main"'));
      expect(side).toContain('data-action="dexKind"');
      expect(side).toContain('data-action="dexRole"');
      expect(side).toContain('data-action="dexAdv"');
      expect(side).not.toContain('<table');
      expect(main.indexOf('dex-summary')).toBeLessThan(main.indexOf('dex-scroll'));
      expect(main).toContain('data-action="dexReset"');
      expect(main.indexOf('dex-scroll')).toBeLessThan(main.indexOf('<table'));
    }
    expect(dexHtml(d3).slice(dexHtml(d3).indexOf('class="dex-side"'), dexHtml(d3).indexOf('class="dex-main"'))).toContain('dex-search');
  });
});
