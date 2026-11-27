// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type GameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { combineOptions, nextCombines, unitCard, unitNotes } from '../src/ui/models';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { soloPanelHtml, unitDetailsHtml } from '../src/ui/panels';

const d1 = loadGameData();
const d3 = loadGameData('stage3');
const SPRITES = join(dirname(fileURLToPath(import.meta.url)), '../public/sprites');

function details(data: GameData, defId: string): { root: HTMLElement; state: ReturnType<typeof createGame> } {
  const state = createGame(data, 1);
  placeUnitForTest(state, defId, 0);
  const host = document.createElement('div');
  host.innerHTML = unitDetailsHtml(state, 0);
  return { root: host.querySelector<HTMLElement>('.unit-details')!, state };
}

const headings = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('.ud-sec h3')).map(h => h.textContent!);

describe('unit details window', () => {
  test('the window head sits outside the scrolling body and holds face, name, grade, type badge and close', () => {
    const unit = d3.units.find(u => !u.hidden && u.grade === 4)!;
    const { root } = details(d3, unit.id);
    expect(root.tagName).toBe('SECTION');
    expect(root.classList.contains('win')).toBe(true);
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-labelledby')).toBe('win-left-title');
    const kids = Array.from(root.children);
    expect(kids.map(k => k.className)).toEqual(['win-head', 'win-body ud-body']);
    const head = kids[0]!;
    const body = kids[1]!;
    expect(body.querySelector('.win-head')).toBeNull();
    const title = head.querySelector('#win-left-title')!;
    expect(title.querySelector('.ud-name')!.textContent).toBe(unit.name);
    expect(title.querySelector('.ud-grade')!.textContent).toBe(`${unit.grade}등급`);
    expect(title.querySelector('.type-badge')!.getAttribute('data-type')).toBe(unit.damageType);
    expect(title.querySelector('.unit-face')).not.toBeNull();
    const close = head.querySelector('.win-close')!;
    expect(close.getAttribute('data-action')).toBe('closeWin');
    expect(close.getAttribute('data-arg')).toBe('left');
    expect(close.getAttribute('aria-label')).toBe('상세 닫기 (Tab)');
  });

  test('the four stats sit in a 2×2 grid', () => {
    const { root } = details(d3, d3.units.find(u => u.grade === 2)!.id);
    expect(root.querySelectorAll('.ud-stats > .ud-stat')).toHaveLength(4);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/style.css'), 'utf8');
    expect(css).toMatch(/\.ud-stats \{[^}]*grid-template-columns: 1fr 1fr;/);
  });

  test('stats come from the card, then 능력 and 조합: stage 3 has no 메모 section either', () => {
    const unit = d3.units.find(u => unitNotes(d3, u).length > 0 && d3.recipes.some(r => r.materials.includes(u.id)))!;
    const { root, state } = details(d3, unit.id);
    const card = unitCard(state, 0)!;
    const body = root.querySelector('.ud-body')!;
    expect(body.firstElementChild!.className).toBe('ud-stats');
    const stats = Array.from(body.querySelectorAll('.ud-stat')).map(s => [s.querySelector('dt')!.textContent, s.querySelector('dd')!.firstChild!.textContent]);
    expect(stats).toEqual([['공격력', String(card.attack)], ['공격 간격', `${card.interval}초`], ['사거리', `${card.range}칸`], ['판매가', `${card.sellPrice}냥`]]);
    expect(headings(root)).toEqual(['능력', '조합']);
    expect(root.textContent).not.toContain('강화를 받음');
    expect(root.querySelectorAll('.ud-sec')[1]!.querySelectorAll('.recipe-list [data-action="combine"], .recipe-list .combine-missing').length)
      .toBe(combineOptions(state, 0).length);
  });

  test('the aura cap moves from the notes to the title of the 오라 tag, only for attack auras', () => {
    const cap = '오라는 종류마다 한 번만, 합쳐서 공격 속도 +50%·공격력 +40%까지';
    const attackAura = d3.units.find(u => u.skills.some(s => s.effects.some(e => e.kind === 'auraAttackPower' || e.kind === 'auraAttackSpeed')))!;
    const { root } = details(d3, attackAura.id);
    const tag = root.querySelector('.ud-sec .role-tag.role-aura')!;
    expect(tag.getAttribute('title')).toBe(cap);
    expect(root.querySelector('.ud-body')!.textContent).not.toContain(cap);

    const vulnOnly = d3.units.find(u => u.skills.some(s => s.effects.some(e => e.kind === 'auraEnemyVuln'))
      && !u.skills.some(s => s.effects.some(e => e.kind === 'auraAttackPower' || e.kind === 'auraAttackSpeed')));
    if (vulnOnly) expect(details(d3, vulnOnly.id).root.querySelector('.ud-sec .role-tag.role-aura')!.hasAttribute('title')).toBe(false);
  });

  test('each effect of the skill text gets its own line', () => {
    const { root, state } = (() => {
      for (const u of d3.units) {
        const r = details(d3, u.id);
        if (unitCard(r.state, 0)!.skillText.includes(' / ')) return r;
      }
      throw new Error('no unit with several effects');
    })();
    const lines = unitCard(state, 0)!.skillText.split(' / ');
    expect(Array.from(root.querySelectorAll('.ud-lines li')).map(li => li.textContent)).toEqual(lines);
  });

  test('stage 1 data has no notes: just 능력 and 조합', () => {
    const unit = d1.units.find(u => u.grade === 1)!;
    const { root } = details(d1, unit.id);
    expect(headings(root)).toEqual(['능력', '조합']);
    expect(root.querySelector('.win-head .ud-grade')!.textContent).toBe('1등급');
  });

  test('a hidden unit says so next to its grade', () => {
    const unit = d3.units.find(u => u.hidden)!;
    const { root } = details(d3, unit.id);
    expect(root.querySelector('.ud-grade')!.textContent).toBe(`${unit.grade}등급 · 숨은 유닛`);
  });
});

describe('unit face', () => {
  const hasSprite = (id: string): boolean => existsSync(join(SPRITES, `${id}.png`));

  test('the details head and the left card show a small face, a grade disc when there is no picture', () => {
    const drawn = d3.units.find(u => hasSprite(u.id))!;
    const { root } = details(d3, drawn.id);
    expect(root.querySelector('.win-head .unit-face img')!.getAttribute('src')).toMatch(new RegExp(`sprites/${drawn.id}\.png$`));
    const state = createGame(d3, 1);
    placeUnitForTest(state, drawn.id, 0);
    const host = document.createElement('div');
    host.innerHTML = soloPanelHtml(state, {
      selected: 0, list: nextCombines(state, { slot: 0 }), idleList: true, wPick: null, hover: null, showAllOne: false, skillOpen: false,
    });
    expect(host.querySelector('.nc-head .unit-face img')).not.toBeNull();

    const plain = d3.units.find(u => !hasSprite(u.id));
    if (plain) {
      const { root: r } = details(d3, plain.id);
      expect(r.querySelector('.win-head .unit-face .stack-disc')!.textContent).toBe(plain.name.slice(0, 1));
    }
  });
});
