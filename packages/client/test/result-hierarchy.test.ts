// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, type MatchResult, type RoundStats } from '@dorandi/logic';
import { resultHtml } from '../src/ui/result';
import { renderResult, teamResultModel } from '../src/online/result';

const data = loadGameData();
const d2 = loadGameData('stage2');

const stat = (round: number, endEnemies: number): RoundStats =>
  ({ round, hpSpawned: 0, damageDealt: 0, damageInRound: 0, maxEnemies: endEnemies, endEnemies, bossKillSeconds: null });

function soloResult(outcome: 'clear' | 'defeat', rounds: number): HTMLElement {
  const s = createGame(data, 1);
  s.phase = 'ended';
  s.result = outcome === 'clear' ? { outcome, reason: null, round: rounds } : { outcome, reason: 'limit', round: rounds };
  s.stats = Array.from({ length: rounds }, (_, i) => stat(i + 1, i * 3));
  const host = document.createElement('div');
  host.innerHTML = resultHtml(s, null);
  return host;
}

describe('solo result hierarchy', () => {
  test('the title is its own big word, marked clear or defeat, with the reason beside it', () => {
    const win = soloResult('clear', 20);
    expect(win.querySelector('.result-big')?.textContent).toBe('클리어');
    expect(win.querySelector('.result-big')?.classList.contains('result-clear')).toBe(true);
    const loss = soloResult('defeat', 7);
    expect(loss.querySelector('.result-big')?.textContent).toBe('탈락');
    expect(loss.querySelector('.result-big')?.classList.contains('result-defeat')).toBe(true);
    expect(loss.querySelector('.result-why')?.textContent).toBe('고개가 뚫렸습니다');
  });

  test('the graph has a round scale from 1 to the last recorded round', () => {
    const scale = (host: HTMLElement) => Array.from(host.querySelectorAll('.graph-scale span'), s => s.textContent);
    expect(scale(soloResult('defeat', 7))).toEqual(['1라운드', '7라운드']);
    expect(scale(soloResult('defeat', 1))).toEqual(['1라운드']);
  });
});

const result: MatchResult = { outcome: 'gate', tick: 7799, round: 9, yeoksinKills: 0, started: 3, alive: 1, seats: [
  { seat: 1, outcome: 'aliveTeamLoss', cause: null, round: 9, lastEnemies: 20, maxEnemies: 40, series: [1, 2, 3], bestUnit: null, yeoksinDamage: 3000, helperOpens: 2, supportSent: 0, supportReceived: 3 },
  { seat: 2, outcome: 'eliminated', cause: 'limit', round: 4, lastEnemies: 61, maxEnemies: 61, series: [5, 9, 30, 61], bestUnit: null, yeoksinDamage: 1200, helperOpens: 0, supportSent: 2, supportReceived: 0 },
  { seat: 3, outcome: 'eliminated', cause: 'forfeit', round: 6, lastEnemies: 30, maxEnemies: 30, series: [5, 9], bestUnit: null, yeoksinDamage: 0, helperOpens: 0, supportSent: 1, supportReceived: 0 },
] };
const names = { 1: '가', 2: '나', 3: '다' };

describe('online result hierarchy', () => {
  test('each row says it opens: a closed caret, an open caret, and a hint on hover', () => {
    const root = document.createElement('div');
    renderResult(root, result, names, d2, { rematch() {}, leave() {} }, { opened: 2, rematching: false });
    const rows = root.querySelectorAll<HTMLButtonElement>('.result-row');
    expect(rows[0]!.querySelector('.r-caret')?.textContent).toBe('▸');
    expect(rows[1]!.querySelector('.r-caret')?.textContent).toBe('▾');
    expect(rows[0]!.title).toBe('가 · 누르면 라운드별 그래프');
    expect(rows[1]!.title).toBe('나 · 누르면 접기');
    expect(rows[0]!.querySelector('.r-name')?.textContent).toBe('▸가');
  });

  test('a player detail keeps the spirit supports sent and received', () => {
    const m = teamResultModel(result, names, d2);
    expect(m.rows.map(r => r.supportText)).toEqual(['넋 지원 받음 3회', '넋 지원 보냄 2회', '넋 지원 보냄 1회']);
    const root = document.createElement('div');
    renderResult(root, result, names, d2, { rematch() {}, leave() {} }, { opened: 1, rematching: false });
    expect(root.querySelector('.result-detail')?.textContent).toContain('도우미 2회 · 넋 지원 받음 3회');
  });

  test('one team line names the top 역신 damage and the top supporter', () => {
    expect(teamResultModel(result, names, d2).credit).toBe('역신 피해 1위 가 3,000 · 넋 지원 1위 나 2회');
    const root = document.createElement('div');
    renderResult(root, result, names, d2, { rematch() {}, leave() {} }, { opened: null, rematching: false });
    expect(root.querySelector('.result-credit')?.textContent).toBe('역신 피해 1위 가 3,000 · 넋 지원 1위 나 2회');
  });

  test('ties share the line, and nothing to praise leaves it out', () => {
    const tie = structuredClone(result);
    tie.seats[1]!.yeoksinDamage = 3000;
    tie.seats[2]!.supportSent = 0;
    tie.seats[1]!.supportSent = 0;
    expect(teamResultModel(tie, names, d2).credit).toBe('역신 피해 1위 가·나 3,000');
    const none = structuredClone(tie);
    for (const s of none.seats) s.yeoksinDamage = 0;
    expect(teamResultModel(none, names, d2).credit).toBeNull();
    const root = document.createElement('div');
    renderResult(root, none, names, d2, { rematch() {}, leave() {} }, { opened: null, rematching: false });
    expect(root.querySelector('.result-credit')).toBeNull();
  });

  test('a result from a server without support counts leaves the supporter out instead of NaN', () => {
    const old = structuredClone(result) as MatchResult;
    for (const seat of old.seats) delete (seat as Partial<typeof seat>).supportSent;
    expect(teamResultModel(old, names, d2).credit).toBe('역신 피해 1위 가 3,000');
  });
});
