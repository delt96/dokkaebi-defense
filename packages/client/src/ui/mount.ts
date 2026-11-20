import { unitDefFast, type GameEvent, type UpgradeId } from '@dorandi/logic';
import type { GameDriver } from '../driver';
import type { LaneScene } from '../LaneScene';
import { playSfx } from '../sfx';
import { dexHtml } from './dex';
import { el, onAction, setHtml } from './dom';
import { renderHelper } from './helper';
import { renderHud } from './hud';
import { combineOptions, rejectText } from './models';
import { renderBottom, renderRight, upgradesHtml } from './panels';
import { resultHtml } from './result';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish', Digit4: 'slots',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void }

export function mountUi(driver: GameDriver, scene: LaneScene, hooks: UiHooks = {}): { resetUi: () => void } {
  let selected: number | null = null;
  let helperOpen = false;
  let modal: 'dex' | 'upgrades' | null = null;
  let best: { id: string; grade: number } | null = null;
  let notice: { text: string; until: number } | null = null;

  const act = (action: string, arg: string) => {
    switch (action) {
      case 'summon': driver.queue({ type: 'summon' }); break;
      case 'convert': driver.queue({ type: 'convertToken' }); break;
      case 'combine': {
        const [result = '', slot] = arg.split('@');
        driver.queue(slot === undefined ? { type: 'combine', result } : { type: 'combine', result, slot: Number(slot) });
        break;
      }
      case 'sell': driver.queue({ type: 'sell', slot: Number(arg) }); selected = null; break;
      case 'upgrade': driver.queue({ type: 'upgrade', id: arg as UpgradeId }); break;
      case 'toggleHelper':
        helperOpen = !helperOpen;
        if (helperOpen) driver.queue({ type: 'helperOpened' });
        break;
      case 'openDex': modal = 'dex'; break;
      case 'openUpgrades': modal = 'upgrades'; break;
      case 'closeModal': modal = null; break;
      case 'restart': hooks.onRestart?.(); break;
    }
    render();
  };

  for (const id of ['left', 'right', 'bottom', 'modal']) onAction(el(id), act);
  scene.onSelect(slot => { selected = slot !== null && driver.state.slots[slot] ? slot : null; render(); });
  driver.onEvents((_events, rejected) => {
    for (const r of rejected) {
      const text = rejectText(r.reason);
      if (text) notice = { text, until: performance.now() + NOTICE_MS };
    }
  });
  scene.onEvents(events => {
    for (const e of events) {
      if ((e.type === 'summon' || e.type === 'combine')) {
        const grade = unitDefFast(driver.state.data, e.defId).grade;
        if (!best || grade > best.grade) best = { id: e.defId, grade };
      }
      if (e.type === 'summon') playSfx(e.grade >= 3 ? 'summon3' : e.grade === 2 ? 'summon2' : 'summon1');
      if (e.type === 'combine') playSfx('combine');
      if (e.type === 'kill') playSfx('kill');
      if (e.type === 'ended') playSfx(e.result.outcome === 'clear' ? 'clear' : 'defeat');
    }
    hooks.onEvents?.(events);
  });

  window.addEventListener('keydown', ev => {
    if (ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const upgrade = UPGRADE_KEYS[ev.code];
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (upgrade) act('upgrade', upgrade);
    else if (ev.code === 'KeyQ') act('toggleHelper', '');
    else if (ev.code === 'KeyP') { driver.paused = !driver.paused; render(); }
    else if (ev.code === 'Escape') act('closeModal', '');
    else if (selected !== null && (ev.code === 'KeyZ' || ev.code === 'KeyX' || ev.code === 'KeyC')) {
      const option = combineOptions(driver.state, selected).find(o => `Key${o.key}` === ev.code);
      if (option) act('combine', `${option.result}@${selected}`);
    }
  });

  function render(): void {
    const s = driver.state;
    if (selected !== null && !s.slots[selected]) selected = null;
    if (notice && performance.now() > notice.until) notice = null;
    renderHud(s, driver.paused, notice?.text ?? null);
    renderHelper(s, helperOpen);
    renderRight(s);
    renderBottom(s, selected);
    setHtml(el('modal'), s.phase === 'ended' ? resultHtml(s, best?.id ?? null) : modal === 'dex' ? dexHtml(s.data) : modal === 'upgrades' ? upgradesHtml(s) : '');
    hooks.onRender?.();
  }

  setInterval(render, RENDER_MS);
  render();
  return { resetUi: () => { selected = null; modal = null; best = null; notice = null; render(); } };
}

export function unitName(driver: GameDriver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
