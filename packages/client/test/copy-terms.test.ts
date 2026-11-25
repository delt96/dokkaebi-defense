// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { createGame, econView, loadGameData, type ClientView, type MatchResult, type RowView } from '@dorandi/logic';
import { forceRound, placeUnitForTest, spawnEnemyForTest } from '@dorandi/logic/testing';
import { cellText, crackText, hudModel, tameSourceText, upgradeInfoText, upgradeRows } from '../src/ui/models';
import { renderHud } from '../src/ui/hud';
import { helpLineHtml, renderBottom, upgradesHtml } from '../src/ui/panels';
import { settingsHtml } from '../src/ui/settings';
import { jigeListHtml } from '../src/ui/econ';
import { gambleInfoHtml, gambleModel } from '../src/ui/gamble';
import { dexHtml } from '../src/ui/dex';
import { topModel } from '../src/online/models';
import { renderTop } from '../src/online/panels';
import { menuHtml, spiritCardHtml, spiritModel } from '../src/online/spirit';
import { teamResultModel } from '../src/online/result';
import { questBoxHtml } from '../src/ui/econ';

const d1 = loadGameData();
const d2 = loadGameData('stage2');
const d3 = loadGameData('stage3');

const row = (over: Partial<RowView>): RowView => ({ seat: 1, name: '가', status: 'alive', connected: true, reconnectTicksLeft: null, count: 0, overLimitTicks: 0, received: false, cause: null, eliminatedTick: null, ...over });

function viewWith(o: { me: number; watching?: number; round?: number; rows: RowView[] }): ClientView {
  return {
    n: 0, dataVersion: 'x',
    clock: { tick: 5000, phase: 'round', round: o.round ?? 6, roundStartTick: 0, roundEndTick: 5400 },
    rows: o.rows,
    gate: { stage: 1, kills: 0, deadlineTick: 7799 },
    yeoksin: { stage: 1, hp: 6632, maxHp: 7480, seat: 2, enterTick: 4881, nextSeat: 3 },
    me: { seat: o.me, key: 'k' },
    mine: {
      tick: 5000, tokens: 0, coins: 0, buckwheat: 0, upgrades: { physical: 0, magical: 0, polish: 0 },
      grade1Summons: 0, helperOpens: 0, supportTokens: 0, received: false, lastSeq: 0, open: [], units: [], acks: [], supportIn: [],
    },
    watching: o.watching ?? o.me,
    lane: { seat: o.watching ?? o.me, tick: 5000, open: [], units: [], enemies: [], fires: [] },
    result: null,
  };
}

describe('the 장승 gauge follows the real loss rule', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="top"></div><div id="alert"></div>'; });

  test('at the limit it is 한계; only above it 무너짐', () => {
    expect(crackText(0, 60)).toBe('멀쩡함');
    expect(crackText(30, 60)).toBe('흔들림');
    expect(crackText(59, 60)).toBe('금 감');
    expect(crackText(60, 60)).toBe('한계');
    expect(crackText(61, 60)).toBe('무너짐');
  });

  test('the HUD shows 한계 with 60 on the board and 무너짐 with 61', () => {
    const s = createGame(d1, 1);
    forceRound(s, 3);
    for (let i = 0; i < 60; i++) spawnEnemyForTest(s, 'japgwi', 0);
    renderHud(s, false);
    expect(document.querySelector('#top .gauge-text')!.textContent).toBe('장승 한계');
    spawnEnemyForTest(s, 'japgwi', 0);
    renderHud(s, false);
    expect(document.querySelector('#top .gauge-text')!.textContent).toBe('장승 무너짐');
  });

  test('solo says 내 잡귀 like online', () => {
    expect(hudModel(createGame(d1, 1)).enemyText).toBe('내 잡귀 0 / 60');
  });
});

describe('online top bar', () => {
  test('역신(첫째) 체력 instead of 첫째 탈', () => {
    const v = viewWith({ me: 1, rows: [row({ seat: 1, count: 12 })] });
    expect(topModel(v, d2).line2).toBe('관문 1/2 · 마감까지 3라운드 · 역신(첫째) 체력 6,632 / 7,480');
  });

  test('my count turns red at the same 위험 line as my left row', () => {
    const danger = d2.coop!.danger;
    const calm = viewWith({ me: 1, rows: [row({ seat: 1, count: danger - 1 })] });
    expect(topModel(calm, d2).mineLevel).toBe('ok');
    const hot = viewWith({ me: 1, rows: [row({ seat: 1, count: danger })] });
    expect(topModel(hot, d2).mineLevel).toBe('warn');
    document.body.innerHTML = '<div id="top"></div>';
    renderTop(hot, d2);
    expect(document.querySelector('#top .mine-danger')!.textContent).toBe(`내 잡귀 ${danger} / 60`);
    renderTop(calm, d2);
    expect(document.querySelector('#top .mine-danger')).toBeNull();
    expect(document.querySelector('#top .line')!.textContent).toContain(`내 잡귀 ${danger - 1} / 60`);
  });
});

describe('menu and settings words', () => {
  test('the forfeit button and window say 포기(넋 되기); the question stays', () => {
    expect(menuHtml('menu', false)).toContain('>포기(넋 되기)</button>');
    const forfeit = menuHtml('forfeit', false);
    expect(forfeit).toContain('<div class="modal-head">포기(넋 되기)</div>');
    expect(forfeit).toContain('포기하면 넋이 되어 관전과 지원만 할 수 있습니다. 포기할까요?');
    expect(forfeit).not.toContain('나가기');
  });

  test('the help-line row names the hotkey line, and effects read 보통/줄임', () => {
    const html = settingsHtml({ helper: false, reducedFx: false, help: true });
    const rows = Array.from(html.matchAll(/<div class="settings-row"[^>]*><span>([^<]+)<\/span>/g)).map(m => m[1]);
    expect(rows).toEqual(['조합 도우미', '화면 효과', '단축키 안내 줄']);
    const fx = Array.from(html.matchAll(/data-action="setFx" data-arg="(\w+)" aria-pressed="(\w+)">([^<]+)</g)).map(m => `${m[1]}:${m[2]}:${m[3]}`);
    expect(fx).toEqual(['off:true:보통', 'on:false:줄임']);
  });
});

describe('cell positions and the 원가 unit', () => {
  test('one row/column form for the board', () => {
    expect(cellText(d3.balance.grid.cols, 0)).toBe('1행 1열');
    expect(cellText(d3.balance.grid.cols, d3.balance.grid.cols + 2)).toBe('2행 3열');
  });

  test('the 지게 window says the cell as 행·열 and the 원가 in grade-1 units', () => {
    const cols = d3.balance.grid.cols;
    const html = jigeListHtml(d3, { source: { zone: 'board', index: cols + 4, unitId: 1 }, defId: 'sotlid', cost: 8, seat: undefined, epoch: undefined, name: '', type: null, reasons: {} }, 1);
    expect(html).toContain('진영 2행 5열');
    expect(html).toContain('원가 1등급 8기 값');
    expect(html).not.toContain('번 칸');
  });
});

describe('upgrades', () => {
  test('each row shows the total now and after the next level', () => {
    const s = createGame(d1, 1);
    s.upgrades.physical = 2;
    const pct = Math.round(d1.upgrades.find(u => u.id === 'physical')!.pct! * 100);
    expect(upgradeRows(s)[0]!.effectText).toBe(`물딜 공격력 지금 +${pct * 2}% → 다음 +${pct * 3}%`);
    const max = d1.upgrades.find(u => u.id === 'physical')!.max;
    s.upgrades.physical = max;
    expect(upgradeRows(s)[0]!.effectText).toBe(`물딜 공격력 +${pct * max}% · 최대`);
  });

  test('the window shows this round\'s resistance and my physical/magical unit counts', () => {
    const s = createGame(d3, 1);
    forceRound(s, 65);
    ['bitjaru', 'jipsin', 'horong'].forEach((id, i) => placeUnitForTest(s, id, i));
    const info = upgradeInfoText(s);
    expect(info).toContain('저항 물리');
    expect(info).toContain('내 물딜 2기 · 마딜 1기');
    expect(upgradesHtml(s, 'inside', 0)).toContain('내 물딜 2기 · 마딜 1기');
    const early = createGame(d1, 1);
    expect(upgradeInfoText(early)).toBe('내 물딜 0기 · 마딜 0기');
  });
});

describe('market guide', () => {
  test('one guide line, and the first bundle\'s odds before anything is picked', () => {
    const s = createGame(d3, 1);
    const model = gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat);
    const html = gambleInfoHtml(model, null, { chance: 0.03, held: 0, maxGrade: 4 });
    expect(html).not.toContain('마우스를 올려');
    expect(html).toContain('<strong>보따리</strong>');
    expect(html).toContain('3등급 45%');
    expect(html.match(/이름을 눌러/g)).toHaveLength(1);
  });

  test('the coin gamble says its average payback from the data', () => {
    const s = createGame(d3, 1);
    const model = gambleModel(econView(s)!.market!.gamble!, s.coins, s.buckwheat);
    const outcomes = d3.economy!.market!.gamble!.coins.outcomes;
    const avg = Math.round(outcomes.reduce((n, o) => n + o.result * o.chance, 0) * 100);
    expect(avg).toBe(101);
    expect(gambleInfoHtml(model, '10', { chance: 0.03, held: 0, maxGrade: 4 })).toContain(`평균 회수 ${avg}%`);
    expect(gambleInfoHtml(model, 'small', { chance: 0.03, held: 0, maxGrade: 4 })).not.toContain('평균 회수');
  });
});

describe('quest button', () => {
  test('the box head says 퀘스트 (J) with the count, solo and online alike', () => {
    expect(questBoxHtml({ count: 2, hunt: null, more: 0, next: null })).toContain('>퀘스트 (J) · 2개<');
  });
});

describe('hidden units in the dex', () => {
  test('each recruit names the enemy and the round it shows up', () => {
    expect(tameSourceText(d3, 'jinegaksi')).toBe('지네각시 · 10라운드 보스');
    expect(tameSourceText(d3, 'bulgasari')).toBe('쇠밥짐승 · 5라운드부터 격파');
    expect(tameSourceText(d3, 'ssireumdokkaebi')).toBe('씨름 도깨비 · 32라운드');
    expect(tameSourceText(d3, 'eoduksini')).toBe('그늘손 · 43라운드');
    expect(tameSourceText(d3, 'sotlid')).toBeNull();
    const row = dexHtml(d3, 'hidden').split('<tr').find(r => r.includes('<div class="dex-name">지네각시</div>')) ?? '';
    expect(row).toContain('길들이기로 획득: 지네각시 · 10라운드 보스');
  });
});

describe('spirit card', () => {
  const spiritView = () => {
    const v = viewWith({ me: 2, watching: 1, rows: [row({ seat: 1, name: '가' }), row({ seat: 2, status: 'spirit' })] });
    return v;
  };

  test('with a token it says tokens do not pile up', () => {
    const v = spiritView();
    v.mine.supportTokens = 1;
    expect(spiritCardHtml(v, d2, null)).toContain('토큰은 쌓이지 않습니다 · 이번 라운드 안에 보내세요');
  });

  test('when the data lets tokens pile up, it says how many instead', () => {
    const v = spiritView();
    v.mine.supportTokens = 1;
    const piling = structuredClone(d2);
    piling.coop!.support.max = 3;
    const html = spiritCardHtml(v, piling, null);
    expect(html).not.toContain('쌓이지 않습니다');
    expect(html).toContain('토큰은 3개까지 쌓입니다');
  });

  test('after sending this round it says who got how much', () => {
    const v = spiritView();
    v.mine.supportTokens = 0;
    v.rows[0]!.received = true;
    expect(spiritModel(v, { seat: 1, round: 6 })).toMatchObject({ canSend: false, sentTo: 1 });
    const html = spiritCardHtml(v, d2, { seat: 1, round: 6 });
    expect(html).toContain(`1번에게 ${d2.coop!.support.coins}냥을 보냈습니다`);
    expect(html).not.toContain('지원 토큰이 없습니다');
    expect(spiritModel(v, { seat: 1, round: 5 })).toMatchObject({ sentTo: null });
  });
});

describe('first help line', () => {
  test('an empty board starts with how to summon', () => {
    expect(helpLineHtml(undefined, { empty: true })).toContain('Space나 뚝딱!으로 유닛을 뽑으세요.');
    expect(helpLineHtml(undefined, {}).startsWith('<div class="card hint">W 다음 조합 고르기')).toBe(true);
    document.body.innerHTML = '<div id="bottom"></div>';
    const s = createGame(d1, 1);
    renderBottom(s, null, false);
    expect(document.getElementById('bottom')!.textContent!.startsWith('Space나 뚝딱!으로 유닛을 뽑으세요.')).toBe(true);
    placeUnitForTest(s, 'sotlid', 0);
    renderBottom(s, null, false);
    expect(document.getElementById('bottom')!.textContent!.startsWith('W 다음 조합 고르기')).toBe(true);
  });
});

describe('online result words', () => {
  test('short notes under the table explain 역신 격파, 잡귀 마지막/최대 and 생존·팀 패배', () => {
    const result: MatchResult = { outcome: 'gate', tick: 7799, round: 9, yeoksinKills: 0, started: 2, alive: 1, seats: [
      { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3], bestUnit: null, yeoksinDamage: 3000, helperOpens: 2, supportSent: 0, supportReceived: 0 },
      { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 9, 30, 61], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 0, supportReceived: 0 },
    ] };
    const notes = teamResultModel(result, {}, d2).notes;
    expect(notes.some(n => n.startsWith('역신 격파'))).toBe(true);
    expect(notes.some(n => n.startsWith('잡귀 마지막 / 최대'))).toBe(true);
    expect(notes.some(n => n.startsWith('생존·팀 패배'))).toBe(true);
    const clear = { ...result, outcome: 'clear' as const, seats: [{ ...result.seats[0]!, outcome: 'finished' as const }] };
    expect(teamResultModel(clear, {}, d2).notes.some(n => n.startsWith('생존·팀 패배'))).toBe(false);
  });
});
