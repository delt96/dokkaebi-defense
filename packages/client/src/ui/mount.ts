import { unitDefFast, type ClientView, type EconItem, type EconMine, type EconNote, type GameData, type GameEvent, type UpgradeId } from '@dorandi/logic';
import type { Driver } from '../driver';
import { isTypingTarget } from '../online/entry';
import { rightNotices } from '../online/models';
import { renderRows, renderTop } from '../online/panels';
import { menuHtml, spiritCardHtml, spiritModel } from '../online/spirit';
import type { LaneScene } from '../LaneScene';
import { playSfx } from '../sfx';
import { dexHtml } from './dex';
import {
  econBottomHtml, econPanelHtml, econTopHtml, incomingModel, josa, marketModel, noteText, questChips, shipModel, storyModel, tameModel,
  tameRejectText, type EconTab,
} from './econ';
import { el, onAction, setHtml } from './dom';
import { helperPopHtml, renderHelper } from './helper';
import { renderAlert, renderHud } from './hud';
import { activeNotice, nextUnitId, rejectText, selectedSlot, type Notice } from './models';
import { renderBottom, renderRight, unitDetailsHtml, upgradesHtml } from './panels';
import { resultHtml } from './result';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish', Digit4: 'slots',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;
/** Economy results (a purchase, a reward, a tame) stay a little longer than a refusal. */
const NOTE_MS = 2500;
const NOTE_TYPES: ReadonlySet<string> = new Set(['buy', 'questReward', 'storyOffer', 'storyEnd', 'tame']);

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void }

/** Board and resource commands; blocked while the driver is read-only (spirit, or another lane on screen). */
const GAME_ACTIONS: ReadonlySet<string> = new Set([
  'summon', 'convert', 'combine', 'sell', 'upgrade', 'buy', 'missionEnter', 'tame', 'storyTarget', 'storyDecline', 'ship', 'shipCancel', 'receive', 'refuse',
]);
const PRESS_MS = 120;

/** Online screens also read the server view for the scoreboard and the two-line top bar. */
export type TransferCommand = { type: 'transferOffer'; target: number; slot: number; unitId: number } | { type: 'transferAccept'; slot: number } | { type: 'transferDecline' };
export interface OnlineActions { support(): void; watch(seat: number): void; forfeit(): void; transfer?(cmd: TransferCommand): void }
export interface MountOpts { online?: boolean; view?: () => ClientView | null; data?: GameData; actions?: OnlineActions }

export function mountUi(driver: Driver, scene: LaneScene, hooks: UiHooks = {}, opts: MountOpts = {}): { resetUi: () => void } {
  const online = opts.online === true;
  scene.selectedId = null;
  let displayedCard: ReturnType<typeof renderBottom> | null = null;
  let banner: Notice | null = null;
  let helperOpen = false;
  let modal: 'unitDetails' | 'dex' | 'upgrades' | 'menu' | 'forfeit' | null = null;
  let best: { id: string; grade: number } | null = null;
  let notice: Notice | null = null;
  // stage 3 economy: the B panel (null = closed), the story request already shown/accepted, the slot a delivery lands in
  let econTab: EconTab | null = null;
  let storySeen = '';
  let storyAcked = '';
  let receiveSlot: number | null = null;
  let incomingShown = false;
  let lastOffer: { from: number; to: number; defId: string; slot: number; unitId: number; deadlineTick: number } | null = null;
  let offerChoice: 'refuse' | 'cancel' | null = null;
  // ids of my delivered units while the offer was open; a new one when it ends means it landed here
  let deliveredBefore: number[] = [];
  const econ = (): EconMine | null => driver.econ?.() ?? null;
  const say = (text: string, ms = NOTICE_MS) => { notice = { text, until: performance.now() + ms }; };
  for (const id of ['econ-panel', 'econ-top', 'econ-bottom']) {
    if (document.getElementById(id)) continue;
    const node = document.createElement('div');
    node.id = id;
    el('stage').append(node);
  }

  const act = (action: string, arg: string) => {
    if (driver.failed && action !== 'restart') return;
    if (driver.readOnly && GAME_ACTIONS.has(action)) return;
    const previousModal = modal;
    switch (action) {
      case 'summon':
        // online the press shows at once; the driver does not send it when no summon is left
        driver.queue({ type: 'summon' });
        if (online) pressSummon();
        break;
      case 'convert': driver.queue({ type: 'convertToken' }); break;
      case 'combine': {
        if (modal === 'unitDetails') modal = null;
        const [result = '', target] = arg.split('@');
        if (target === undefined) driver.queue({ type: 'combine', result });
        else {
          const slot = selectedSlot(driver.state, Number(target));
          if (slot !== null) driver.queue({ type: 'combine', result, slot });
        }
        break;
      }
      case 'sell': {
        const slot = selectedSlot(driver.state, Number(arg));
        if (slot !== null) driver.queue({ type: 'sell', slot });
        break;
      }
      case 'upgrade': driver.queue({ type: 'upgrade', id: arg as UpgradeId }); break;
      case 'toggleMarket':
        econTab = econTab ? null : 'market';
        if (econTab) helperOpen = false;
        break;
      case 'econTab': econTab = arg === 'story' ? 'story' : 'market'; helperOpen = false; break;
      case 'buy': driver.queue({ type: 'buy', item: arg as EconItem }); break;
      case 'missionEnter': driver.queue({ type: 'missionEnter' }); break;
      case 'tame': {
        const e = econ();
        const t = e ? tameModel(e, driver.state) : null;
        if (!t) break;
        // the hotkey on a chance that is not ready says what is missing instead of sending a doomed command
        if (!t.ready) { say(t.why ?? t.parts.find(p => !p.ok)?.text ?? '아직 길들일 수 없습니다'); break; }
        driver.queue({ type: 'tame', enemyId: t.enemyId });
        break;
      }
      case 'storyTarget': driver.queue({ type: 'storyTarget', id: arg || null }); break;
      case 'storyDecline': driver.queue({ type: 'storyDecline' }); econTab = null; break;
      case 'storyAccept': storyAcked = storySeen; econTab = null; break;
      case 'ship': {
        const e = econ();
        const m = e ? shipModel(e, driver.state, opts.view?.() ?? null, selectedSlot(driver.state, scene.selectedId)) : null;
        if (m?.unit) opts.actions?.transfer?.({ type: 'transferOffer', target: Number(arg), slot: m.unit.slot, unitId: m.unit.unitId });
        break;
      }
      case 'shipCancel': offerChoice = 'cancel'; opts.actions?.transfer?.({ type: 'transferDecline' }); break;
      case 'refuse': offerChoice = 'refuse'; opts.actions?.transfer?.({ type: 'transferDecline' }); break;
      case 'receive': opts.actions?.transfer?.({ type: 'transferAccept', slot: Number(arg) }); break;
      case 'toggleHelper':
        if (modal === 'menu' && helperOpen) { modal = null; break; }
        helperOpen = !helperOpen;
        if (helperOpen) econTab = null;
        if (modal === 'menu') modal = null;
        if (helperOpen && !driver.readOnly) driver.queue({ type: 'helperOpened' });
        break;
      case 'support': opts.actions?.support(); break;
      case 'watch': opts.actions?.watch(Number(arg)); break;
      case 'openMenu': modal = 'menu'; break;
      case 'askForfeit': modal = 'forfeit'; break;
      case 'forfeit': opts.actions?.forfeit(); modal = null; break;
      case 'unitDetails': modal = 'unitDetails'; break;
      case 'openDex': modal = 'dex'; break;
      case 'openUpgrades': modal = 'upgrades'; break;
      case 'closeModal': modal = null; break;
      case 'toggleFx': scene.setReduceEffects(!scene.reduceEffects); break;
      case 'restart': hooks.onRestart?.(); break;
    }
    render();
    if (modal && modal !== previousModal) el('modal').querySelector<HTMLButtonElement>('button')?.focus();
  };

  for (const id of ['top', 'left', 'right', 'bottom', 'modal', 'error', 'econ-panel', 'econ-top', 'econ-bottom']) onAction(el(id), act);
  scene.onSelect(slot => {
    if (modal || driver.failed || driver.state.phase === 'ended') return;
    // while a delivery waits, a press on an empty cell picks where it lands
    if (incomingShown && slot !== null && !driver.state.slots[slot] && driver.state.open[slot]) receiveSlot = slot;
    scene.selectedId = slot === null ? null : driver.state.slots[slot]?.id ?? null;
    render();
  });
  driver.onRemap?.(ids => {
    const next = scene.selectedId === null ? undefined : ids.get(scene.selectedId);
    if (next !== undefined) scene.selectedId = next;
  });
  driver.onEvents((events, rejected) => {
    const priorSelection = scene.selectedId;
    for (const event of events) {
      if (event.type === 'combine' && event.replacedUnitId === scene.selectedId) {
        scene.selectedId = event.unitId;
      }
      if (event.type === 'roundStart') {
        const wave = driver.state.data.waves.find(w => w.round === event.round);
        const boss = wave?.type === 'boss' && driver.state.data.enemies.find(e => e.id === wave.boss);
        const reward = event.round > 1 && !driver.readOnly ? `${event.round - 1}라운드 종료 · +${driver.state.data.balance.coins.roundEnd}냥` : '';
        const title = `${event.round}라운드${boss ? ' · 고개 보스: ' + boss.name : ''}`;
        banner = { text: [reward, title].filter(Boolean).join('\n'), until: performance.now() + 1800 };
      }
    }
    for (const event of events) {
      if (!NOTE_TYPES.has(event.type) || driver.readOnly) continue;
      const text = noteText(event as EconNote, driver.state.data);
      if (text) say(text, NOTE_MS);
    }
    for (const r of rejected) {
      // a refused 받기/거절 decided nothing; the end of the offer is told by what the server did
      // (delivery commands come back from the server only, so they are outside the lane's Command type)
      const kind: string = r.command.type;
      if (kind === 'transferAccept' || kind === 'transferDecline') offerChoice = null;
      if (kind === 'transferAccept' && r.reason === 'noSlot' && freeSlot()) {
        notice = { text: '그 칸이 막 찼습니다 · 다시 받아 주세요', until: performance.now() + NOTICE_MS };
        continue;
      }
      const fullBoard = r.command.type === 'summon' && !freeSlot();
      const tame = r.command.type === 'tame' ? tameRejectText(econ(), r.command.enemyId, r.reason, driver.state.data) : null;
      const text = tame ?? rejectText(fullBoard ? 'noSlot' : r.reason);
      if (text) notice = { text, until: performance.now() + NOTICE_MS };
    }
    if (scene.selectedId !== priorSelection) render();
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
    if (isTypingTarget(ev)) return;
    if (driver.failed || ev.defaultPrevented || ev.isComposing || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const target = ev.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return;
    if (ev.code === 'Escape') {
      if (modal) act('closeModal', '');
      else { scene.selectedId = null; render(); }
      return;
    }
    if (modal || driver.state.phase === 'ended') return;
    if ((ev.code === 'Space' || ev.code === 'Tab') && target?.closest?.('button')) return;
    const card = displayedCard;
    const upgrade = UPGRADE_KEYS[ev.code];
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (upgrade) act('upgrade', upgrade);
    else if (ev.code === 'KeyQ') act('toggleHelper', '');
    else if (ev.code === 'KeyB' && driver.state.data.economy?.market) act('toggleMarket', '');
    else if (ev.code === 'KeyT' && driver.state.data.economy?.tame) act('tame', '');
    else if (ev.code === 'KeyP' && !online) { driver.paused = !driver.paused; render(); }
    else if (ev.code === 'Tab' || ev.code === 'KeyW') {
      ev.preventDefault();
      scene.selectedId = nextUnitId(driver.state, scene.selectedId);
      render();
    }
    else if ((ev.code === 'KeyS' || ev.code === 'Delete') && card?.unitId != null) act('sell', String(card.unitId));
    else if (card?.unitId != null && (ev.code === 'KeyZ' || ev.code === 'KeyX' || ev.code === 'KeyC')) {
      const option = card.recipes.find(o => `Key${o.key}` === ev.code);
      if (option) act('combine', `${option.result}@${card.unitId}`);
    }
  });

  function render(): void {
    const s = driver.state;
    const selected = selectedSlot(s, scene.selectedId);
    if (selected === null) scene.selectedId = null;
    const now = performance.now();
    const view = online && opts.data ? opts.view?.() ?? null : null;
    if (view && opts.data) {
      renderTop(view, opts.data);
      renderRows(view, opts.data, helperOpen ? helperPopHtml(s) : '');
      renderAlert(s);
    } else {
      renderHud(s, driver.paused, activeNotice(notice, now));
      renderHelper(s, helperOpen, scene.reduceEffects);
    }
    el('round-banner').textContent = s.phase === 'ended' ? '' : activeNotice(banner, now) ?? (view ? activeNotice(notice, now) ?? '' : '');
    if (view && driver.readOnly) {
      setHtml(el('right'), '<b class="watch-heading">고개 관전</b><p class="watch-hint">왼쪽에서 살아 있는 고개를 고르세요. 아래 카드로 엽전을 보낼 수 있습니다.</p>');
    } else renderRight(s, { ...(view ? { online: true, notices: rightNotices(now) } : {}), ...(s.data.economy?.market ? { market: econTab !== null } : {}) });
    if (now < pressedUntil) el('right').querySelector('[data-action="summon"]')?.classList.add('pressed');
    const spiritCard = view && opts.data ? spiritCardHtml(view, opts.data) : null;
    if (spiritCard) {
      displayedCard = { unitId: null, recipes: [] };
      setHtml(el('bottom'), spiritCard);
    } else displayedCard = renderBottom(s, selected, online, s.data.economy?.market ? 'B 장터' : undefined);
    renderEcon(view, selected);
    if (modal === 'unitDetails' && (selected === null || spiritCard)) modal = null;
    // online the team result screen (Task 19) replaces the 1-player result window
    const soloResult = !online && s.phase === 'ended';
    const dialogOpen = modal !== null || soloResult;
    for (const id of ['top', 'left', 'right', 'bottom', 'lane', 'econ-panel', 'econ-top', 'econ-bottom']) el(id).inert = dialogOpen;
    setHtml(el('modal'), soloResult ? resultHtml(s, best?.id ?? null) : modal === 'menu' || modal === 'forfeit' ? menuHtml(modal, !!view && spiritModel(view) !== null, scene.reduceEffects) : modal === 'unitDetails' && selected !== null ? unitDetailsHtml(s, selected) : modal === 'dex' ? dexHtml(s.data, dexStory()) : modal === 'upgrades' ? upgradesHtml(s) : '');
    hooks.onRender?.();
  }

  function freeSlot(): boolean {
    return driver.state.slots.some((u, i) => !u && driver.state.open[i]);
  }

  /** The dex's 목표 buttons: only on data with a story request, and only for the own living lane. */
  function dexStory(): { target: string | null; canSet: boolean } | undefined {
    const story = econ()?.story;
    return story ? { target: story.target, canSet: !driver.readOnly } : undefined;
  }

  /** What became of the delivery that just left the screen, for the notice line. */
  function offerEndText(offer: NonNullable<typeof lastOffer>, me: number | undefined, delivered: readonly number[]): string {
    const unit = unitName(driver, offer.defId);
    const late = driver.state.tick >= offer.deadlineTick - 1;
    if (me === offer.from) {
      if (driver.state.slots[offer.slot]?.id !== offer.unitId) return `${unit} 배달을 마쳤습니다`;
      if (offerChoice === 'cancel') return '보내기를 취소했습니다';
      return late ? '시간이 지나 배달이 끝났습니다' : '상대가 받지 않았습니다';
    }
    if (delivered.some(id => !deliveredBefore.includes(id))) return `${unit}${josa(unit, '을', '를')} 받았습니다`;
    if (offerChoice === 'refuse') return '배달을 사양했습니다';
    return late ? '시간이 지나 배달이 끝났습니다' : '보내는 쪽이 취소했습니다';
  }

  /** Stage 3 economy: the B panel over the left column, prompts over the top of the lane, the tracker under it. */
  function renderEcon(view: ClientView | null, selected: number | null): void {
    const s = driver.state;
    const e = s.phase === 'ended' ? null : econ();
    const story = e?.story?.active ?? null;
    if (story) {
      const key = `${story.target}@${story.round}`;
      // a new request opens its page once; the page sits over the left column, never over the lane
      if (key !== storySeen) { storySeen = key; econTab = 'story'; helperOpen = false; }
    }
    const offer = e?.transfer?.offer ?? null;
    if (lastOffer && !offer) {
      say(offerEndText(lastOffer, view?.me.seat, e?.transfer?.delivered ?? []));
      offerChoice = null;
      receiveSlot = null;
    }
    if (offer && (!lastOffer || offer.unitId !== lastOffer.unitId || offer.from !== lastOffer.from)) { offerChoice = null; receiveSlot = null; }
    if (offer) deliveredBefore = e?.transfer?.delivered ?? [];
    lastOffer = offer;
    const incoming = e ? incomingModel(e, s, view, receiveSlot) : null;
    incomingShown = incoming !== null;
    const outgoing = e && offer && view && offer.from === view.me.seat
      ? `${unitName(driver, offer.defId)} → ${offer.to} ${view.rows.find(r => r.seat === offer.to)?.name ?? ''} · 기다리는 중 ${Math.max(0, Math.ceil((offer.deadlineTick - s.tick) * s.data.balance.tickMs / 1000))}초`
      : null;
    const top = e ? econTopHtml(incoming, outgoing, tameModel(e, s)) : '';
    setHtml(el('econ-top'), top);
    el('round-banner').classList.toggle('low', top !== '');
    setHtml(el('econ-bottom'), e ? econBottomHtml(questChips(e, s, view)) : '');
    if (!e || !econTab) { setHtml(el('econ-panel'), ''); return; }
    setHtml(el('econ-panel'), econPanelHtml(econTab, marketModel(e, s), shipModel(e, s, view, selected), storyModel(e, s), { storyAcked: storyAcked === storySeen }));
  }

  let pressedUntil = 0;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  function pressSummon(): void {
    pressedUntil = performance.now() + PRESS_MS;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => el('right').querySelector('[data-action="summon"]')?.classList.remove('pressed'), PRESS_MS);
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
    econTab = null;
    storySeen = storyAcked = '';
    receiveSlot = null;
    lastOffer = null;
    offerChoice = null;
    deliveredBefore = [];
    render();
  }
  return { resetUi };
}

export function unitName(driver: Driver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
