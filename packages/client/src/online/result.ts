import { difficultySuffix } from '../ui/difficulty';
import { unitDefFast, type EliminationCause, type GameData, type MatchResult, type NoticeMsg, type SeatOutcome, type TeamOutcome } from '@dorandi/logic';
import type { NetClient } from '../net/NetClient';
import { esc } from '../ui/dom';
import { TEXT } from './text';
import { graph, graphScale } from '../ui/result';

export interface TeamRow {
  seat: number; name: string; status: string; last: number; max: number; best: string; damage: number;
  series: (number | null)[]; helperText: string; supportText: string;
}
/**
 * `notes`: one-line meanings of the result words, on screen under the table (생존·팀 패배 only when a row says it).
 * `credit`: the team praise line (top 역신 damage, top supporter), null when nobody has either.
 */
export interface TeamResultModel { title: string; subtitle: string; rows: TeamRow[]; notes: string[]; credit: string | null }

const TITLE: Record<TeamOutcome, string> = { clear: '팀 클리어', wipe: '전멸', gate: '스토리 관문 실패' };
const CAUSE: Record<EliminationCause, string> = { limit: '잡귀 한도', boss: '고개 보스', forfeit: '포기', disconnect: '단절' };

function supportText(sent: number, received: number): string {
  const parts = [...(sent ? [`보냄 ${sent}회`] : []), ...(received ? [`받음 ${received}회`] : [])];
  return parts.length ? `넋 지원 ${parts.join(' · ')}` : '';
}

/** The seats sharing the highest positive value, as "가·나", or null when nobody is above 0. */
function leaders(result: MatchResult, names: Record<number, string>, value: (s: MatchResult['seats'][number]) => number): { who: string; top: number } | null {
  const top = Math.max(0, ...result.seats.map(value));
  // !(top > 0) rather than top <= 0: a result from an older server without the field gives NaN here
  if (!(top > 0)) return null;
  return { who: result.seats.filter(s => value(s) === top).map(s => names[s.seat] ?? `${s.seat}번`).join('·'), top };
}

function creditLine(result: MatchResult, names: Record<number, string>): string | null {
  const damage = leaders(result, names, s => s.yeoksinDamage);
  const support = leaders(result, names, s => s.supportSent);
  const parts = [
    ...(damage ? [`역신 피해 1위 ${damage.who} ${damage.top.toLocaleString('ko-KR')}`] : []),
    ...(support ? [`넋 지원 1위 ${support.who} ${support.top}회`] : []),
  ];
  return parts.length ? parts.join(' · ') : null;
}

function statusText(outcome: SeatOutcome, cause: EliminationCause | null, round: number): string {
  switch (outcome) {
    case 'finished': return '완주';
    case 'eliminated': return `${round}라운드 탈락${cause ? ` · ${CAUSE[cause]}` : ''}`;
    case 'unfinished': return '고개 보스 미완주';
    case 'aliveTeamLoss': return '생존·팀 패배';
  }
}

export function teamResultModel(result: MatchResult, names: Record<number, string>, data: GameData): TeamResultModel {
  const notes = [
    '역신 격파: 관문마다 나오는 역신을 쓰러뜨린 수',
    '잡귀 마지막 / 최대: 끝났을 때와 가장 많았을 때의 잡귀 수',
    ...(result.seats.some(s => s.outcome === 'aliveTeamLoss') ? ['생존·팀 패배: 끝까지 버텼지만 팀이 졌음'] : []),
  ];
  return {
    notes,
    credit: creditLine(result, names),
    title: TITLE[result.outcome] + difficultySuffix(data, result.difficulty),
    subtitle: `도달 ${result.round}라운드 · 역신 격파 ${result.yeoksinKills}/${data.coop?.yeoksin.length ?? 2} · 생존 ${result.alive}/${result.started}`,
    rows: result.seats.map(s => {
      const best = s.bestUnit ? `${unitDefFast(data, s.bestUnit.defId).name} (${s.bestUnit.grade}등급)` : '–';
      // one slot per round; rounds after an elimination stay empty
      const first = Math.max(0, s.round - s.series.length);
      const series: (number | null)[] = Array.from({ length: data.balance.rounds }, (_, i) => s.series[i - first] ?? null);
      return {
        seat: s.seat, name: names[s.seat] ?? `${s.seat}번`, status: statusText(s.outcome, s.cause, s.round),
        last: s.lastEnemies, max: s.maxEnemies, best, damage: s.yeoksinDamage, series, helperText: `도우미 ${s.helperOpens}회`,
        supportText: supportText(s.supportSent, s.supportReceived),
      };
    }),
  };
}

export interface ResultActions { rematch(): void; leave(): void; enterRematch?(): void }
/** `closed`: the server closed the room (result hold over), so rematch can no longer be sent. */
export interface ResultUi { opened: number | null; rematching: boolean; closed?: boolean; readySeats?: number[] }

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
    row.title = `${r.name} · ${open ? '누르면 접기' : '누르면 라운드별 그래프'}`;
    row.setAttribute('aria-expanded', String(open));
    row.className = open ? 'result-row open' : 'result-row';
    row.innerHTML = `<span class="r-name"><span class="r-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>${esc(r.name)}</span><span class="r-status">${esc(r.status)}</span>`
      + `<span class="r-count">${r.last} / ${r.max}</span><span class="r-best">${esc(r.best)}</span><span class="r-dmg">${r.damage.toLocaleString('ko-KR')}</span>`;
    row.addEventListener('click', () => { ui.opened = open ? null : r.seat; redraw(); });
    box.append(row);
    if (open) {
      const detail = div('result-detail');
      const plot = graph(r.series, data.balance.limit);
      const extra = [r.helperText, r.supportText].filter(Boolean).join(' · ');
      detail.innerHTML = `<p><b>${esc(r.name)}</b> · 라운드 끝 잡귀 · 한도 ${data.balance.limit}마리</p>${plot ? plot + graphScale(data.balance.rounds) : '<p>아직 라운드 기록이 없습니다.</p>'}<p>${esc(extra)}</p>`;
      box.append(detail);
    }
  }
  const head = div('result-head');
  head.innerHTML = '<span>이름</span><span>상태</span><span>잡귀 마지막 / 최대</span><span>최고 유닛</span><span>역신 피해</span>';
  box.insertBefore(head, box.children[2] ?? null);
  if (m.credit) box.insertBefore(div('result-credit', m.credit), head);
  box.append(div('result-notes', m.notes.join(' · ')));

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'big';
  again.textContent = ui.rematching && !ui.closed ? (actions.enterRematch ? '준비 완료' : '준비 요청 중…') : '다시 하기';
  again.disabled = ui.rematching || ui.closed === true;
  again.addEventListener('click', () => { if (ui.rematching || ui.closed) return; ui.rematching = true; actions.rematch(); redraw(); });
  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'big';
  leave.textContent = '나가기';
  leave.addEventListener('click', () => actions.leave());
  const controls = div('screen-actions');
  controls.append(again, leave);
  if (actions.enterRematch && !ui.closed) {
    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'big';
    enter.textContent = '새 대기실로 이동';
    enter.addEventListener('click', actions.enterRematch);
    controls.prepend(enter);
  }
  box.append(controls);
  if (!ui.closed && (ui.rematching || ui.readySeats?.length)) {
    const ready = m.rows.filter(row => ui.readySeats?.includes(row.seat));
    const waiting = m.rows.filter(row => !ui.readySeats?.includes(row.seat));
    const status = div('result-sub');
    status.setAttribute('role', 'status');
    const lines = [`재경기 준비 ${ready.length}/6명`];
    if (ready.length) lines.push(`준비 완료 · ${ready.map(row => row.name).join(', ')}`);
    if (waiting.length) lines.push(`응답 대기 · ${waiting.map(row => row.name).join(', ')}`);
    status.textContent = lines.join(' / ');
    box.append(status);
  }
  if (ui.closed) {
    const link = document.createElement('a');
    link.className = 'entry-link';
    link.setAttribute('href', '/');
    link.textContent = TEXT.newRoom;
    box.append(div('result-sub', TEXT.roomClosed), link);
  }
  root.replaceChildren(box);
}


/**
 * Shows the team result in `root` when it arrives (also when a rejoin snapshot already carries it).
 * `hold` puts off the first showing until it calls back (the end scene); later redraws come at once.
 */
export function mountResult(net: NetClient, root: HTMLElement, data: GameData,
  go: (href: string) => void = href => location.assign(href),
  goRematch?: (roomId: string, hostToken?: string) => void,
  hold?: (show: () => void) => void): void {
  const ui: ResultUi = { opened: null, rematching: false, closed: false };
  let held: 'no' | 'waiting' | 'done' = hold ? 'no' : 'done';
  let retry: ReturnType<typeof setTimeout> | undefined;
  let destination: Extract<NoticeMsg, { kind: 'rematch' }> | undefined;
  let moving = false;
  const enter = (): void => {
    if (!destination || moving || ui.closed) return;
    moving = true;
    goRematch?.(destination.roomId, destination.hostToken);
  };
  const updateRematch = (): void => {
    const seats = net.view?.result?.seats;
    if (destination && seats?.every(seat => ui.readySeats?.includes(seat.seat))) enter();
    show();
  };
  const show = (): void => {
    const result = net.view?.result;
    if (!result || held === 'waiting') return;
    if (held === 'no') {
      held = 'waiting';
      hold!(() => { held = 'done'; show(); });
      return;
    }
    const names: Record<number, string> = {};
    for (const r of net.view?.rows ?? []) names[r.seat] = r.name;
    renderResult(root, result, names, data, {
      rematch: () => {
        net.rematch();
        clearTimeout(retry);
        retry = setTimeout(() => { ui.rematching = false; show(); }, REMATCH_RETRY_MS);
      },
      ...(destination ? { enterRematch: enter } : {}),
      leave: () => { void net.leave().catch(() => undefined).finally(() => go('/')); },
    }, ui);
  };
  net.on(e => {
    if (e.kind === 'result' || (e.kind === 'view' && e.view.result && !root.querySelector('.result-screen'))) show();
    else if (e.kind === 'notice' && e.msg.kind === 'rematchReady') {
      ui.readySeats = e.msg.seats;
      updateRematch();
    } else if (e.kind === 'notice' && e.msg.kind === 'rematch') {
      clearTimeout(retry);
      destination = e.msg;
      ui.rematching = true;
      updateRematch();
    } else if (e.kind === 'left' && e.code === CLOSE_CONSENTED && !net.leaving && net.view?.result) {
      clearTimeout(retry);
      ui.closed = true;
      show();
    }
  });
  show();
}
