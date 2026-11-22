// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, roundResistRange, unitDefFast, type ClientView, type GameData } from '@dorandi/logic';
import { forceRound, makeData, placeUnitForTest } from '@dorandi/logic/testing';
import { attackRangeText, combineNotes, dexEntries, hudModel, resistText, unitCard, unitSkillText } from '../src/ui/models';
import { renderHud } from '../src/ui/hud';
import { topModel } from '../src/online/models';

const d1 = loadGameData('stage1');
const d2 = loadGameData('stage2');
const d3 = loadGameData('stage3');
const text = (data: GameData, id: string) => unitSkillText(data, unitDefFast(data, id));

describe('whole-lane slow text', () => {
  test('every 60-round slow reads as 전체 둔화 without its old radius', () => {
    expect(text(d3, 'samtaegi')).toBe('25% 주변 1칸에 공격력 85%, 전체 둔화 20% 1.5초');
    expect(text(d3, 'kkeul')).toContain('전체 둔화 28% 2초');
    for (const e of dexEntries(d3)) {
      if (!unitDefFast(d3, e.id).skills.some(s => s.effects.some(x => x.kind === 'slow'))) continue;
      expect(e.skillText, e.id).toContain('전체 둔화');
      expect(e.skillText, e.id).not.toMatch(/(주변 [0-9.]+칸 |맞은 적 모두 |대상 말고 맞은 적에게 )둔화/);
    }
  });

  test('the slow factor shows in the pct', () => {
    const half = makeData(d => { d.balance.wholeLaneSlow = { pctFactor: 0.5 }; }, 'stage3');
    expect(text(half, 'kkeul')).toContain('전체 둔화 14% 2초');
  });

  test('stage 1 and 2 slows keep their wording', () => {
    expect(text(d1, 'meongseok')).toBe('20% 주변 둔화 30% 2초');
    expect(text(d2, 'chaeban')).not.toContain('전체');
  });

  test('the unit card and the combine card read the same text', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'samtaegi', 0);
    expect(unitCard(s, 0)!.skillText).toContain('전체 둔화 20% 1.5초');
    expect(combineNotes(d3, 'jejuyeonggam')!.lostControls).toEqual(['스턴 (북)', '밀어내기 (바가지)']);
  });

  test('stun seconds and range come from the data', () => {
    expect(text(d3, 'indupan')).toContain('주변 1칸 스턴 0.9초');
    expect(text(d3, 'bujipge')).toContain('스턴 1.3초');
    const dex = dexEntries(d3).find(e => e.id === 'gamtudokkaebi')!;
    expect(attackRangeText(d3, dex.range)).toBe('3.5칸');
    const moved = makeData(d => { d.units.find(u => u.id === 'indupan')!.range = 4; }, 'stage3');
    expect(attackRangeText(moved, dexEntries(moved).find(e => e.id === 'indupan')!.range)).toBe('4칸');
  });
});

describe('resistance readout', () => {
  test('nothing outside the 60-round mode or while every resist is 0', () => {
    expect(resistText(d1, 30)).toBeNull();
    expect(resistText(d2, 12)).toBeNull();
    expect(resistText(d3, 1)).toBeNull();
    expect(resistText(d3, 0)).toBeNull();
  });

  test('a single enemy type shows its own numbers, a mixed wave a range', () => {
    expect(resistText(d3, 3)).toBe('저항 물리 50% · 마법 0%');
    const r60 = roundResistRange(d3, 60)!;
    const p = (x: number) => `${Math.round(x * 100)}%`;
    expect(resistText(d3, 60)).toBe(`저항 물리 ${p(r60.physical[0])} · 마법 ${p(r60.magical[0])}`);
    const r56 = roundResistRange(d3, 56)!;
    expect(resistText(d3, 56)).toBe(`저항 물리 ${Math.round(r56.physical[0] * 100)}~${p(r56.physical[1])} · 마법 ${Math.round(r56.magical[0] * 100)}~${p(r56.magical[1])}`);
  });

  test('the solo top bar shows it in a late round', () => {
    document.body.innerHTML = '<div id="top"></div><div id="alert"></div>';
    const s = createGame(d3, 1);
    forceRound(s, 51);
    expect(hudModel(s).resistText).toBe(resistText(d3, 51));
    renderHud(s, false);
    expect(document.querySelector('#top .resist')!.textContent).toBe(resistText(d3, 51));
    forceRound(s, 1);
    renderHud(s, false);
    expect(document.querySelector('#top .resist')).toBeNull();
  });

  test('the online top line ends with it', () => {
    const view = {
      n: 0, dataVersion: 'x', difficulty: 'normal',
      clock: { tick: 0, phase: 'round', round: 45, roundStartTick: 0, roundEndTick: 400 },
      rows: [{ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 3, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null }],
      gate: { stage: 4, kills: 0, deadlineTick: 1e6 }, yeoksin: null, me: { seat: 1, key: 'k' },
    } as unknown as ClientView;
    expect(topModel(view, d3).line1.endsWith(` · ${resistText(d3, 45)}`)).toBe(true);
    expect(topModel({ ...view, clock: { ...view.clock, round: 2 } }, d3).line1).not.toContain('저항');
  });
});
