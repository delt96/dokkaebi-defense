import { unitDefFast, type EliminationCause, type GameData, type MatchResult, type SeatOutcome, type TeamOutcome } from '@dorandi/logic';
import type { NetClient } from '../net/NetClient';
import { esc } from '../ui/dom';
import { TEXT } from './text';
import { graph } from '../ui/result';

export interface TeamRow {
  seat: number; name: string; status: string; last: number; max: number; best: string; damage: number;
  series: (number | null)[]; helperText: string;
}
export interface TeamResultModel { title: string; subtitle: string; rows: TeamRow[] }

const TITLE: Record<TeamOutcome, string> = { clear: '팀 클리어', wipe: '전멸', gate: '스토리 관문 실패' };
const CAUSE: Record<EliminationCause, string> = { limit: '잡귀 한도', boss: '고개 보스', forfeit: '포기', disconnect: '단절' };
const ROUNDS = 20;

function statusText(outcome: SeatOutcome, cause: EliminationCause | null, round: number): string {
  switch (outcome) {
    case 'finished': return '완주';
    case 'eliminated': return `${round}라운드 탈락${cause ? ` · ${CAUSE[cause]}` : ''}`;
    case 'unfinished': return '고개 보스 미완주';
    case 'aliveTeamLoss': return '생존·팀 패배';
  }
}

export function teamResultModel(result: MatchResult, names: Record<number, string>, data: GameData): TeamResultModel {
  return {
    title: TITLE[result.outcome],
    subtitle: `도달 ${result.round}라운드 · 역신 격파 ${result.yeoksinKills}/2 · 생존 ${result.alive}/${result.started}`,
    rows: result.seats.map(s => {
      const best = s.bestUnit ? `${unitDefFast(data, s.bestUnit.defId).name} (${s.bestUnit.grade}등급)` : '–';
      // one slot per round; rounds after an elimination stay empty
      const series: (number | null)[] = Array.from({ length: ROUNDS }, (_, i) => s.series[i] ?? null);
      return {
        seat: s.seat, name: names[s.seat] ?? `${s.seat}번`, status: statusText(s.outcome, s.cause, s.round),
        last: s.lastEnemies, max: s.maxEnemies, best, damage: s.yeoksinDamage, series, helperText: `도우미 ${s.helperOpens}회`,
      };
    }),
  };
}

export interface ResultActions { rematch(): void; leave(): void }
/** `closed`: the server closed the room (result hold over), so rematch can no longer be sent. */
export interface ResultUi { opened: number | null; rematching: boolean; closed?: boolean }

/** Without a rematch notice in this time the rematch button can be pressed again (the server retries on the next press). */
export const REMATCH_RETRY_MS = 5000;
/** Colyseus close code of a consented leave; the server's Room.disconnect() uses it too. */
const CLOSE_CONSENTED = 4000;

function div(cls: string, text?: string): HTMLElement {
  const node = document.createElement('div');
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draws the team result into #screen; clicking a row opens that player's per-round graph. */
export function renderResult(root: HTMLElement, result: MatchResult, names: Record<number, string>, data: GameData, actions: ResultActions, ui: ResultUi): void {
  const m = teamResultModel(result, names, data);
  const redraw = () => renderResult(root, result, names, data, actions, ui);
  const box = div('screen-box result-screen');
  box.append(div('result-title', m.title), div('result-sub', m.subtitle));

  for (const r of m.rows) {
    const open = ui.opened === r.seat;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = open ? 'result-row open' : 'result-row';
    row.innerHTML = `<span class="r-name">${esc(r.name)}</span><span class="r-status">${esc(r.status)}</span>`
      + `<span class="r-count">${r.last} / ${r.max}</span><span class="r-best">${esc(r.best)}</span><span class="r-dmg">${r.damage.toLocaleString('ko-KR')}</span>`;
    row.addEventListener('click', () => { ui.opened = open ? null : r.seat; redraw(); });
    box.append(row);
    if (open) {
      const detail = div('result-detail');
      detail.innerHTML = `<p>라운드 끝 잡귀 (빨간 점선: 한도 ${data.balance.limit})</p>${graph(r.series, data.balance.limit)}<p>${esc(r.helperText)}</p>`;
      box.append(detail);
    }
  }
  const head = div('result-head');
  head.innerHTML = '<span>이름</span><span>상태</span><span>마지막 / 최대 잡귀</span><span>최고 유닛</span><span>역신 피해</span>';
  box.insertBefore(head, box.children[2] ?? null);

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'big';
  again.textContent = ui.rematching && !ui.closed ? '새 방으로 가는 중' : '다시 하기';
  again.disabled = ui.rematching || ui.closed === true;
  again.addEventListener('click', () => { if (ui.rematching || ui.closed) return; ui.rematching = true; actions.rematch(); redraw(); });
  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'big';
  leave.textContent = '나가기';
  leave.addEventListener('click', () => actions.leave());
  box.append(again, leave);
  if (ui.closed) {
    const link = document.createElement('a');
    link.className = 'entry-link';
    link.setAttribute('href', '/');
    link.textContent = TEXT.newRoom;
    box.append(div('result-sub', TEXT.roomClosed), link);
  }
  root.replaceChildren(box);
}


/** Shows the team result in `root` when it arrives (also when a rejoin snapshot already carries it). */
export function mountResult(net: NetClient, root: HTMLElement, data: GameData, go: (href: string) => void = href => location.assign(href)): void {
  const ui: ResultUi = { opened: null, rematching: false, closed: false };
  let retry: ReturnType<typeof setTimeout> | undefined;
  const show = (): void => {
    const result = net.view?.result;
    if (!result) return;
    const names: Record<number, string> = {};
    for (const r of net.view?.rows ?? []) names[r.seat] = r.name;
    renderResult(root, result, names, data, {
      rematch: () => {
        net.rematch();
        clearTimeout(retry);
        retry = setTimeout(() => { ui.rematching = false; show(); }, REMATCH_RETRY_MS);
      },
      leave: () => { void net.leave().catch(() => undefined).finally(() => go('/')); },
    }, ui);
  };
  net.on(e => {
    if (e.kind === 'result' || (e.kind === 'view' && e.view.result && !root.querySelector('.result-screen'))) show();
    else if (e.kind === 'notice' && e.msg.kind === 'rematch') clearTimeout(retry);
    else if (e.kind === 'left' && e.code === CLOSE_CONSENTED && !net.leaving && net.view?.result) {
      clearTimeout(retry);
      ui.closed = true;
      show();
    }
  });
  show();
}
