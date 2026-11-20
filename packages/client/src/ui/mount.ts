import { unitDefFast, type GameEvent, type UpgradeId } from '@dorandi/logic';
import type { GameDriver } from '../driver';
import type { LaneScene } from '../LaneScene';
import { playSfx } from '../sfx';
import { dexHtml } from './dex';
import { el, onAction, setHtml } from './dom';
import { renderHelper } from './helper';
import { renderHud } from './hud';
import { renderBottom, renderRight, upgradesHtml } from './panels';

const UPGRADE_KEYS: UpgradeId[] = ['physical', 'magical', 'polish', 'slots'];
const RENDER_MS = 100;

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void }

export function mountUi(driver: GameDriver, scene: LaneScene, hooks: UiHooks = {}): { resetUi: () => void } {
  let selected: number | null = null;
  let helperOpen = false;
  let modal: 'dex' | 'upgrades' | null = null;

  const act = (action: string, arg: string) => {
    switch (action) {
      case 'summon': driver.queue({ type: 'summon' }); break;
      case 'convert': driver.queue({ type: 'convertToken' }); break;
      case 'combine': driver.queue({ type: 'combine', result: arg }); break;
      case 'sell': driver.queue({ type: 'sell', slot: Number(arg) }); selected = null; break;
      case 'upgrade': driver.queue({ type: 'upgrade', id: arg as UpgradeId }); break;
      case 'toggleHelper':
        helperOpen = !helperOpen;
        if (helperOpen) driver.queue({ type: 'helperOpened' });
        break;
      case 'openDex': modal = 'dex'; break;
      case 'openUpgrades': modal = 'upgrades'; break;
      case 'closeModal': modal = null; break;
    }
    render();
  };

  for (const id of ['left', 'right', 'bottom', 'modal']) onAction(el(id), act);
  scene.onSelect(slot => { selected = slot !== null && driver.state.slots[slot] ? slot : null; render(); });
  scene.onEvents(events => {
    for (const e of events) {
      if (e.type === 'summon') playSfx(e.grade >= 3 ? 'summon3' : e.grade === 2 ? 'summon2' : 'summon1');
      if (e.type === 'combine') playSfx('combine');
      if (e.type === 'kill') playSfx('kill');
      if (e.type === 'ended') playSfx(e.result.outcome === 'clear' ? 'clear' : 'defeat');
    }
    hooks.onEvents?.(events);
  });

  window.addEventListener('keydown', ev => {
    if (ev.repeat) return;
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (ev.key >= '1' && ev.key <= '4') act('upgrade', UPGRADE_KEYS[Number(ev.key) - 1]!);
    else if (ev.key === 'q' || ev.key === 'Q') act('toggleHelper', '');
    else if (ev.key === 'p' || ev.key === 'P') { driver.paused = !driver.paused; render(); }
    else if (ev.key === 'Escape') act('closeModal', '');
  });

  function render(): void {
    const s = driver.state;
    if (selected !== null && !s.slots[selected]) selected = null;
    renderHud(s, driver.paused);
    renderHelper(s, helperOpen);
    renderRight(s);
    renderBottom(s, selected);
    setHtml(el('modal'), modal === 'dex' ? dexHtml(s.data) : modal === 'upgrades' ? upgradesHtml(s) : '');
    hooks.onRender?.();
  }

  setInterval(render, RENDER_MS);
  render();
  return { resetUi: () => { selected = null; modal = null; render(); } };
}

export function unitName(driver: GameDriver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
