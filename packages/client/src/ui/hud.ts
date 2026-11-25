import { countNormalEnemies, type GameState } from '@dorandi/logic';
import { hudModel, limitLevel, type LimitLevel } from './models';
import { el, esc, setHtml } from './dom';
import { SETTINGS_BUTTON } from './settings';

const RESIST_HINT = '이번 라운드 잡귀가 받는 피해를 줄이는 비율입니다. 약화는 이 비율을 깎습니다.';

export interface AlertOpts { still?: boolean }

/** `userPaused` is the P pause only; the dex pause shows no pill. */
export function renderHud(state: GameState, userPaused: boolean, alert: AlertOpts = {}): void {
  const m = hudModel(state);
  const boss = state.enemies.find(e => e.boss && e.hp > 0);
  const round = `<span class="round">${esc(m.roundText)}</span>`;
  // the 60-round resistance goes under the round label so the bar keeps its width
  const roundBlock = m.resistText
    ? `<span class="round-block">${round}<span class="resist" title="${RESIST_HINT}">${esc(m.resistText)}</span></span>`
    : round;
  const tail = m.tail ? ` <i class="tail">· ${esc(m.tail)}</i>` : '';
  setHtml(el('top'), `
    <div class="hud">
      ${roundBlock}
      <span class="time">남은 ${m.secondsLeft}초${userPaused ? ' <i class="pill">멈춤</i>' : ''}</span>
      ${boss ? `<span class="boss">보스 체력 ${boss.hp} / ${boss.maxHp}</span>` : ''}
      <span class="enemies lv-${m.level}">내 잡귀 <b class="n">${m.count}</b> / ${m.limit}${tail}</span>
      <span class="gauge lv-${m.level}" title="장승: ${m.crack}"><i style="width:${Math.round(m.danger * 100)}%"></i></span>${m.crackShown ? `<span class="gauge-text${m.danger > 0.66 ? ' bad' : ''}">장승 ${m.crack}</span>` : ''}
      ${SETTINGS_BUTTON}
    </div>`);
  renderAlert(state, alert);
}

/** What the board edge shows: nothing while calm or after the end; over only while the round clock counts it down. */
export function edgeLevel(state: GameState): Exclude<LimitLevel, 'ok'> | null {
  if (state.phase === 'ended') return null;
  const { level } = limitLevel(state.data, countNormalEnemies(state), state.round);
  if (level === 'over') return state.phase === 'round' ? 'over' : 'danger';
  return level === 'ok' ? null : level;
}

/** The red edge glow and the over-limit countdown; the online top bar leaves them to this. `still` holds the breathing. */
export function renderAlert(state: GameState, opts: AlertOpts = {}): void {
  const edge = edgeLevel(state);
  const box = el('alert');
  box.classList.toggle('warn', edge === 'warn');
  box.classList.toggle('danger', edge === 'danger');
  box.classList.toggle('on', edge === 'over');
  box.classList.toggle('still', edge === 'danger' && !!opts.still);
  if (edge !== 'over') { setHtml(box, ''); return; }
  const b = state.data.balance;
  const remaining = Math.ceil(b.limitSeconds - state.overLimitTicks * b.tickMs / 1000);
  const cut = countNormalEnemies(state) - b.limit;
  setHtml(box, `<div class="countdown">잡귀 한도 초과<strong>${remaining}초</strong><span class="cut">${cut}마리 줄이면 멈춤</span></div>`);
}
