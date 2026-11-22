import type { GameState } from '@dorandi/logic';
import { hudModel } from './models';
import { el, esc, setHtml } from './dom';
import { SETTINGS_BUTTON } from './settings';

export function renderHud(state: GameState, paused: boolean, notice: string | null = null): void {
  const m = hudModel(state);
  const boss = state.enemies.find(e => e.boss && e.hp > 0);
  const crack = m.danger >= 1 ? '무너짐' : m.danger > 0.66 ? '금 감' : m.danger > 0.33 ? '흔들림' : '멀쩡함';
  setHtml(el('top'), `
    <div class="hud">
      <span class="round">${esc(m.roundText)}</span>
      <span class="time">남은 ${m.secondsLeft}초${paused ? ' · 멈춤' : ''}</span>
      ${boss ? `<span class="boss">보스 체력 ${boss.hp} / ${boss.maxHp}</span>` : ''}
      ${notice ? `<span class="notice">${esc(notice)}</span>` : ''}
      <span class="enemies">${esc(m.enemyText)}</span>
      ${m.resistText ? `<span class="resist" title="이번 라운드 잡귀가 받는 피해를 줄이는 비율입니다. 약화는 이 비율을 깎습니다.">${esc(m.resistText)}</span>` : ''}
      <span class="gauge" title="장승: ${crack}"><i style="width:${Math.round(m.danger * 100)}%"></i></span>
      ${SETTINGS_BUTTON}
    </div>`);
  renderAlert(state);
}

/** The red edge glow and the over-limit countdown; the online top bar leaves them to this. */
export function renderAlert(state: GameState): void {
  const danger = state.phase === 'round' && state.overLimitTicks > 0;
  el('alert').classList.toggle('on', danger);
  const remaining = Math.ceil(state.data.balance.limitSeconds - state.overLimitTicks * state.data.balance.tickMs / 1000);
  setHtml(el('alert'), danger ? `<div class="countdown">잡귀 한도 초과<strong>${remaining}초</strong></div>` : '');
}
