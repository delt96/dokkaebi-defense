import { SPEEDS } from '../driver';

/** A small gear: eight teeth from a thick dashed ring around a hollow hub. */
const GEAR_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">'
  + '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2.2 1.73"/>'
  + '<circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/** The gear at the bottom right of the right panel; it opens the settings window. */
export const SETTINGS_BUTTON = `<button class="settings-open" data-action="openSettings" aria-label="설정" title="설정">${GEAR_SVG}</button>`;

/** `speed` is solo only; without it the row is left out. */
export interface SettingsOpts { helper: boolean; reducedFx: boolean; speed?: number }

function choiceHtml(action: string, arg: string, text: string, on: boolean): string {
  return `<button data-action="${action}" data-arg="${arg}" aria-pressed="${on}">${text}</button>`;
}

function rowHtml(key: string, label: string, choices: string): string {
  return `<div class="settings-row" data-setting="${key}"><span>${label}</span><div class="settings-choices">${choices}</div></div>`;
}

const onOff = (action: string, on: boolean): string => choiceHtml(action, 'on', '켬', on) + choiceHtml(action, 'off', '끔', !on);

/** The settings window (in #modal): combine helper, game speed (solo) and reduce effects. */
export function settingsHtml(opts: SettingsOpts): string {
  const speed = opts.speed === undefined ? '' : rowHtml('speed', '배속', SPEEDS.map(n => choiceHtml('speed', String(n), `${n}×`, opts.speed === n)).join(''));
  return `<div class="modal settings-pop" role="dialog" aria-label="설정"><div class="modal-head">설정 <button data-action="closeModal">닫기</button></div>
    ${rowHtml('helper', '조합 도우미', onOff('setHelper', opts.helper))}${speed}${rowHtml('fx', '효과 줄이기', onOff('setFx', opts.reducedFx))}</div>`;
}
