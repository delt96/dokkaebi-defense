import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, unitDefFast } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { spriteKey, tameArt } from '../src/sprites';
import { dexHtml } from '../src/ui/dex';
import { combineNoteLines, combineNotes, combineOptions, dexEntries, helperModel, unitCard, unitNotes, unitSkillText, upgradeRows } from '../src/ui/models';

const d3 = loadGameData('stage3');
const text = (id: string) => unitSkillText(d3, unitDefFast(d3, id));

describe('stage 3 skill text', () => {
  test('splash radius cycle, inherited supports and their source notes (천년 상모)', () => {
    expect(text('cheonnyeonsangmo')).toBe(
      '대상에게 공격력 45% 추가 피해, 주변 0.5→1→1.5→2칸을 번갈아 공격력 65%, 받는 마딜 +15% 3초 (망건의 효과와 겹치지 않음)'
      + ' / 오라: 주변 마딜 아군 공격력 +13% (갓의 효과와 겹치지 않음)',
    );
    expect(combineNoteLines(d3, 'cheonnyeonsangmo')).toEqual([
      '마딜 강화를 받음 · 사거리 2.5칸',
      '이어받는 지원 효과: 망건의 받는 마딜 +15% 3초 / 갓의 주변 마딜 아군 공격력 +13%',
      '조합하면 사라지는 제어: 스턴 (가위)',
    ]);
  });

  test('fire alignment and the basic-hit line', () => {
    expect(text('jaetmulsiru')).toBe('대상이 지나온 1.5칸에 2.5초 불길 / 기본 공격마다 추가 피해: 주변 3칸에 공격력 5%');
    expect(text('jipbae')).toBe('5번째 공격마다 대상이 갈 쪽 2.5칸에 3초 불길 / 기본 공격마다 추가 피해: 대상에게 공격력 15%, 주변 3칸에 공격력 20%');
  });

  test('odd attacks, stunned bonus, pierce both ways and the knocked bonus', () => {
    expect(text('cheonnyeondadeumitdol')).toBe('홀수 번째 공격마다 피해 1.8배 / 2번째 공격마다 주변 1칸에 공격력 85%');
    expect(text('cheonnyeonyogang')).toContain('주변 1.25칸에 공격력 185% (스턴 중이거나 풀린 지 1초 안이면 1.5배)');
    expect(text('gildal')).toContain('앞뒤 1.5칸 관통 125%');
    expect(text('cheonnyeondot')).toContain('뒤따르는 2.5칸 관통 60% (이번 라운드에 밀려난 적에게 1.8배)');
    expect(text('cheonnyeontteoksal')).toContain('처형으로 처치하면 주변 폭발 80%');
  });

  test('who a status lands on, stacking vulns and aura damage lines', () => {
    expect(text('indupan')).toBe('4번째 공격마다 피해 2.25배, 주변 1칸 스턴 0.6초');
    expect(text('kkeul')).toBe('4번째 공격마다 뒤따르는 2.5칸 관통 120%, 대상 말고 맞은 적에게 둔화 28% 2초');
    expect(text('jinegaksi')).toContain('맞은 적 모두 받는 물딜 +16% 3초');
    expect(text('cheonnyeonjing')).toContain('받는 물딜 +4% 4초 (최대 5중첩, 모루의 효과와 겹치지 않음)');
    expect(text('mulle')).toBe('3번째 공격마다 한 번 더 공격 / 오라: 주변 물딜 아군 공격 속도 +12%');
    expect(text('buk')).toContain('오라: 사거리 안 적이 받는 물딜 +15%');
  });

  test('combine cards: auras that vanish, supports carried on, controls lost', () => {
    expect(combineNotes(d3, 'daljip')!.lostAuras).toEqual(['청사초롱의 주변 아군 공격 속도 +10%']);
    expect(combineNotes(d3, 'gat')!.lostAuras).toEqual(['인두의 주변 마딜 아군 공격 속도 +15%']);
    expect(combineNotes(d3, 'jejuyeonggam')).toMatchObject({
      inherited: ['북의 사거리 안 적이 받는 물딜 +15%'], lostAuras: [], lostControls: ['스턴 (북)', '밀어내기 (바가지)'],
    });
    const dex = dexEntries(d3).find(e => e.id === 'daljip')!;
    expect(dex.notes).toContain('조합하면 사라지는 오라: 청사초롱의 주변 아군 공격 속도 +10%');
    expect(dex.notes).toContain('오라는 종류마다 한 번만, 합쳐서 공격 속도 +50%·공격력 +40%까지');
  });

  test('stage 1 and 2 cards stay as they were', () => {
    const d2 = loadGameData('stage2');
    expect(combineNotes(d2, 'daljip')).toBeNull();
    expect(dexEntries(d2).every(e => e.notes.length === 0 && e.cost === null)).toBe(true);
    const s = createGame(d2, 1); placeUnitForTest(s, 'sotlid', 0);
    expect(unitCard(s, 0)).toMatchObject({ skillText: '20% 스턴 0.5초', notes: [] });
  });

  test('every unit has skill text without placeholders', () => {
    for (const e of dexEntries(d3)) {
      expect(e.skillText, e.id).not.toMatch(/undefined|NaN|null/);
      for (const n of e.notes) expect(n, e.id).not.toMatch(/undefined|NaN|null/);
    }
  });
});

describe('combine cost', () => {
  test('a grade 5 recipe shows its cost; short of buckwheat it is listed without a hotkey', () => {
    const s = createGame(d3, 1); placeUnitForTest(s, 'meok', 7); placeUnitForTest(s, 'jige', 0);
    const top = () => combineOptions(s, 7).find(o => o.result === 'top')!;
    expect(top()).toMatchObject({ missing: [], key: null, cost: '메밀묵 1개', short: '메밀묵 1개 모자람' });
    expect(helperModel(s)).toContainEqual({ recipe: 'top', name: '톱', grade: 5, cost: '메밀묵 1개', short: '메밀묵 1개 모자람' });
    // a recipe still missing materials only says what it costs
    const heobeok = combineOptions(s, 0).find(o => o.result === 'jejuheobeok')!;
    expect(heobeok).toMatchObject({ missing: ['옹기가마'], cost: '메밀묵 1개', key: null });
    expect(heobeok.short).toBeUndefined();
    s.buckwheat = 1;
    expect(top()).toEqual({ result: 'top', name: '톱', grade: 5, missing: [], key: 'Z', cost: '메밀묵 1개' });
    expect(helperModel(s)).toContainEqual({ recipe: 'top', name: '톱', grade: 5, cost: '메밀묵 1개' });
  });

  test('grade 6 needs coins too', () => {
    const s = createGame(d3, 1);
    for (const [id, i] of [['top', 0], ['kkeul', 1], ['ja', 7]] as const) placeUnitForTest(s, id, i);
    s.buckwheat = 1; s.coins = 45;
    expect(combineOptions(s, 0).find(o => o.result === 'bihyeongrang')).toMatchObject({ cost: '메밀묵 1개 · 엽전 60냥', short: '엽전 15냥 모자람', key: null });
  });
});

describe('sprites', () => {
  const dir = fileURLToPath(new URL('../public/sprites/', import.meta.url));
  const files = new Set(readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
  test('every stage 3 unit id has its own sprite file', () => {
    const missing = d3.units.filter(u => !files.has(u.id)).map(u => u.id);
    expect(missing).toEqual([]);
  });
  test('stage 3 pass bosses draw the art of the boss they repeat; anything else falls back', () => {
    for (const e of d3.enemies.filter(x => x.boss)) expect(spriteKey(e.id, files), e.id).not.toBeNull();
    expect(spriteKey('jinegaksi5', files)).toBe('jinegaksi');
    expect(spriteKey('gangcheori6', files)).toBe('gangcheori');
    expect(spriteKey('nosuchunit', files)).toBeNull();
    expect(spriteKey('yeoksin1', files)).toBeNull();
    // event enemies borrow the art of the hidden unit they are tamed into
    const alias = tameArt(d3);
    for (const id of ['ev_soebap', 'ev_ssireum', 'ev_shadow']) expect(spriteKey(id, files, alias), id).toBe(alias.get(id));
    expect(tameArt(loadGameData('stage2')).size).toBe(0);
  });
});

describe('review fixes: aura for all, lockouts, cooldowns, slow radii, tamed units', () => {
  test('an aura for every damage type reads without a type; lockout and cooldown are shown', () => {
    expect(text('bihyeongrang')).toContain('오라: 주변 아군 공격력 +10%');
    expect(text('bihyeongrang')).toContain('이웃의 기본 공격 8번마다 (발동 뒤 2초 쉼) ');
    expect(text('duduri')).toContain('약화된 적이 쓰러지면 주변 1.5칸 폭발 80% (1.1초에 한 번)');
  });

  test('stage 3 area slows give their radius; stage 1-2 slows keep the old words', () => {
    expect(text('samtaegi')).toContain('주변 1칸 둔화 20% 1.5초');
    expect(text('eomang')).toContain('주변 1.5칸 둔화 42% 3초');
    const d2 = loadGameData('stage2');
    const old = d2.units.filter(u => u.skills.some(s => s.effects.some(e => e.kind === 'slow' && e.radius)));
    expect(old.length).toBeGreaterThan(0);
    for (const u of old) expect(unitSkillText(d2, u)).toMatch(/주변 둔화/);
  });

  test('the dex says 길들이기 for the five hidden units and 소환 for grade 1', () => {
    const entries = dexEntries(d3);
    expect(entries.filter(e => e.hidden).map(e => e.id).sort()).toEqual(['bulgasari', 'eoduksini', 'gangcheori', 'jinegaksi', 'ssireumdokkaebi']);
    expect(dexEntries(loadGameData('stage2')).some(e => e.hidden)).toBe(false);
    const row = (html: string, name: string) => html.split('<tr').find(r => r.includes(`<td>${name}</td>`)) ?? '';
    expect(row(dexHtml(d3), '강철이')).toContain('<td>길들이기');
    expect(row(dexHtml(d3), '짚신')).toContain('<td>소환');
  });
});

test('dex filters retain the selected grade, hidden units and story actions', () => {
  const story = { target: null, canSet: true };
  const highest = dexHtml(d3, story, '6');
  const eligible = d3.units.filter(u => u.grade === 6 && !u.hidden);
  expect(highest.match(/data-action="storyTarget"/g)).toHaveLength(eligible.length);
  expect(highest).not.toContain('>5</td>');
  const hidden = dexHtml(d3, story, 'hidden');
  expect(hidden.match(/>길들이기/g)).toHaveLength(d3.units.filter(u => u.hidden).length);
  expect(hidden).not.toContain('data-action="storyTarget"');
  expect(dexHtml(d3)).toContain(`도감 · ${d3.units.length}종`);
  for (const stage of ['stage1', 'stage2'] as const) {
    expect(dexHtml(loadGameData(stage))).not.toContain('dex-filters');
  }
});

test('dex search combines grade with a unit or material name and handles no matches', () => {
  const byName = dexHtml(d3, undefined, '6', '천년상모');
  expect(byName).toContain('>천년 상모</td>');
  const byMaterial = dexHtml(d3, undefined, '5', '지게');
  expect(byMaterial).toContain('>톱</td>');
  expect(dexHtml(d3, undefined, '1', '천년상모')).toContain('찾는 유닛이 없습니다');
});

test('the slots upgrade says how many cells its next level opens: 4 on the 8 x 5 board, 2 on 6 x 4', () => {
  const s = createGame(d3, 1);
  const row = () => upgradeRows(s).find(r => r.id === 'slots')!;
  expect([row().effectText, row().max, row().cost]).toEqual(['칸 4개 열기', 4, 50]);
  s.upgrades.slots = 3;
  expect([row().effectText, row().cost]).toEqual(['칸 4개 열기', 200]);
  const one = createGame(loadGameData(), 1);
  expect(upgradeRows(one).find(r => r.id === 'slots')!.effectText).toBe('칸 2개 열기');
});

test('a stage 3 card says which upgrade the unit gets: its own type, never the higher of its materials', () => {
  expect(unitNotes(d3, unitDefFast(d3, 'jangdok'))[0]).toBe('물딜 강화를 받음');
  expect(unitNotes(d3, unitDefFast(d3, 'bihyeongrang'))[0]).toBe('마딜 강화를 받음');
  expect(combineNoteLines(d3, 'jangdok')[0]).toMatch(/^물딜 강화를 받음 · 사거리/);
  expect(JSON.stringify(dexEntries(d3))).not.toContain('높은 쪽');
  const d1 = loadGameData();
  expect(unitNotes(d1, unitDefFast(d1, 'sotlid'))).toEqual([]);
});
