// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { placeUnitForTest } from '@dorandi/logic/testing';
import { helpLineHtml, renderBottom, renderRight } from '../src/ui/panels';
import { renderHud } from '../src/ui/hud';
import { pinButton } from '../src/ui/target';

const data = loadGameData();
const d3 = loadGameData('stage3');

describe('help line and labels', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="top"></div><div id="right"></div><div id="bottom"></div><div id="alert"></div>'; });

  test('with a unit selected the solo help line lists what that unit takes', () => {
    const s = createGame(d3, 1);
    placeUnitForTest(s, 'sotlid', 0);
    renderBottom(s, 0, false, 'B 장터');
    expect(document.getElementById('bottom')!.textContent).toBe('Z/X/C 조합(판에 짝 표시) · S 판매 · A 보관 · R 지게 · Tab 상세 · M 옮기기 · W 다음 조합 · Esc 해제');
    renderBottom(s, null, false, 'B 장터');
    expect(document.getElementById('bottom')!.textContent).toBe(
      '조합할 재료가 아직 모자랍니다 · Space로 더 뽑으세요 (도깨비불 4개) · W 다음 조합 고르기 · E 강화 · D 도감 · Q 이 유닛/전체 · G 1·2등급 보관 · B 장터 · J 퀘스트 · P 멈춤');
  });

  test('online has no P in the help line', () => {
    expect(helpLineHtml(undefined, { quests: true })).not.toContain('P 멈춤');
  });

  test('the 장승 gauge says its state in words', () => {
    renderHud(createGame(data, 1), false);
    expect(document.querySelector('#top .gauge-text')!.textContent).toBe('장승 멀쩡함');
  });

  test('target and convert buttons say what they do', () => {
    expect(pinButton('gamasot', null)).toContain('>목표로<');
    expect(pinButton('gamasot', 'gamasot')).toContain('>목표 해제<');
    renderRight(createGame(data, 1));
    expect(document.querySelector('[data-action="convert"]')!.textContent).toBe(`불 1개 → ${data.balance.tokens.toCoins}냥`);
  });
});
