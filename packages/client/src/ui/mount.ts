import {
  laneOf, unitDefFast, type ClientView, type EconItem, type EconMine, type EconNote, type GameData, type GameEvent, type QuestId, type UpgradeId,
} from '@dorandi/logic';
import { SPEEDS, type Driver } from '../driver';
import { isTypingTarget } from '../online/entry';
import { rightNotices } from '../online/models';
import { renderRows, renderTop } from '../online/panels';
import { menuHtml, spiritCardHtml, spiritModel } from '../online/spirit';
import type { LaneScene } from '../LaneScene';
import { playSfx } from '../sfx';
import { dexHtml } from './dex';
import { addRecent, loadRecent, loadView, removeRecent, saveRecent, saveView } from './dex-memory';
import {
  econBottomHtml, econPanelHtml, tameButtonHtml, marketModel, noteText, questChips, tameModel,
  tameRejectText, type TameModel, jigeListHtml, questBoxHtml, questBoxModel, questListHtml, questRows, huntRows, jigeRowsHtml, type DrawReceipt, type JigeList,
} from './econ';
import { el, onAction, setHtml } from './dom';
import { helperPopHtml, renderHelper } from './helper';
import { renderAlert, renderHud } from './hud';
import {
  activeNotice, boardUnits, dexBack, dexFold, dexGo, dexNavStart, dexToggle, roleList, MINE_KEYS, nextUnitId, rejectText, selectedSlot, type DexNav, type Notice,
} from './models';
import { renderBottom, renderRight, unitDetailsHtml, unitPanelHtml, upgradesHtml } from './panels';
import { resultHtml } from './result';
import { readHelpLine, settingsHtml, writeHelpLine } from './settings';
import { STORE_ALL_KEY, storageHtml, wireStorage } from './storage';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish', Digit4: 'slots',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;
/** Economy results (a purchase, a reward, a tame) stay a little longer than a refusal. */
const NOTE_MS = 2500;
const NOTE_TYPES: ReadonlySet<string> = new Set(['buy', 'jigeSwap', 'questReward', 'tame', 'tameTry', 'hunt']);

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void; onHome?: () => void }

/** Settings window presses; the pressed choice keeps the focus after the redraw. */
const SETTING_ACTIONS: ReadonlySet<string> = new Set(['setHelper', 'speed', 'setFx', 'setHelp']);

/** Board and resource commands; blocked while the driver is read-only (spirit, or another lane on screen). */
const GAME_ACTIONS: ReadonlySet<string> = new Set([
  'summon', 'convert', 'combine', 'sell', 'upgrade', 'buy', 'hunt', 'tame', 'jigeOpen', 'jigeSwap',
  'storeAll', 'retrieve', 'sellStored',
]);
const PRESS_MS = 120;

/** Online screens also read the server view for the scoreboard and the two-line top bar. */
export interface OnlineActions { support(): void; watch(seat: number): void; forfeit(): void }
export interface MountOpts { online?: boolean; view?: () => ClientView | null; data?: GameData; actions?: OnlineActions }

export function mountUi(driver: Driver, scene: LaneScene, hooks: UiHooks = {}, opts: MountOpts = {}): { resetUi: () => void } {
  const online = opts.online === true;
  scene.selectedId = null;
  let displayedCard: ReturnType<typeof renderBottom> | null = null;
  let banner: Notice | null = null;
  // the dex keeps its filters, search and recent searches across openings (and, in localStorage, across visits)
  let dex: DexNav = { ...dexNavStart(), ...loadView() };
  let dexRecent = loadRecent();
  const dexRemember = () => saveView({ filter: dex.filter, kind: dex.kind, role: dex.role, query: dex.query, adv: dex.adv, skill: dex.skill, mine: dex.mine });
  const dexSearched = (term: string) => { dexRecent = addRecent(dexRecent, term); saveRecent(dexRecent); };
  // the list the dex scroll position belongs to: a new filter or search starts at the top
  let dexListKey = '';
  let helperOpen = false;
  // the hotkey line under the board (도움말 in the settings window)
  let helpLine = readHelpLine();
  let modal: 'unitDetails' | 'dex' | 'upgrades' | 'menu' | 'forfeit' | 'jige' | 'quests' | 'settings' | null = null;
  // the J list row to bring into view (a chip or a box line opened it)
  let questFocus: QuestId | 'hunts' | null = null;
  let shownModal: string | null = null;
  // the open R list (modal 'jige'); see jigeStale for when a pick is dropped
  let jigeList: JigeList | null = null;
  let best: { id: string; grade: number } | null = null;
  let notice: Notice | null = null;
  // stage 3 economy: the B panel (null = closed)
  let econTab: 'market' | null = null;
  // the last draw the server confirmed for this seat, shown in B until the next one
  let lastDraw: DrawReceipt | null = null;
  const econ = (): EconMine | null => driver.econ?.() ?? null;
  const say = (text: string, ms = NOTICE_MS) => { notice = { text, until: performance.now() + ms }; };
  for (const id of ['econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor']) {
    if (document.getElementById(id)) continue;
    const node = document.createElement('div');
    node.id = id;
    el('stage').append(node);
  }

  const act = (action: string, arg: string) => {
    if (driver.failed && action !== 'restart' && action !== 'home') return;
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
      case 'storeAll': driver.queue({ type: 'storeAll' }); break;
      case 'retrieve': {
        const [defId = '', slot] = arg.split('@');
        driver.queue(slot === undefined ? { type: 'retrieve', defId } : { type: 'retrieve', defId, slot: Number(slot) });
        break;
      }
      case 'sellStored': driver.queue({ type: 'sellStored', defId: arg }); break;
      case 'toggleMarket':
        econTab = econTab ? null : 'market';
        if (econTab) helperOpen = false;
        break;
      case 'econTab': econTab = 'market'; helperOpen = false; break;
      case 'econClose': econTab = null; break;
      case 'buy': driver.queue({ type: 'buy', item: arg as EconItem }); break;
      case 'hunt': if (arg) driver.queue({ type: 'hunt', enemy: arg }); break;
      case 'tame': {
        const e = econ();
        const t = e ? tameModel(e, driver.state) : null;
        if (!t) break;
        // the hotkey on a chance that is not ready says what is missing instead of sending a doomed command
        if (!t.ready) { say(t.label); break; }
        driver.queue({ type: 'tame', enemyId: t.enemyId });
        break;
      }
      // Q and the online helper title flip it; the settings row sets it. Neither closes a window.
      case 'toggleHelper': setHelper(!helperOpen); break;
      case 'setHelper': setHelper(arg === 'on'); break;
      case 'openSettings': modal = 'settings'; break;
      case 'support': opts.actions?.support(); break;
      case 'watch': opts.actions?.watch(Number(arg)); break;
      case 'openMenu': modal = 'menu'; break;
      case 'askForfeit': modal = 'forfeit'; break;
      case 'forfeit': opts.actions?.forfeit(); modal = null; break;
      case 'unitDetails': modal = 'unitDetails'; break;
      case 'openDex': dex = { ...dex, back: [], focus: null, open: [], unfold: [] }; modal = 'dex'; break;
      case 'dexFilter':
        dex = { ...dex, filter: arg, ...typedNow() };
        break;
      case 'dexKind': dex = { ...dex, kind: arg, ...typedNow() }; break;
      case 'dexRole': {
        // closed: one role at a time; 상세검색 open: any number, a unit needs all of them
        const now = roleList(dex.role);
        const next = arg === 'all' ? [] : dex.adv ? (now.includes(arg) ? now.filter(r => r !== arg) : [...now, arg]) : now.length === 1 && now[0] === arg ? [] : [arg];
        dex = { ...dex, role: next.length ? next.join(',') : 'all', ...typedNow() };
        break;
      }
      case 'dexAdv': dex = { ...dex, adv: !dex.adv, ...typedNow() }; break;
      case 'dexMine': {
        // several chips add up (AND); 조합 가능 and 재료 1개 부족 cannot both hold, so one replaces the other
        const on = dex.mine.includes(arg);
        const rest = dex.mine.filter(k => k !== arg && !((arg === 'ready' && k === 'one') || (arg === 'one' && k === 'ready')));
        dex = { ...dex, mine: on ? rest : MINE_KEYS.filter(k => k === arg || rest.includes(k)), ...typedNow() };
        break;
      }
      case 'dexReset': dex = { ...dex, filter: 'all', kind: 'all', role: 'all', query: '', skill: '', mine: [] }; break;
      case 'dexRecent': dex = { ...dex, query: arg }; dexSearched(arg); break;
      case 'dexRecentDel': dexRecent = removeRecent(dexRecent, arg); saveRecent(dexRecent); break;
      case 'dexGo': {
        const [target = '', from = ''] = arg.split('@');
        dex = dexGo(driver.state.data, dex, target, from, driver.state);
        break;
      }
      case 'dexBack': dex = dexBack(dex); break;
      case 'dexTree': dex = dexToggle(dex, arg); break;
      case 'dexFold': dex = dexFold(dex, arg); break;
      case 'openUpgrades': modal = 'upgrades'; break;
      case 'openQuests':
        if (!econ()) break;
        questFocus = (arg || null) as QuestId | 'hunts' | null;
        modal = 'quests';
        break;
      case 'jigeOpen': {
        const e = econ();
        const [zone, ref = ''] = arg.split(':');
        const s = driver.state;
        const index = zone === 'board' ? selectedSlot(s, Number(ref)) ?? -1 : (s.storage ?? []).findIndex(u => u.defId === ref);
        const unit = (zone === 'board' ? s.slots : s.storage ?? [])[index];
        if (!e || !unit || (zone !== 'board' && zone !== 'storage')) break;
        if (e.jige < 1) { say(rejectText('noJige') ?? ''); break; }
        jigeList = {
          source: { zone, index, unitId: unit.id }, defId: unit.defId, cost: unit.cost ?? null,
          seat: driver.laneSeat, epoch: driver.laneEpoch, name: '', type: null,
        };
        modal = 'jige';
        break;
      }
      case 'jigeType':
        if (jigeList) jigeList = { ...jigeList, type: arg === 'physical' || arg === 'magical' ? arg : null };
        break;
      case 'jigeSwap': {
        const list = jigeList;
        modal = null;
        jigeList = null;
        if (!list) break;
        // the list belongs to one unit on one lane snapshot: anything else changed and the pick is not sent
        if (jigeStale(list)) { say('유닛이 바뀌어 지게 바꾸기를 취소했습니다'); break; }
        driver.queue({ type: 'jigeSwap', source: { ...list.source }, result: arg });
        break;
      }
      case 'speed': {
        const speed = Number(arg);
        if (driver.speed !== undefined && (SPEEDS as readonly number[]).includes(speed)) driver.speed = speed;
        break;
      }
      case 'closeModal':
        // text typed but not searched is kept too
        if (modal === 'dex' && el('modal').querySelector('.dex-search')) dex = { ...dex, ...typedNow() };
        dexRemember();
        modal = null;
        jigeList = null;
        break;
      case 'setHelp': helpLine = arg === 'on'; writeHelpLine(helpLine); break;
      case 'setFx': if ((arg === 'on') !== !!scene.reduceEffects) scene.setReduceEffects(arg === 'on'); break;
      case 'restart': hooks.onRestart?.(); break;
      case 'home': hooks.onHome?.(); break;
    }
    if (action.startsWith('dex')) dexRemember();
    render();
    if (action === 'dexRole' || action === 'dexMine' || action === 'dexAdv') {
      el('modal').querySelector<HTMLButtonElement>(`[data-action="${action}"]${action === 'dexAdv' ? '' : `[data-arg="${arg}"]`}`)?.focus();
    }
    if (action === 'dexFilter' || action === 'dexKind') {
      el('modal').querySelector<HTMLButtonElement>(`.dex-filters [data-action="${action}"][aria-pressed="true"], .dex-chips [data-action="${action}"][aria-pressed="true"]`)?.focus();
    }
    if (modal === 'settings' && SETTING_ACTIONS.has(action)) el('modal').querySelector<HTMLButtonElement>(`[data-action="${action}"][data-arg="${arg}"]`)?.focus();
    if (action === 'dexRecent' || action === 'dexRecentDel') el('modal').querySelector<HTMLInputElement>('.dex-search input')?.focus();
    if (action === 'dexReset') el('modal').querySelector<HTMLButtonElement>('.dex-chips [aria-pressed="true"]')?.focus();
    if (action === 'dexTree') el('modal').querySelector<HTMLButtonElement>(`.dex-tree-toggle[data-arg="${arg}"]`)?.focus({ preventScroll: true });
    if (action === 'dexFold') el('modal').querySelector<HTMLButtonElement>(`.dex-fold[data-arg="${arg}"]`)?.focus({ preventScroll: true });
    if ((action === 'dexGo' || action === 'dexBack') && dex.focus) {
      revealDexRow(dex.focus);
      // the pressed link is gone with the redraw: keep the keyboard in the dex
      const row = el('modal').querySelector<HTMLElement>(`tr[data-dex-id="${dex.focus}"]`);
      (el('modal').querySelector<HTMLButtonElement>('.dex-back') ?? row?.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
      dex = { ...dex, focus: null };
    }
    if (modal && modal !== previousModal) el('modal').querySelector<HTMLButtonElement>('button')?.focus();
  };

  function setHelper(on: boolean): void {
    if (on === helperOpen) return;
    helperOpen = on;
    // the helper and the B panel share the left column
    if (on) econTab = null;
    if (on && !driver.readOnly) driver.queue({ type: 'helperOpened' });
  }

  for (const id of ['top', 'left', 'right', 'bottom', 'modal', 'error', 'econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor']) onAction(el(id), act);
  // the storage column belongs to the own living lane; it takes presses while no window is open
  const storageVisible = () => !driver.readOnly && driver.state.phase !== 'ended';
  const storageLive = () => storageVisible() && !driver.failed && modal === null;
  wireStorage(el('storage'), el('stage'), () => laneOf(driver.state), (defId, slot) => act('retrieve', slot === undefined ? defId : `${defId}@${slot}`), storageLive);
  // the scene says when a dragged board unit is over the column, and whether it may go in
  scene.onStorageHover = hover => {
    if (hover) el('storage').dataset.drop = hover;
    else delete el('storage').dataset.drop;
  };
  scene.onBoardDrag = on => el('storage').classList.toggle('board-drag', on);
  el('modal').addEventListener('submit', ev => {
    const form = ev.target as HTMLFormElement;
    if (!form.matches('.dex-search, .dex-skillsearch')) return;
    ev.preventDefault();
    const byName = form.matches('.dex-search');
    dex = { ...dex, ...typedNow(), ...(byName ? { query: String(new FormData(form).get('query') ?? '').trim() } : { skill: String(new FormData(form).get('skill') ?? '').trim() }) };
    if (byName) dexSearched(dex.query);
    dexRemember();
    render();
    el('modal').querySelector<HTMLInputElement>(byName ? '.dex-search input' : '.dex-skillsearch input')?.focus();
  });
  scene.onSelect(slot => {
    if (modal || driver.failed || driver.state.phase === 'ended') return;
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
    let drew = false;
    for (const event of events) {
      if (!NOTE_TYPES.has(event.type) || driver.readOnly) continue;
      if (event.type === 'buy') { lastDraw = event as DrawReceipt; drew = true; }
      const text = noteText(event as EconNote, driver.state.data);
      if (text) say(text, NOTE_MS);
    }
    for (const r of rejected) {
      const fullBoard = r.command.type === 'summon' && !freeSlot();
      const tame = r.command.type === 'tame' ? tameRejectText(econ(), r.command.enemyId, r.reason, driver.state.data) : null;
      const text = tame ?? rejectText(fullBoard ? 'noSlot' : r.reason);
      if (text) notice = { text, until: performance.now() + NOTICE_MS };
    }
    if (drew || scene.selectedId !== priorSelection) render();
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

  /** The quest box at the bottom of the right panel (one J line online, where notices need the room); empty without an economy. */
  function questBox(folded: boolean): string {
    const e = driver.state.phase === 'ended' ? null : econ();
    return e ? questBoxHtml(questBoxModel(e, driver.state, online), folded) : '';
  }

  function jigeStale(list: JigeList): boolean {
    const s = driver.state;
    const unit = (list.source.zone === 'board' ? s.slots : s.storage ?? [])[list.source.index];
    return driver.readOnly || driver.laneSeat !== list.seat || driver.laneEpoch !== list.epoch
      || !unit || unit.id !== list.source.unitId || unit.defId !== list.defId;
  }
  // the R list filters as one types; only the rows are redrawn so the box keeps its text, caret and IME state
  el('modal').addEventListener('input', ev => {
    const input = (ev.target as HTMLElement).closest<HTMLInputElement>('.jige-search input');
    if (!input || !jigeList) return;
    jigeList = { ...jigeList, name: input.value };
    setHtml(el('modal').querySelector<HTMLElement>('.jige-rows')!, jigeRowsHtml(driver.state.data, jigeList));
  });
  window.addEventListener('keydown', ev => {
    if (modal === 'dex' && ev.code === 'Escape' && !ev.isComposing && (ev.target as HTMLElement)?.closest?.('.dex-search, .dex-skillsearch')) {
      ev.preventDefault();
      act('closeModal', '');
      return;
    }
    if (isTypingTarget(ev)) return;
    if (driver.failed || ev.defaultPrevented || ev.isComposing || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const target = ev.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return;
    if (ev.code === 'Escape') {
      if (modal) act('closeModal', '');
      else { scene.selectedId = null; render(); }
      return;
    }
    if (modal === 'upgrades') {
      // the window never pauses anything; E toggles it and 1-4 buy only while it is open
      const open = UPGRADE_KEYS[ev.code];
      if (ev.code === 'KeyE') act('closeModal', '');
      else if (open) act('upgrade', open);
      return;
    }
    if (modal === 'dex' && ev.code === 'KeyD') { act('closeModal', ''); return; }
    if (modal === 'settings' && ev.code === 'KeyQ' && driver.state.phase !== 'ended') { act('toggleHelper', ''); return; }
    // J opens the quest list from preparation on and closes it again; the clock never stops for it
    if (ev.code === 'KeyJ' && driver.state.data.economy && driver.state.phase !== 'ended' && (modal === null || modal === 'quests')) {
      act(modal === 'quests' ? 'closeModal' : 'openQuests', '');
      return;
    }
    // Tab opens the selected unit's 상세 and closes it again
    if (ev.code === 'Tab' && modal === 'unitDetails') { ev.preventDefault(); act('closeModal', ''); return; }
    if (modal || driver.state.phase === 'ended') return;
    if ((ev.code === 'Space' || ev.code === 'Tab') && target?.closest?.('button')) return;
    const card = displayedCard;
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (ev.code === 'KeyE') act('openUpgrades', '');
    else if (ev.code === 'KeyD') act('openDex', '');
    else if (ev.code === 'KeyQ') act('toggleHelper', '');
    else if (ev.code === `Key${STORE_ALL_KEY}`) act('storeAll', '');
    else if (ev.code === 'KeyB' && driver.state.data.economy?.market) act('toggleMarket', '');
    else if (ev.code === 'KeyT' && driver.state.data.economy?.tame) act('tame', '');
    else if (ev.code === 'KeyR' && driver.state.data.economy?.market && card?.unitId != null) act('jigeOpen', `board:${card.unitId}`);
    else if (ev.code === 'KeyP' && !online) { driver.paused = !driver.paused; render(); }
    else if (ev.code === 'Tab') {
      ev.preventDefault();
      if (card?.unitId != null) act('unitDetails', '');
    }
    else if (ev.code === 'KeyW') {
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
    const held = s.data.economy?.market ? econ()?.jige : undefined;
    // the unit an open R list was opened on moved, sold or the lane changed: the list goes, nothing is sent
    if (modal === 'jige' && (!jigeList || jigeStale(jigeList))) { modal = null; jigeList = null; }
    const now = performance.now();
    const view = online && opts.data ? opts.view?.() ?? null : null;
    if (view && opts.data) {
      renderTop(view, opts.data);
      renderRows(view, opts.data, helperOpen ? helperPopHtml(s) : '');
      renderAlert(s);
    } else {
      renderHud(s, driver.paused, activeNotice(notice, now));
      renderHelper(s, helperOpen, s.phase === 'ended' ? '' : unitPanelHtml(s, selected, { compact: helperOpen, jige: held }));
    }
    // the banner sits over the top of the lane; prompts there push it down a row, and with two prompts the band above the
    // lane is full, so the line goes to the notices in the right column instead
    const prompts = renderEcon(view, selected);
    const bannerText = s.phase === 'ended' ? '' : activeNotice(banner, now) ?? (view ? activeNotice(notice, now) ?? '' : '');
    const bannerEl = el('round-banner');
    bannerEl.classList.toggle('low', prompts === 1);
    const oneLine = bannerText.replace(/\n/g, ' · ');
    bannerEl.textContent = prompts >= 2 ? '' : prompts === 1 ? oneLine : bannerText;
    const moved = prompts >= 2 && bannerText ? [oneLine] : [];
    if (view && driver.readOnly) {
      setHtml(el('right'), `<b class="watch-heading">고개 관전</b><p class="watch-hint">왼쪽에서 살아 있는 고개를 고르세요. 아래 카드로 엽전을 보낼 수 있습니다.</p>`);
    } else {
      renderRight(s, {
        ...(view ? { online: true, notices: [...moved, ...rightNotices(now)] } : {}),
        ...(s.data.economy?.market ? { market: econTab !== null } : {}),
        quests: questBox(view !== null),
      });
    }
    if (now < pressedUntil) el('right').querySelector('[data-action="summon"]')?.classList.add('pressed');
    const spiritCard = view && opts.data ? spiritCardHtml(view, opts.data) : null;
    if (spiritCard) {
      displayedCard = { unitId: null, recipes: [] };
      setHtml(el('bottom'), spiritCard);
    } else displayedCard = renderBottom(s, selected, online, helpLine ? (s.data.economy?.market ? 'B 장터' : undefined) : null, held);
    setHtml(el('storage'), storageVisible() ? storageHtml(s, held) : '');
    if (modal === 'unitDetails' && (selected === null || spiritCard)) modal = null;
    // online the team result screen (Task 19) replaces the 1-player result window
    const soloResult = !online && s.phase === 'ended';
    const dialogOpen = modal !== null || soloResult;
    for (const id of ['top', 'left', 'right', 'bottom', 'lane', 'econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor']) el(id).inert = dialogOpen;
    // a redraw of the dex (a board change moves the tree marks) keeps its scroll position
    const dexShown = !soloResult && modal === 'dex';
    const listKey = `${dex.filter}
${dex.kind}
${dex.role}
${dex.query}
${dex.skill}
${dex.mine.join()}`;
    const keepTop = dexShown && dexListKey === listKey ? dexScroller()?.scrollTop ?? 0 : 0;
    setHtml(el('modal'), soloResult ? resultHtml(s, best?.id ?? null) : modal === 'menu' || modal === 'forfeit' ? menuHtml(modal, !!view && spiritModel(view) !== null) : modal === 'settings' ? settingsHtml({ helper: helperOpen, reducedFx: !!scene.reduceEffects, help: helpLine, ...(driver.speed !== undefined ? { speed: driver.speed } : {}) }) : modal === 'unitDetails' && selected !== null ? unitDetailsHtml(s, selected) : dexShown ? dexHtml(s.data,  dex.filter, dex.query, s.round, { back: dex.back, open: dex.open, board: boardUnits(s), unfold: dex.unfold, recent: dexRecent, adv: dex.adv, state: s }, { kind: dex.kind, role: dex.role, skill: dex.skill, mine: dex.mine }) : modal === 'upgrades' ? upgradesHtml(s) : modal === 'jige' && jigeList ? jigeListHtml(s.data, jigeList, econ()?.jige ?? 0) : modal === 'quests' && econ() ? questListHtml(questRows(econ()!, s, online), questFocus, huntRows(econ()!, s)) : '');
    if (dexShown) {
      const box = dexScroller();
      if (box && box.scrollTop !== keepTop) box.scrollTop = keepTop;
    }
    if (modal === 'quests' && questFocus && modal !== shownModal) {
      el('modal').querySelector<HTMLElement>(`.quest-row[data-quest="${questFocus}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
    shownModal = modal;
    dexListKey = dexShown ? listKey : '';
    hooks.onRender?.();
  }

  /** The search texts as typed (the boxes are redrawn with the dex, so read them before a filter change). */
  function typedNow(): { query: string; skill: string } {
    const modalEl = el('modal');
    return {
      query: modalEl.querySelector<HTMLInputElement>('.dex-search input')?.value.trim() ?? dex.query,
      skill: modalEl.querySelector<HTMLInputElement>('.dex-skillsearch input')?.value.trim() ?? dex.skill,
    };
  }

  /** What scrolls in the dex: the list under the search on stage 3 data, the whole window on stage 1-2. */
  function dexScroller(): HTMLElement | null {
    return el('modal').querySelector<HTMLElement>('.dex-scroll') ?? el('modal').querySelector<HTMLElement>('.modal');
  }

  /** Scrolls a dex entry to the top of the list (under the sticky header) and flashes it. */
  function revealDexRow(id: string): void {
    const box = dexScroller();
    const row = box?.querySelector<HTMLElement>(`tr[data-dex-id="${id}"]`);
    if (!box || !row) return;
    // the stage is scaled to the window: screen pixels back to stage pixels
    const scale = box.offsetHeight ? box.getBoundingClientRect().height / box.offsetHeight : 1;
    const sticky = box.matches('.dex-scroll') ? box.querySelector<HTMLElement>('thead') : box.querySelector<HTMLElement>('.modal-head');
    const offset = (row.getBoundingClientRect().top - box.getBoundingClientRect().top) / (scale || 1);
    box.scrollTop = Math.max(0, box.scrollTop + offset - (sticky?.offsetHeight ?? 0) - 2);
    row.classList.remove('dex-flash');
    void row.offsetWidth;
    row.classList.add('dex-flash');
  }

  function freeSlot(): boolean {
    return driver.state.slots.some((u, i) => !u && driver.state.open[i]);
  }

  /**
   * Stage 3 economy: the B panel over the left column, prompts over the top of the lane, the tracker under it.
   * Returns how many prompt rows sit over the top of the lane.
   */
  function renderEcon(view: ClientView | null, selected: number | null): number {
    const s = driver.state;
    const e = s.phase === 'ended' ? null : econ();
    const tame = e ? tameModel(e, s) : null;
    setHtml(el('econ-top'), '');
    placeTame(tame);
    setHtml(el('econ-bottom'), e ? econBottomHtml(questChips(e, s, view)) : '');
    if (!e || !econTab) setHtml(el('econ-panel'), '');
    else setHtml(el('econ-panel'), econPanelHtml(marketModel(e, s, lastDraw)));
    return 0;
  }

  let pressedUntil = 0;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  function pressSummon(): void {
    pressedUntil = performance.now() + PRESS_MS;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => el('right').querySelector('[data-action="summon"]')?.classList.remove('pressed'), PRESS_MS);
  }

  /** The T button follows its target's health bar every frame; without a bar on screen it sits over the lane's top. */
  let shownTame: TameModel | null = null;
  function placeTame(tame: TameModel | null): void {
    shownTame = tame;
    const box = el('tame-anchor');
    setHtml(box, tameButtonHtml(tame));
    moveTame();
  }
  function moveTame(): void {
    const box = el('tame-anchor');
    // test doubles of the page may not draw at all
    if (!box.style) return;
    const at = shownTame ? scene.enemyBarAnchor?.(shownTame.enemyId) ?? null : null;
    box.classList.toggle('floating', at !== null);
    box.style.left = at ? `${Math.round(at.x)}px` : '';
    box.style.top = at ? `${Math.round(at.y)}px` : '';
  }

  let lastRender = 0;
  scene.onFrame = () => {
    moveTame();
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
    lastDraw = null;
    render();
  }
  return { resetUi };
}

export function unitName(driver: Driver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
