import { unitDefFast, type GameEvent, type UpgradeId } from '@dorandi/logic';
import type { GameDriver } from '../driver';
import type { LaneScene } from '../LaneScene';
import { playSfx } from '../sfx';
import { dexHtml } from './dex';
import { el, onAction, setHtml } from './dom';
import { renderHelper } from './helper';
import { renderHud } from './hud';
import { activeNotice, combineOptions, nextUnitId, rejectText, selectedSlot, type Notice } from './models';
import { renderBottom, renderRight, upgradesHtml } from './panels';
import { resultHtml } from './result';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish', Digit4: 'slots',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void }

export function mountUi(driver: GameDriver, scene: LaneScene, hooks: UiHooks = {}): { resetUi: () => void } {
  scene.selectedId = null;
  let lastSlot: number | null = null;
  let banner: Notice | null = null;
  let helperOpen = false;
  let modal: 'dex' | 'upgrades' | null = null;
  let best: { id: string; grade: number } | null = null;
  let notice: Notice | null = null;

  const act = (action: string, arg: string) => {
    switch (action) {
      case 'summon': driver.queue({ type: 'summon' }); break;
      case 'convert': driver.queue({ type: 'convertToken' }); break;
      case 'combine': {
        const [result = '', target] = arg.split('@');
        if (target === undefined) driver.queue({ type: 'combine', result });
        else {
          const slot = selectedSlot(driver.state, scene.selectedId);
          if (slot !== null) driver.queue({ type: 'combine', result, slot });
        }
        break;
      }
      case 'sell': {
        const slot = selectedSlot(driver.state, scene.selectedId);
        if (slot !== null) driver.queue({ type: 'sell', slot });
        break;
      }
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
  scene.onSelect(slot => { scene.selectedId = slot === null ? null : driver.state.slots[slot]?.id ?? null; render(); });
  driver.onEvents((events, rejected) => {
    for (const event of events) {
      if (event.type === 'combine' && event.slot === lastSlot && selectedSlot(driver.state, scene.selectedId) === null) {
        scene.selectedId = event.unitId;
      }
      if (event.type === 'roundStart') {
        const wave = driver.state.data.waves.find(w => w.round === event.round);
        const boss = wave?.type === 'boss' && driver.state.data.enemies.find(e => e.id === wave.boss);
        const reward = event.round > 1 ? `${event.round - 1}라운드 종료 · +${driver.state.data.balance.coins.roundEnd}냥` : '';
        const title = `${event.round}라운드${boss ? ' · 고개 보스: ' + boss.name : ''}`;
        banner = { text: [reward, title].filter(Boolean).join('\n'), until: performance.now() + 1800 };
      }
    }
    for (const r of rejected) {
      const fullBoard = r.command.type === 'summon' && !driver.state.slots.some((u, i) => !u && driver.state.open[i]);
      const text = rejectText(fullBoard ? 'noSlot' : r.reason);
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
    if (ev.code === 'Escape') {
      if (modal) act('closeModal', '');
      else { scene.selectedId = null; render(); }
      return;
    }
    if (driver.state.phase === 'ended') return;
    const selected = selectedSlot(driver.state, scene.selectedId);
    const upgrade = UPGRADE_KEYS[ev.code];
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (upgrade) act('upgrade', upgrade);
    else if (ev.code === 'KeyQ') act('toggleHelper', '');
    else if (ev.code === 'KeyP') { driver.paused = !driver.paused; render(); }
    else if (!modal && (ev.code === 'Tab' || ev.code === 'KeyW')) {
      ev.preventDefault();
      scene.selectedId = nextUnitId(driver.state, scene.selectedId);
      render();
    }
    else if (!modal && (ev.code === 'KeyS' || ev.code === 'Delete') && selected !== null) act('sell', String(selected));
    else if (selected !== null && (ev.code === 'KeyZ' || ev.code === 'KeyX' || ev.code === 'KeyC')) {
      const option = combineOptions(driver.state, selected).find(o => `Key${o.key}` === ev.code);
      if (option) act('combine', `${option.result}@${selected}`);
    }
  });

  function render(): void {
    const s = driver.state;
    const selected = selectedSlot(s, scene.selectedId);
    lastSlot = selected;
    if (selected === null) scene.selectedId = null;
    const now = performance.now();
    renderHud(s, driver.paused, activeNotice(notice, now));
    el('round-banner').textContent = s.phase === 'ended' ? '' : activeNotice(banner, now) ?? '';
    renderHelper(s, helperOpen);
    renderRight(s);
    renderBottom(s, selected);
    setHtml(el('modal'), s.phase === 'ended' ? resultHtml(s, best?.id ?? null) : modal === 'dex' ? dexHtml(s.data) : modal === 'upgrades' ? upgradesHtml(s) : '');
    hooks.onRender?.();
  }

  let lastRender = 0;
  scene.onFrame = () => {
    const now = performance.now();
    if (now - lastRender < RENDER_MS) return;
    lastRender = now;
    render();
  };
  render();
  function resetUi(): void {
    scene.selectedId = null;
    helperOpen = false;
    banner = null;
    modal = null;
    best = null;
    notice = null;
    render();
  }
  return { resetUi };
}

export function unitName(driver: GameDriver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
