import type { GameState } from '@dorandi/logic';
import { hudModel } from './models';
import { el, esc, setHtml } from './dom';

export function renderHud(state: GameState, paused: boolean, notice: string | null = null): void {
  const m = hudModel(state);
  const crack = m.danger >= 1 ? '무너짐' : m.danger > 0.66 ? '금 감' : m.danger > 0.33 ? '흔들림' : '멀쩡함';
  setHtml(el('top'), `
    <div class="hud">
      <span class="round">${esc(m.roundText)}</span>
      <span class="time">남은 ${m.secondsLeft}초${paused ? ' · 멈춤' : ''}</span>
      ${notice ? `<span class="notice">${esc(notice)}</span>` : ''}
      <span class="enemies">${esc(m.enemyText)}</span>
      <span class="gauge" title="장승: ${crack}"><i style="width:${Math.round(m.danger * 100)}%"></i></span>
    </div>`);
  el('alert').classList.toggle('on', state.overLimitTicks > 0);
}
