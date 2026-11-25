import {
  birthOf, laneOf, pickStored, unitDefFast, type ClientView, type EconMine, type EconNote, type GameData, type GameEvent, type GameState, type GambleCommand, type QuestId, type UpgradeId,
} from '@dorandi/logic';
import { SPEEDS, type Driver } from '../driver';
import { isTypingTarget } from '../online/entry';
import { rightNotices } from '../online/models';
import { renderRows, renderTop } from '../online/panels';
import { menuHtml, spiritCardHtml, spiritModel } from '../online/spirit';
import type { LaneScene } from '../LaneScene';
import { cellCorner, cellPx, CENTER_X, CENTER_Y } from '../layout';
import { gameAudio } from '../audio/engine';
import { wireAudioSettings } from '../audio/settings-ui';
import { playGamblePress, playGambleResult } from '../sfx';
import { BIRTH_MS, BirthHold, FirstSix, birthBanner, birthSource, type BirthAlert } from './birth';
import { dexHtml } from './dex';
import { addRecent, loadRecent, loadView, removeRecent, saveRecent, saveView } from './dex-memory';
import {
  econBottomHtml, econPanelHtml, tameButtonHtml, marketModel, noteText, questChips, tameModel,
  tameRejectText, type TameModel, jigeListHtml, questBoxHtml, questBoxModel, questListHtml, questRows, huntRows, jigeRowsHtml, type JigeList, type MarketModel, type MarketTab,
} from './econ';
import {
  advanceReveal, gambleHistoryHtml, gambleInfoHtml, gambleRevealHtml, heldCoins, recordGamble,
  revealDisplay, revealResultAt, startReveal, type GambleHistoryEntry, type Reveal,
} from './gamble';
import { el, onAction, setHtml } from './dom';
import { helperPopHtml, renderHelper } from './helper';
import { renderAlert, renderHud } from './hud';
import { PressConfirm } from './confirm';
import {
  activeNotice, boardUnits, dexBack, dexFold, dexGo, dexNavStart, dexToggle, roleList, MINE_KEYS, nextUnitId, pinnedTarget, rejectText, selectedSlot, type DexNav, type Notice,
} from './models';
import { renderBottom, renderRight, unitDetailsHtml, unitPanelHtml, upgradesHtml } from './panels';
import { resultHtml } from './result';
import { readHelpLine, settingsHtml, writeHelpLine } from './settings';
import { STORE_ALL_KEY, STORE_KEY, storageHtml, storageInfoHtml, storageInfoModel, wireStorage } from './storage';
import { readTarget, targetHtml, writeTarget } from './target';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;
const CONFIRM_SELL_GRADE = 3;
/** Economy notices stay a little longer than a refusal. */
const NOTE_MS = 2500;
const NOTE_TYPES: ReadonlySet<string> = new Set(['jigeSwap', 'questReward', 'tame', 'tameTry', 'hunt', 'itemBought', 'itemAttached']);

/** The economy message for a solo or streamed event, or null for events that show none. */
export function econNoteText(event: GameEvent, data: GameData): string | null {
  return NOTE_TYPES.has(event.type) ? noteText(event as EconNote, data) : null;
}

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void; onHome?: () => void }

/** Settings window presses; the pressed choice keeps the focus after the redraw. */
const SETTING_ACTIONS: ReadonlySet<string> = new Set(['setHelper', 'speed', 'setFx', 'setHelp']);

/** Board and resource commands; blocked while the driver is read-only (spirit, or another lane on screen). */
const GAME_ACTIONS: ReadonlySet<string> = new Set([
  'summon', 'convert', 'combine', 'sell', 'upgrade', 'gambleCoins', 'gambleUnit', 'hunt', 'tame', 'jigeOpen', 'jigeSwap',
  'store', 'storeAll', 'retrieve', 'sellStored', 'buyItem', 'attachItem',
]);
const PRESS_MS = 120;

/** Online screens also read the server view for the scoreboard and the two-line top bar. */
export interface OnlineActions { support(): void; watch(seat: number): void; forfeit(): void }
export interface MountOpts { online?: boolean; view?: () => ClientView | null; data?: GameData; actions?: OnlineActions; targetKey?: string }

export function mountUi(driver: Driver, scene: LaneScene, hooks: UiHooks = {}, opts: MountOpts = {}): { resetUi: () => void } {
  const online = opts.online === true;
  scene.selectedId = null;
  let displayedCard: ReturnType<typeof renderBottom> | null = null;
  let inspectedStack: string | null = null;
  let targetId = readTarget(opts.targetKey);
  let targetFolded = false;
  let banner: Notice | null = null;
  // the dex keeps its filters, search and recent searches across openings (and, in localStorage, across visits)
  let dex: DexNav = { ...dexNavStart(), ...loadView() };
  let dexRecent = loadRecent();
  const dexRemember = () => saveView({ filter: dex.filter, kind: dex.kind, role: dex.role, query: dex.query, adv: dex.adv, skill: dex.skill, mine: dex.mine });
  const dexSearched = (term: string) => { dexRecent = addRecent(dexRecent, term); saveRecent(dexRecent); };
  // the list the dex scroll position belongs to: a new filter or search starts at the top
  let dexListKey = '';
  let helperOpen = false;
  // solo: P pauses until P again; the open dex pauses on top of that without touching the P state
  let userPaused = false;
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
  // stage 3 economy: the B panel and its tab (null = closed)
  let econTab: MarketTab | null = null;
  // online: the unit whose 아이템 ▾ list is open under the board
  let itemMenuId: number | null = null;
  let reveal: Reveal | null = null;
  let revealEpoch = driver.laneEpoch;
  // S on grade 3+ and T take a second press within 2 seconds
  const confirm = new PressConfirm();
  const sellArmed = (s: GameState, slot: number | null) => slot !== null && !!s.slots[slot] && confirm.armed(`sell:${s.slots[slot]!.id}`, performance.now());
  let marketItem: string | null = null;
  let shownMarket: MarketModel | null = null;
  let gambleHistory: GambleHistoryEntry[] = [];
  let pendingGambles: { receipt: GambleHistoryEntry; visibleAt: number }[] = [];
  let marketCell: HTMLElement | null = null;

  function gamble(cmd: GambleCommand): void {
    if (!econTab || !econ()?.market?.gamble || (reveal && reveal.phase !== 'result')) return;
    playGamblePress(cmd.type);
    reveal = startReveal(performance.now());
    driver.queue(cmd);
  }

  driver.onGambleNotice?.(text => scene.showGambleNotice(text));
  const births = new BirthHold();
  const firstSix = new FirstSix();
  const flashUntil = new Map<number, number>();
  function showBirth(alert: BirthAlert, mine: boolean): void {
    scene.showBirth(birthBanner(opts.data ?? driver.state.data, alert, { mine, team: online }));
    gameAudio.play('sparkle');
    if (!mine) gameAudio.play('combineBig');
    if (online && alert.seat !== undefined) flashUntil.set(alert.seat, performance.now() + BIRTH_MS);
  }
  function ownBirth(alert: BirthAlert): void {
    const ready = alert.via === 'gamble' ? births.hold(alert) : alert;
    if (ready) showBirth(ready, true);
  }
  function flashingSeats(now: number): Set<number> {
    for (const [seat, until] of flashUntil) if (until <= now) flashUntil.delete(seat);
    return new Set(flashUntil.keys());
  }
  driver.onBirthNotice?.((alert, mine) => (mine ? ownBirth(alert) : showBirth(alert, false)));
  const econ = (): EconMine | null => driver.econ?.() ?? null;
  const say = (text: string, ms = NOTICE_MS) => { notice = { text, until: performance.now() + ms }; };
  const refuse = (text: string) => { gameAudio.play('error'); say(text); };
  for (const id of ['econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) {
    if (document.getElementById(id)) continue;
    const node = document.createElement('div');
    node.id = id;
    el('stage').append(node);
  }
  const drawer = el('econ-panel');

  function inspectMarket(event: Event): void {
    const item = (event.target as Element).closest<HTMLElement>('[data-market-item]')?.dataset.marketItem;
    if (!item || item === marketItem) return;
    marketItem = item;
    renderMarketInfo();
  }
  drawer.addEventListener('pointerover', event => { if (event.pointerType !== 'touch') inspectMarket(event); });
  drawer.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !(event.target as Element).closest('.gamble-buy')) inspectMarket(event);
  });
  drawer.addEventListener('focusin', inspectMarket);
  drawer.addEventListener('click', event => {
    if (!(event.target as Element).closest('.gamble-buy')) inspectMarket(event);
  });

  function renderMarketInfo(): void {
    const info = drawer.querySelector<HTMLElement>('#gamble-info');
    if (info && shownMarket?.gamble) setHtml(info, gambleInfoHtml(shownMarket.gamble, marketItem, shownMarket.jige));
  }

  function markMarketCell(id: number): void {
    if (driver.readOnly) return;
    const s = driver.state;
    const slot = selectedSlot(s, id);
    if (slot === null) return;
    const lane = laneOf(s);
    const pos = cellCorner(lane, slot);
    const mark = document.createElement('div');
    mark.className = 'gamble-cell-mark';
    mark.classList.toggle('still', !!scene.reduceEffects);
    mark.setAttribute('aria-hidden', 'true');
    mark.style.left = `${CENTER_X + pos.x}px`;
    mark.style.top = `${CENTER_Y + pos.y}px`;
    mark.style.width = mark.style.height = `${cellPx(lane)}px`;
    marketCell?.remove();
    marketCell = mark;
    el('stage').append(mark);
    setTimeout(() => { mark.remove(); if (marketCell === mark) marketCell = null; }, 850);
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
        if (slot === null) break;
        // grade 3 and up asks for a second press; grades 1-2 still sell at once
        const unit = driver.state.slots[slot]!;
        if (unitDefFast(driver.state.data, unit.defId).grade >= CONFIRM_SELL_GRADE && !confirm.press(`sell:${unit.id}`, performance.now())) break;
        driver.queue({ type: 'sell', slot });
        break;
      }
      case 'upgrade': driver.queue({ type: 'upgrade', id: arg as UpgradeId }); break;
      case 'store': {
        // grade 3 and up are refused by the command itself and come back as the storage notice
        const slot = selectedSlot(driver.state, Number(arg));
        if (slot !== null) driver.queue({ type: 'store', slot });
        break;
      }
      case 'storeAll': driver.queue({ type: 'storeAll' }); break;
      case 'retrieve': {
        const [defId = '', slot] = arg.split('@');
        if (slot !== undefined) driver.queue({ type: 'retrieve', defId, slot: Number(slot) });
        break;
      }
      case 'sellStored': driver.queue({ type: 'sellStored', defId: arg }); break;
      case 'closeStorageInfo': inspectedStack = null; break;
      case 'pinTarget':
        if (modal === 'dex') dex = { ...dex, ...typedNow() };
        targetId = targetId === arg ? null : arg;
        writeTarget(opts.targetKey, targetId);
        targetFolded = false;
        break;
      case 'foldTarget': targetFolded = !targetFolded; break;
      case 'clearTarget': targetId = null; writeTarget(opts.targetKey, null); break;
      case 'toggleMarket':
        econTab = econTab ? null : 'market';
        if (econTab) helperOpen = false;
        else marketCell?.remove();
        break;
      case 'econTab': econTab = arg === 'items' ? 'items' : 'market'; helperOpen = false; break;
      case 'buyItem': if (arg) driver.queue({ type: 'buyItem', item: arg }); break;
      case 'attachItem': {
        const [item = '', target] = arg.split('@');
        const unitId = Number(target);
        const slot = selectedSlot(driver.state, unitId);
        itemMenuId = null;
        if (item && slot !== null) driver.queue({ type: 'attachItem', item, slot, unitId });
        break;
      }
      case 'itemMenu': itemMenuId = itemMenuId === Number(arg) ? null : Number(arg); break;
      case 'econClose': econTab = null; break;
      case 'marketCell': markMarketCell(Number(arg)); break;
      case 'gambleCoins': gamble({ type: 'gambleCoins', stake: Number(arg) }); break;
      case 'gambleUnit': if (arg === 'small' || arg === 'big' || arg === 'coin') gamble({ type: 'gambleUnit', table: arg }); break;
      case 'hunt': if (arg) driver.queue({ type: 'hunt', enemy: arg }); break;
      case 'tame': {
        const e = econ();
        const t = e ? tameModel(e, driver.state) : null;
        if (!t) break;
        // the hotkey on a chance that is not ready says what is missing instead of sending a doomed command
        if (!t.ready) { refuse(t.label); break; }
        if (!confirm.press(`tame:${t.enemyId}`, performance.now())) break;
        driver.queue({ type: 'tame', enemyId: t.enemyId });
        break;
      }
      // Q and the online helper title flip it; the settings row sets it. Neither closes a window.
      case 'toggleHelper': setHelper(!helperOpen); break;
      case 'setHelper': setHelper(arg === 'on'); break;
      // the gear stays above the settings window, so a second press closes it
      case 'openSettings': modal = modal === 'settings' ? null : 'settings'; break;
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
        const index = zone === 'board' ? selectedSlot(s, Number(ref)) ?? -1 : pickStored(s.storage ?? [], ref);
        const unit = (zone === 'board' ? s.slots : s.storage ?? [])[index];
        if (!e || !unit || (zone !== 'board' && zone !== 'storage')) break;
        if (e.jige < 1) { refuse(rejectText('noJige') ?? ''); break; }
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
        if (jigeStale(list)) { refuse('유닛이 바뀌어 지게 바꾸기를 취소했습니다'); break; }
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
    if (action === 'toggleMarket' || action === 'econClose') {
      const selector = '[data-action="toggleMarket"]';
      (drawer.firstElementChild ? drawer : el('right')).querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    }
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

  for (const id of ['top', 'left', 'right', 'bottom', 'modal', 'error', 'econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) onAction(el(id), act);
  // the storage column belongs to the own living lane; it takes presses while no window is open
  const storageVisible = () => !driver.readOnly && driver.state.phase !== 'ended';
  const storageLive = () => storageVisible() && !driver.failed && modal === null;
  wireStorage(el('storage'), el('stage'), () => laneOf(driver.state), (defId, slot) => act('retrieve', `${defId}@${slot}`), defId => {
    inspectedStack = defId;
    scene.selectedId = null;
    render();
  }, storageLive);
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
    inspectedStack = null;
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
      const birth = birthSource(online) === 'events' ? birthOf(driver.state.data, event) : null;
      if (birth) ownBirth({ defId: birth.defId, unitId: birth.unitId, via: birth.via, firstSix: firstSix.take(birth.grade) });
      if (event.type === 'roundStart') {
        const wave = driver.state.data.waves.find(w => w.round === event.round);
        const boss = wave?.type === 'boss' && driver.state.data.enemies.find(e => e.id === wave.boss);
        const reward = event.round > 1 && !driver.readOnly ? `${event.round - 1}라운드 종료 · +${driver.state.data.balance.coins.roundEnd}냥` : '';
        const title = `${event.round}라운드${boss ? ' · 고개 보스: ' + boss.name : ''}`;
        banner = { text: [reward, title].filter(Boolean).join('\n'), until: performance.now() + 1800 };
      }
    }
    if (revealEpoch !== driver.laneEpoch) {
      reveal = null;
      revealEpoch = driver.laneEpoch;
    }
    let drew = false;
    for (const event of events) {
      if (!driver.readOnly && (event.type === 'gambleCoins' || event.type === 'gambleUnit')) {
        const now = performance.now();
        reveal = advanceReveal(reveal, now, driver.state.data, event);
        if (reveal?.phase === 'rolling') {
          pendingGambles.push({ receipt: { event, round: driver.state.round }, visibleAt: revealResultAt(reveal) });
        }
        gameAudio.play('dice');
        drew = true;
      }
      if (driver.readOnly) continue;
      const text = econNoteText(event, driver.state.data);
      if (text) say(text, NOTE_MS);
    }
    for (const r of rejected) {
      if (r.command.type === 'gambleCoins' || r.command.type === 'gambleUnit') reveal = null;
      const fullBoard = r.command.type === 'summon' && !freeSlot();
      const tame = r.command.type === 'tame' ? tameRejectText(econ(), r.command.enemyId, r.reason, driver.state.data) : null;
      const table = r.command.type === 'gambleUnit' ? econ()?.market?.gamble?.units.tables[r.command.table] : undefined;
      const gate = table && r.reason === 'gambleRound' ? `큰 보따리는 ${table.fromRound}라운드부터입니다` : null;
      const text = tame ?? gate ?? rejectText(fullBoard ? 'noSlot' : r.reason);
      if (text) notice = { text, until: performance.now() + NOTICE_MS };
    }
    if (drew || scene.selectedId !== priorSelection) render();
  });
  scene.onEvents(events => {
    for (const e of events) {
      if (e.type === 'summon' || e.type === 'combine' || (e.type === 'gambleUnit' && e.defId)) {
        const grade = unitDefFast(driver.state.data, e.defId).grade;
        if (!best || grade > best.grade) best = { id: e.defId, grade };
      }
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
    if (modal === 'settings' && ev.code === 'Escape' && !ev.isComposing) {
      ev.preventDefault();
      act('closeModal', '');
      return;
    }
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
      else { scene.selectedId = null; inspectedStack = null; render(); }
      return;
    }
    if (modal === 'upgrades') {
      // the window never pauses anything; E toggles it and 1-3 buy only while it is open
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
    if ((ev.code === 'Space' || ev.code === 'Tab') && target?.closest?.('button, .gamble-option[tabindex]')) return;
    const card = displayedCard;
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (ev.code === 'KeyE') act('openUpgrades', '');
    else if (ev.code === 'KeyD') act('openDex', '');
    else if (ev.code === 'KeyQ') act('toggleHelper', '');
    else if (ev.code === `Key${STORE_ALL_KEY}`) act('storeAll', '');
    else if (ev.code === 'KeyB' && driver.state.data.economy?.market) act('toggleMarket', '');
    else if (ev.code === 'KeyT' && driver.state.data.economy?.tame) act('tame', '');
    else if (ev.code === 'KeyR' && driver.state.data.economy?.market && card?.unitId != null) act('jigeOpen', `board:${card.unitId}`);
    else if (ev.code === 'KeyP' && !online) { userPaused = !userPaused; render(); }
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
    else if (ev.code === `Key${STORE_KEY}` && card?.unitId != null) act('store', String(card.unitId));
    else if (card?.unitId != null && (ev.code === 'KeyZ' || ev.code === 'KeyX' || ev.code === 'KeyC')) {
      const option = card.recipes.find(o => `Key${o.key}` === ev.code);
      if (option) act('combine', `${option.result}@${card.unitId}`);
    }
  });

  function render(): void {
    const s = driver.state;
    // commands wait for ticks, so only the dex (which sends none) stops the clock
    if (!online) driver.paused = userPaused || (modal === 'dex' && s.phase !== 'ended');
    const selected = selectedSlot(s, scene.selectedId);
    if (selected === null) scene.selectedId = null;
    const held = s.data.economy?.market ? econ()?.jige : undefined;
    // held items come from the shop view: the online drawn state has no econ
    const shop = econ()?.shop ?? null;
    if (itemMenuId !== null && (selected === null || s.slots[selected]?.id !== itemMenuId)) itemMenuId = null;
    // the unit an open R list was opened on moved, sold or the lane changed: the list goes, nothing is sent
    if (modal === 'jige' && (!jigeList || jigeStale(jigeList))) { modal = null; jigeList = null; }
    const now = performance.now();
    const view = online && opts.data ? opts.view?.() ?? null : null;
    const info = selected === null && storageVisible() ? storageInfoModel(s, inspectedStack) : null;
    if (!info) inspectedStack = null;
    const infoHtml = info ? storageInfoHtml(s, info) : '';
    const target = targetId && pinnedTarget(
      s.data, targetId, driver.readOnly && view ? view.mine.units : s.slots, driver.readOnly && view ? view.mine.storage : s.storage,
    );
    setHtml(el('target-overlay'), target && s.phase !== 'ended' ? targetHtml(target, targetFolded) : '');
    el('stage').classList.toggle('has-target', !!el('target-overlay').firstChild);
    if (view && opts.data) {
      renderTop(view, opts.data);
      renderRows(view, opts.data, helperOpen ? helperPopHtml(s) : '', flashingSeats(now));
      renderAlert(s);
    } else {
      renderHud(s, driver.paused, activeNotice(notice, now));
      renderHelper(s, helperOpen, s.phase === 'ended' ? '' : infoHtml || unitPanelHtml(s, selected, { compact: helperOpen, jige: held, sellArmed: sellArmed(s, selected), shop }));
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
        heldCoins: heldCoins(reveal),
      });
    }
    if (now < pressedUntil) el('right').querySelector('[data-action="summon"]')?.classList.add('pressed');
    const spiritCard = view && opts.data ? spiritCardHtml(view, opts.data) : null;
    if (spiritCard) {
      displayedCard = { unitId: null, recipes: [] };
      setHtml(el('bottom'), spiritCard);
    } else if (online && info) {
      displayedCard = { unitId: null, recipes: [] };
      setHtml(el('bottom'), infoHtml);
    } else {
      displayedCard = renderBottom(s, selected, online, helpLine ? (s.data.economy?.market ? 'B 장터' : undefined) : null, held, sellArmed(s, selected), {
        shop: driver.readOnly ? null : shop, open: itemMenuId !== null,
      });
    }
    setHtml(el('storage'), storageVisible() ? storageHtml(s, held) : '');
    if (modal === 'unitDetails' && (selected === null || spiritCard)) modal = null;
    // online the team result screen (Task 19) replaces the 1-player result window
    const soloResult = !online && s.phase === 'ended';
    const dialogOpen = modal !== null || soloResult;
    for (const id of ['top', 'left', 'right', 'bottom', 'lane', 'econ-panel', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) el(id).inert = dialogOpen;
    el('right').inert = dialogOpen || drawer.firstElementChild !== null;
    // a redraw of the dex (a board change moves the tree marks) keeps its scroll position
    const dexShown = !soloResult && modal === 'dex';
    const listKey = `${dex.filter}
${dex.kind}
${dex.role}
${dex.query}
${dex.skill}
${dex.mine.join()}`;
    const keepTop = dexShown && dexListKey === listKey ? dexScroller()?.scrollTop ?? 0 : 0;
    setHtml(el('modal'), soloResult ? resultHtml(s, best?.id ?? null) : modal === 'menu' || modal === 'forfeit' ? menuHtml(modal, !!view && spiritModel(view) !== null) : modal === 'settings' ? settingsHtml({ helper: helperOpen, reducedFx: !!scene.reduceEffects, help: helpLine, ...(driver.speed !== undefined ? { speed: driver.speed } : {}) }) : modal === 'unitDetails' && selected !== null ? unitDetailsHtml(s, selected, targetId) : dexShown ? dexHtml(s.data,  dex.filter, dex.query, s.round, { back: dex.back, open: dex.open, board: boardUnits(s), unfold: dex.unfold, recent: dexRecent, adv: dex.adv, state: s, target: targetId }, { kind: dex.kind, role: dex.role, skill: dex.skill, mine: dex.mine }) : modal === 'upgrades' ? upgradesHtml(s) : modal === 'jige' && jigeList ? jigeListHtml(s.data, jigeList, econ()?.jige ?? 0) : modal === 'quests' && econ() ? questListHtml(questRows(econ()!, s, online), questFocus, huntRows(econ()!, s)) : '');
    if (dexShown) {
      const box = dexScroller();
      if (box && box.scrollTop !== keepTop) box.scrollTop = keepTop;
    }
    if (modal === 'quests' && questFocus && modal !== shownModal) {
      el('modal').querySelector<HTMLElement>(`.quest-row[data-quest="${questFocus}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
    if (modal === 'settings' && !soloResult) wireAudioSettings(el('modal'));
    if (shownModal === 'settings' && (modal !== 'settings' || soloResult)) gameAudio.previewTrack();
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
   * Stage 3 economy: the B drawer beside the board, prompts over the top of the lane, the tracker under it.
   * Returns how many prompt rows sit over the top of the lane.
   */
  function renderEcon(view: ClientView | null, selected: number | null): number {
    const s = driver.state;
    const e = s.phase === 'ended' ? null : econ();
    const tame = e ? tameModel(e, s) : null;
    setHtml(el('econ-top'), '');
    placeTame(tame);
    setHtml(el('econ-bottom'), e ? econBottomHtml(questChips(e, s, view)) : '');
    if (driver.readOnly || revealEpoch !== driver.laneEpoch) {
      reveal = null;
      revealEpoch = driver.laneEpoch;
      marketCell?.remove();
    }
    const now = performance.now();
    // Keep all five finished rows in view while the next purchase is still rolling.
    for (const entry of pendingGambles) {
      if (entry.visibleAt <= now) gambleHistory = recordGamble(gambleHistory, entry.receipt);
    }
    pendingGambles = pendingGambles.filter(entry => entry.visibleAt > now);
    const prior = reveal;
    reveal = advanceReveal(reveal, now, s.data);
    const display = revealDisplay(reveal, now, s.data, scene.reduceEffects);
    if (prior?.phase === 'rolling' && reveal?.phase === 'result' && display) {
      const id = reveal.event.type === 'gambleUnit' ? reveal.event.unitId : undefined;
      scene.showGambleResult(reveal.tier, display.announcement, id);
      const held = id === undefined ? null : births.reveal(id);
      if (held) showBirth(held, true);
      const grade = reveal.event.type === 'gambleUnit' && reveal.event.defId ? unitDefFast(s.data, reveal.event.defId).grade : undefined;
      playGambleResult(reveal.tier, grade);
    }
    shownMarket = e && econTab ? marketModel(e, s) : null;
    const active = document.activeElement as HTMLElement | null;
    const focus = active && drawer.contains(active) ? active.dataset.marketFocus : undefined;
    setHtml(drawer, shownMarket ? econPanelHtml(shownMarket, display, driver.readOnly, econTab ?? 'market') : '');
    // the drawer covers the lane's right edge, where the pinned recipe sits; the class moves it beside the drawer
    el('stage').classList.toggle('market-open', drawer.firstElementChild !== null);
    const wallet = drawer.querySelector('.gamble-wallet');
    const balance = `엽전 ${s.coins - heldCoins(reveal)}냥 · 묵 ${s.buckwheat}개`;
    if (wallet && wallet.textContent !== balance) wallet.textContent = balance;
    renderMarketInfo();
    const result = drawer.querySelector<HTMLElement>('.gamble-result');
    const history = drawer.querySelector<HTMLElement>('.gamble-history');
    if (result) setHtml(result, gambleRevealHtml(display));
    if (history) setHtml(history, gambleHistoryHtml(gambleHistory, s));
    if (focus && !drawer.contains(active)) {
      const next = drawer.querySelector<HTMLElement>(`[data-market-focus="${focus}"]:not(:disabled)`)
        ?? drawer.querySelector<HTMLElement>('[data-market-focus="close"]');
      next?.focus({ preventScroll: true });
    }
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
    setHtml(box, tameButtonHtml(tame, !!tame && confirm.armed(`tame:${tame.enemyId}`, performance.now())));
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
    inspectedStack = null;
    targetId = null;
    writeTarget(opts.targetKey, null);
    targetFolded = false;
    helperOpen = false;
    banner = null;
    modal = null;
    best = null;
    notice = null;
    econTab = null;
    itemMenuId = null;
    reveal = null;
    confirm.clear();
    userPaused = false;
    marketItem = null;
    gambleHistory = [];
    pendingGambles = [];
    births.clear();
    firstSix.reset();
    flashUntil.clear();
    marketCell?.remove();
    render();
  }
  return { resetUi };
}

export function unitName(driver: Driver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
