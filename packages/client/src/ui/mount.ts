import {
  birthOf, laneOf, unitDefFast, type ClientView, type EconMine, type EconNote, type GameData, type GameEvent, type GameState, type GambleCommand, type QuestId, type UpgradeId,
} from '@dorandi/logic';
import { SPEEDS, type Driver } from '../driver';
import { isTypingTarget } from '../online/entry';
import { rightNotices } from '../online/models';
import { renderRows, renderTop } from '../online/panels';
import { menuHtml, spiritCardHtml, spiritModel } from '../online/spirit';
import type { LaneScene } from '../LaneScene';
import { cellCorner, cellPx, CENTER_X, CENTER_Y, type WinPlace } from '../layout';
import { currentWins } from '../fit';
import { gameAudio } from '../audio/engine';
import { wireAudioSettings } from '../audio/settings-ui';
import { playGamblePress, playGambleResult } from '../sfx';
import { BIRTH_MS, BirthHold, FirstSix, birthBanner, birthSource, type BirthAlert } from './birth';
import { dexHtml } from './dex';
import { addRecent, loadRecent, loadView, removeRecent, saveRecent, saveView } from './dex-memory';
import {
  econBottomHtml, econPanelHtml, tameButtonHtml, marketModel, noteText, questChips, tameModel,
  tameRejectText, type TameModel, jigeListHtml, questBoxHtml, questBoxModel, questListHtml, questRows, huntRows, jigeRowsHtml, jigeReasons, type JigeList, type MarketModel,
} from './econ';
import {
  advanceReveal, gambleHistoryHtml, gambleInfoHtml, gambleRevealHtml, heldCoins, recordGamble,
  revealDisplay, revealResultAt, startReveal, type GambleHistoryEntry, type Reveal, type RevealDisplay,
} from './gamble';
import { el, focusedIn, onAction, refocusIn, setHtml } from './dom';
import { helperPopHtml } from './helper';
import { renderAlert, renderHud } from './hud';
import { PressConfirm } from './confirm';
import {
  activeNotice, boardMarks, boardUnits, dexBack, dexFold, dexGo, dexNavStart, dexToggle, roleList, MINE_KEYS, NO_MARKS, moveStep, nextCombines, nextPick, nextUnitId,
  pinnedTarget, rejectText, rowCells, selectedSlot, type DexNav, type MoveInput, type NextScope, type Notice,
} from './models';
import { renderBottom, renderRight, soloPanelHtml, unitDetailsHtml, upgradesHtml } from './panels';
import { resultHtml } from './result';
import { readHelpLine, settingsHtml, writeHelpLine } from './settings';
import { STORE_ALL_KEY, STORE_KEY, storageHtml, storageInfoHtml, storageInfoModel, wireStorage } from './storage';
import { readTarget, targetHtml, writeTarget } from './target';
import { closeSide, coveredIds, escStep, NO_SIDES, openSide, rightBarHtml, sidesLocked, toggleSide, type Side, type SideWin, type Sides } from './windows';

const UPGRADE_KEYS: Partial<Record<string, UpgradeId>> = {
  Digit1: 'physical', Digit2: 'magical', Digit3: 'polish',
};
const RENDER_MS = 100;
const NOTICE_MS = 1500;
const CONFIRM_SELL_GRADE = 3;
/** Economy notices stay a little longer than a refusal. */
const NOTE_MS = 2500;
const NOTE_TYPES: ReadonlySet<string> = new Set(['jigeSwap', 'questReward', 'tame', 'tameTry', 'hunt']);

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void; onHome?: () => void }

/** Settings window presses; the pressed choice keeps the focus after the redraw. */
const SETTING_ACTIONS: ReadonlySet<string> = new Set(['setHelper', 'speed', 'setFx', 'setHelp']);

/** Board and resource commands; blocked while the driver is read-only (spirit, or another lane on screen). */
const GAME_ACTIONS: ReadonlySet<string> = new Set([
  'summon', 'convert', 'combine', 'sell', 'upgrade', 'gambleCoins', 'gambleUnit', 'hunt', 'tame', 'jigeOpen', 'jigeSwap',
  'store', 'storeAll', 'retrieve', 'sellStored', 'sellStack',
]);
const PRESS_MS = 120;
const SIDES: readonly Side[] = ['left', 'right'];
/** The panel button that opens each side window; a window closed from inside gives the focus back to it. */
const OPENERS: Partial<Record<SideWin, string>> = {
  upgrades: '#right [data-action="openUpgrades"]',
  quests: '#right .quest-box > [data-action="openQuests"][data-arg=""]',
  market: '#right [data-action="toggleMarket"]',
  details: '#left [data-action="unitDetails"]',
  jige: '#left [data-action="jigeOpen"]',
};

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
  let noticeNarrow = false;
  // the dex keeps its filters, search and recent searches across openings (and, in localStorage, across visits)
  let dex: DexNav = { ...dexNavStart(), ...loadView() };
  let dexRecent = loadRecent();
  const dexRemember = () => saveView({ filter: dex.filter, kind: dex.kind, role: dex.role, query: dex.query, adv: dex.adv, skill: dex.skill, mine: dex.mine });
  const dexSearched = (term: string) => { dexRecent = addRecent(dexRecent, term); saveRecent(dexRecent); };
  // the list the dex scroll position belongs to: a new filter or search starts at the top
  let dexListKey = '';
  // solo left panel: the list scope follows the selection (see syncSelection); idleList is the settings row
  let scope: NextScope = 'all';
  let idleList = true;
  let skillOpen = false;
  let showAllOne = false;
  let lastSelectedId: number | null = null;
  // the row W picked and the unit it selected for it; any other selection drops it (render)
  let wPick: { result: string; unitId: number } | null = null;
  // the next-list row under the mouse (left panel or online helper); render drops it once the row is gone
  let hoverRow: string | null = null;
  // press-to-move: the id of the selected unit waiting for the cell to move to; any other selection drops it (render)
  let movingId: number | null = null;
  const isMoving = () => movingId !== null && movingId === scene.selectedId && selectedSlot(driver.state, movingId) !== null;
  /** Applies a board press, M or Esc to the selection and the moving state (see moveStep). */
  function stepMove(input: MoveInput): void {
    const s = driver.state;
    const step = moveStep(s, selectedSlot(s, scene.selectedId), isMoving(), input);
    if (step.move) {
      // paused or watching, nothing is sent and the unit keeps waiting for a cell
      if (driver.paused || driver.readOnly) return;
      driver.queue({ type: 'move', ...step.move });
    }
    if (step.select !== undefined) scene.selectedId = step.select === null ? null : s.slots[step.select]?.id ?? null;
    movingId = step.moving && !driver.readOnly ? scene.selectedId : null;
  }
  function syncSelection(id: number | null): void {
    if (id === lastSelectedId) return;
    lastSelectedId = id;
    scope = id === null ? 'all' : 'unit';
    skillOpen = false;
    showAllOne = false;
  }
  // solo: P pauses until P again; the open dex pauses on top of that without touching the P state
  let userPaused = false;
  // the hotkey line under the board (단축키 안내 줄 in the settings window)
  let helpLine = readHelpLine();
  let modal: 'dex' | 'menu' | 'forfeit' | 'settings' | null = null;
  let sides: Sides = NO_SIDES;
  // online Q: the left window beside the board, or laid over the six rows when the windows sit on the board
  const helperOpen = () => sides.left === 'helper';
  const locked = () => sidesLocked({
    locking: modal !== null || (!online && driver.state.phase === 'ended'),
    paused: !online && userPaused,
    scene: driver.state.phase === 'ended',
    portrait: false,
    failed: driver.failed,
  });
  // the J list row to bring into view (a chip or a box line opened it); shownQuest is the row last scrolled to
  let questFocus: QuestId | 'hunts' | null = null;
  let shownQuest: QuestId | 'hunts' | null = null;
  let shownModal: string | null = null;
  // the open R list (sides.left 'jige'); see jigeStale for when a pick is dropped
  let jigeList: JigeList | null = null;
  let best: { id: string; grade: number } | null = null;
  let notice: Notice | null = null;
  // the pillar market folds 최근 결과 to one line; this is whether it was pressed open
  let historyOpen = false;
  let reveal: Reveal | null = null;
  let shownReveal: RevealDisplay | null = null;
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
    if (sides.right !== 'market' || !econ()?.market?.gamble || (reveal && reveal.phase !== 'result')) return;
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
  for (const id of ['econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) {
    if (document.getElementById(id)) continue;
    const node = document.createElement('div');
    node.id = id;
    el('stage').append(node);
  }
  for (const side of SIDES) {
    if (document.getElementById(`win-${side}`)) continue;
    const node = document.createElement('div');
    node.id = `win-${side}`;
    node.className = 'win-box';
    el('stage').insertAdjacentElement(side === 'left' ? 'beforebegin' : 'afterend', node);
  }
  const rightBox = el('win-right');
  const marketPanel = () => rightBox.querySelector<HTMLElement>('.econ-panel');

  function inspectMarket(event: Event): void {
    const target = event.target as Element;
    if (!target.closest('.econ-panel')) return;
    const item = target.closest<HTMLElement>('[data-market-item]')?.dataset.marketItem;
    if (!item || item === marketItem) return;
    marketItem = item;
    renderMarketInfo();
  }
  rightBox.addEventListener('pointerover', event => { if (event.pointerType !== 'touch') inspectMarket(event); });
  rightBox.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !(event.target as Element).closest('.gamble-buy')) inspectMarket(event);
  });
  rightBox.addEventListener('focusin', inspectMarket);
  rightBox.addEventListener('click', event => {
    if (!(event.target as Element).closest('.gamble-buy')) inspectMarket(event);
  });

  function renderMarketInfo(): void {
    const info = marketPanel()?.querySelector<HTMLElement>('#gamble-info');
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
    const previousSides = sides;
    const focusSide = focusedSide();
    switch (action) {
      case 'summon':
        // online the press shows at once; the driver does not send it when no summon is left
        driver.queue({ type: 'summon' });
        if (online) pressSummon();
        break;
      case 'convert': driver.queue({ type: 'convertToken' }); break;
      case 'combine': {
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
      case 'sellStack':
        // the strip sits next to where a stack is grabbed: the first press only arms it
        if (confirm.press(`sellStored:${arg}`, performance.now())) driver.queue({ type: 'sellStored', defId: arg });
        break;
      case 'closeStorageInfo': inspectedStack = null; break;
      case 'pinTarget':
        if (modal === 'dex') dex = { ...dex, ...typedNow() };
        targetId = targetId === arg ? null : arg;
        writeTarget(opts.targetKey, targetId);
        targetFolded = false;
        break;
      case 'foldTarget': targetFolded = !targetFolded; break;
      case 'clearTarget': targetId = null; writeTarget(opts.targetKey, null); break;
      case 'toggleMarket': sides = toggleSide(sides, 'market'); break;
      case 'marketHistory': historyOpen = !historyOpen; break;
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
      // online Q and the helper title flip it; the settings row sets it (solo: the list with nothing selected). Online it takes the left window's place.
      case 'toggleHelper': if (online) setHelper(!helperOpen()); break;
      case 'setHelper': if (online) setHelper(arg === 'on'); else idleList = arg === 'on'; break;
      case 'nextScope': {
        const next: NextScope = arg === 'unit' ? 'unit' : 'all';
        const id = selectedSlot(driver.state, scene.selectedId) === null ? null : scene.selectedId;
        syncSelection(id);
        if (next === scope || (next === 'unit' && id === null)) break;
        scope = next;
        // the result screen's 도우미 N회 counts how often the whole list was opened; online it counts opening the helper
        if (next === 'all' && !online && !driver.readOnly) driver.queue({ type: 'helperOpened' });
        break;
      }
      case 'nextMore': showAllOne = true; break;
      case 'skillOpen': skillOpen = !skillOpen; break;
      // the gear stays above the settings window, so a second press closes it
      case 'openSettings': modal = modal === 'settings' ? null : 'settings'; break;
      case 'support': opts.actions?.support(); break;
      case 'watch': opts.actions?.watch(Number(arg)); break;
      case 'openMenu': modal = 'menu'; break;
      case 'askForfeit': modal = 'forfeit'; break;
      case 'forfeit': opts.actions?.forfeit(); modal = null; break;
      case 'unitDetails': sides = openSide(sides, 'details'); break;
      case 'openDex': dex = { ...dex, back: [], focus: null, open: [], unfold: [] }; modal = 'dex'; break;
      case 'dexOpen':
        dex = { ...dexGo(driver.state.data, { ...dex, back: [], focus: null, open: [], unfold: [] }, arg, arg, driver.state), back: [] };
        modal = 'dex';
        break;
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
      case 'openUpgrades': sides = toggleSide(sides, 'upgrades'); break;
      case 'closeWin': if (arg === 'left' || arg === 'right') sides = closeSide(sides, arg); break;
      case 'openQuests':
        if (!econ()) break;
        // an open list stays open and only moves to the pressed row
        questFocus = (arg || null) as QuestId | 'hunts' | null;
        sides = openSide(sides, 'quests');
        break;
      case 'jigeOpen': {
        const e = econ();
        const [zone, ref = ''] = arg.split(':');
        const s = driver.state;
        const index = zone === 'board' ? selectedSlot(s, Number(ref)) ?? -1 : (s.storage ?? []).findIndex(u => u.defId === ref);
        const unit = (zone === 'board' ? s.slots : s.storage ?? [])[index];
        if (!e || !unit || (zone !== 'board' && zone !== 'storage')) break;
        if (e.jige < 1) { refuse(rejectText('noJige') ?? ''); break; }
        const source: JigeList['source'] = { zone, index, unitId: unit.id };
        jigeList = {
          source, defId: unit.defId, cost: unit.cost ?? null,
          seat: driver.laneSeat, epoch: driver.laneEpoch, name: '', type: null,
          reasons: jigeReasons(s, source, targetId),
        };
        sides = openSide(sides, 'jige');
        break;
      }
      case 'jigeType':
        if (jigeList) jigeList = { ...jigeList, type: arg === 'physical' || arg === 'magical' ? arg : null };
        break;
      case 'jigeSwap': {
        const list = jigeList;
        if (sides.left === 'jige') sides = closeSide(sides, 'left');
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
        break;
      case 'setHelp': helpLine = arg === 'on'; writeHelpLine(helpLine); break;
      case 'setFx': if ((arg === 'on') !== !!scene.reduceEffects) scene.setReduceEffects(arg === 'on'); break;
      case 'restart': hooks.onRestart?.(); break;
      case 'home': hooks.onHome?.(); break;
    }
    if (action.startsWith('dex')) dexRemember();
    // the cell a history row pointed at goes with the market, however it was closed or replaced
    if (previousSides.right === 'market' && sides.right !== 'market') marketCell?.remove();
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
    const focusRow = (action === 'dexGo' || action === 'dexBack' || action === 'dexOpen') && dex.focus !== null;
    if (focusRow && dex.focus) {
      revealDexRow(dex.focus);
      // the pressed link is gone with the redraw: keep the keyboard in the dex
      const row = el('modal').querySelector<HTMLElement>(`tr[data-dex-id="${dex.focus}"]`);
      (el('modal').querySelector<HTMLButtonElement>('.dex-back') ?? row?.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
      dex = { ...dex, focus: null };
    }
    if (focusSide) refocusOpener(focusSide, previousSides);
    if (modal && modal !== previousModal && !focusRow) (el('modal').querySelector<HTMLButtonElement>('[data-autofocus]') ?? el('modal').querySelector<HTMLButtonElement>('button'))?.focus();
  };

  function focusedSide(): Side | null {
    const active = document.activeElement;
    if (!active || active === document.body) return null;
    return SIDES.find(side => document.getElementById(`win-${side}`)?.contains(active)) ?? null;
  }
  /** The focus was in a side window that is now closed: hand it to the panel button that opens it, unless that is covered. */
  function refocusOpener(side: Side, before: Sides): void {
    const was = before[side];
    const selector = was && !sides[side] ? OPENERS[was] : undefined;
    const opener = selector ? document.querySelector<HTMLElement>(selector) : null;
    for (let node: HTMLElement | null = opener; node; node = node.parentElement) if (node.inert) return;
    opener?.focus({ preventScroll: true });
  }

  function setHelper(on: boolean): void {
    if (on === helperOpen()) return;
    if (!on) {
      sides = closeSide(sides, 'left');
      return;
    }
    sides = openSide(sides, 'helper');
    const id = selectedSlot(driver.state, scene.selectedId) === null ? null : scene.selectedId;
    syncSelection(id);
    scope = id === null ? 'all' : 'unit';
    if (!driver.readOnly) driver.queue({ type: 'helperOpened' });
  }

  for (const id of ['top', 'left', 'right', 'bottom', 'modal', 'error', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) onAction(el(id), act);
  // a press that reaches a locked box anyway (inert is not honoured everywhere) still buys nothing
  for (const side of SIDES) onAction(el(`win-${side}`), (a, g) => { if (!locked()) act(a, g); });
  // the storage column belongs to the own living lane; it takes presses while no locking window is open and no pillar covers it
  const storageVisible = () => !driver.readOnly && driver.state.phase !== 'ended';
  const storageLive = () => storageVisible() && !driver.failed && modal === null && !coveredIds(currentWins(), sides).includes('storage');
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
  // a hovered row lights its cells on the board; touch has no hover (selecting a unit shows its pairs instead)
  for (const id of ['left', 'win-left']) {
    el(id).addEventListener('pointerover', ev => {
      if (ev.pointerType === 'touch') return;
      const row = (ev.target as Element).closest<HTMLElement>('[data-recipe]')?.dataset.recipe ?? null;
      if (row === hoverRow) return;
      hoverRow = row;
      render();
    });
    el(id).addEventListener('pointerleave', () => {
      if (hoverRow === null) return;
      hoverRow = null;
      render();
    });
  }
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
  scene.onSelect((slot, how = 'tap') => {
    if (modal || driver.failed || driver.state.phase === 'ended') return;
    inspectedStack = null;
    if (how === 'cancel') stepMove({ kind: 'cancel' });
    else if (how === 'press' && slot !== null) stepMove({ kind: 'press', slot });
    else if (how === 'again' && slot !== null) stepMove({ kind: 'again', slot });
    else stepMove({ kind: 'tap', slot });
    render();
  });
  driver.onRemap?.(ids => {
    const next = scene.selectedId === null ? undefined : ids.get(scene.selectedId);
    if (next === undefined) return;
    if (movingId === scene.selectedId) movingId = next;
    scene.selectedId = next;
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
      if (!NOTE_TYPES.has(event.type) || driver.readOnly) continue;
      const text = noteText(event as EconNote, driver.state.data);
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

  /** The quest box at the bottom of the right panel, the same short box solo and online; empty without an economy. */
  function questBox(): string {
    const e = driver.state.phase === 'ended' ? null : econ();
    return e ? questBoxHtml(questBoxModel(e, driver.state, online)) : '';
  }

  function jigeStale(list: JigeList): boolean {
    const s = driver.state;
    const unit = (list.source.zone === 'board' ? s.slots : s.storage ?? [])[list.source.index];
    return driver.readOnly || driver.laneSeat !== list.seat || driver.laneEpoch !== list.epoch
      || !unit || unit.id !== list.source.unitId || unit.defId !== list.defId;
  }
  // the R list filters as one types; only the rows are redrawn so the box keeps its text, caret and IME state
  el('win-left').addEventListener('input', ev => {
    const input = (ev.target as HTMLElement).closest<HTMLInputElement>('.jige-search input');
    if (!input || !jigeList) return;
    jigeList = { ...jigeList, name: input.value };
    setHtml(el('win-left').querySelector<HTMLElement>('.jige-rows')!, jigeRowsHtml(driver.state.data, jigeList));
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
      // a locking window first, then the last side window opened, then a waiting move, then the selection
      const step = escStep({ scene: false, locking: modal !== null, sidesLocked: locked(), sides });
      if (step === 'locking') act('closeModal', '');
      else if (step === 'left' || step === 'right') act('closeWin', step);
      else {
        if (!isMoving()) inspectedStack = null;
        stepMove({ kind: 'cancel' });
        render();
      }
      return;
    }
    if (modal === 'dex' && ev.code === 'KeyD') { act('closeModal', ''); return; }
    if (online && modal === 'settings' && ev.code === 'KeyQ' && !ev.shiftKey && driver.state.phase !== 'ended') { act('toggleHelper', ''); return; }
    if (modal || driver.state.phase === 'ended') return;
    // side-window keys do nothing under a lock (P pause too), so a paused board buys nothing
    const buy = UPGRADE_KEYS[ev.code];
    const quests = ev.code === 'KeyJ' && !!driver.state.data.economy;
    const market = ev.code === 'KeyB' && !!driver.state.data.economy?.market;
    const jige = ev.code === 'KeyR' && !!driver.state.data.economy?.market;
    const helperKey = online && ev.code === 'KeyQ';
    const card = displayedCard;
    if (ev.code === 'Tab') {
      // on a window or panel button Tab moves the focus as usual; elsewhere it opens and closes the selected unit's 상세
      if (target?.closest?.('button, .gamble-option[tabindex]')) return;
      ev.preventDefault();
      if (locked()) return;
      if (sides.left === 'details') act('closeWin', 'left');
      else if (card?.unitId != null) act('unitDetails', '');
      return;
    }
    if (ev.code === 'KeyE' || buy || quests || market || jige || helperKey) {
      if (locked()) return;
      // online Q opens and closes the helper, so Shift+Q flips its scope while it is open
      if (helperKey) {
        if (!ev.shiftKey) act('toggleHelper', '');
        else if (helperOpen()) {
          syncSelection(scene.selectedId);
          act('nextScope', scope === 'unit' ? 'all' : 'unit');
        }
        return;
      }
      if (jige) {
        if (sides.left === 'jige') act('closeWin', 'left');
        else if (card?.unitId != null) act('jigeOpen', `board:${card.unitId}`);
        return;
      }
      if (ev.code === 'KeyE') { act('openUpgrades', ''); return; }
      if (market) { act('toggleMarket', ''); return; }
      // J opens the quest list from preparation on and closes it again; the clock never stops for it
      if (quests) { act(sides.right === 'quests' ? 'closeWin' : 'openQuests', sides.right === 'quests' ? 'right' : ''); return; }
      if (sides.right === 'upgrades') { act('upgrade', buy!); return; }
    }
    if (ev.code === 'Space' && target?.closest?.('button, .gamble-option[tabindex]')) return;
    if (ev.code === 'Space') { ev.preventDefault(); act('summon', ''); }
    else if (ev.code === 'KeyD') act('openDex', '');
    else if (ev.code === 'KeyQ') {
      // solo Q is the scope key and Shift+Q does nothing
      if (ev.shiftKey) return;
      if (selectedSlot(driver.state, scene.selectedId) !== null) {
        syncSelection(scene.selectedId);
        act('nextScope', scope === 'unit' ? 'all' : 'unit');
      }
    }
    else if (ev.code === `Key${STORE_ALL_KEY}`) act('storeAll', '');
    else if (ev.code === 'KeyT' && driver.state.data.economy?.tame) act('tame', '');
    else if (ev.code === 'KeyP' && !online) { userPaused = !userPaused; render(); }
    else if (ev.code === 'KeyM') {
      if (selectedSlot(driver.state, scene.selectedId) === null) return;
      stepMove({ kind: 'toggle' });
      render();
    }
    else if (ev.code === 'KeyW') {
      ev.preventDefault();
      const s = driver.state;
      const pick = ev.shiftKey ? null : nextPick(s, nextCombines(s, { target: targetId }), wPick?.result ?? null);
      const id = pick ? s.slots[pick.slot]?.id ?? null : null;
      if (pick && id !== null) {
        scene.selectedId = id;
        wPick = { result: pick.result, unitId: id };
      } else {
        scene.selectedId = nextUnitId(s, scene.selectedId);
        wPick = null;
      }
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
    // design ⑰: the end of the game closes a locking window, whose choices no longer mean anything; side windows only lock
    if (s.phase === 'ended' && modal) {
      if (modal === 'dex') dexRemember();
      modal = null;
    }
    // commands wait for ticks, so only the dex (which sends none) stops the clock
    if (!online) driver.paused = userPaused || (modal === 'dex' && s.phase !== 'ended');
    const selected = selectedSlot(s, scene.selectedId);
    if (selected === null) scene.selectedId = null;
    if (wPick && scene.selectedId !== wPick.unitId) wPick = null;
    if (!isMoving()) movingId = null;
    scene.moving = movingId !== null;
    syncSelection(scene.selectedId);
    const held = s.data.economy?.market ? econ()?.jige : undefined;
    // the unit an open R list was opened on moved, sold or the lane changed: the list goes, nothing is sent
    if (sides.left === 'jige' && (!jigeList || jigeStale(jigeList))) {
      if (jigeList) say('유닛이 바뀌어 지게 목록을 닫았습니다', NOTE_MS);
      sides = closeSide(sides, 'left');
    }
    if (sides.left !== 'jige') jigeList = null;
    const now = performance.now();
    const view = online && opts.data ? opts.view?.() ?? null : null;
    const info = selected === null && storageVisible() ? storageInfoModel(s, inspectedStack) : null;
    if (!info) inspectedStack = null;
    const infoHtml = info ? storageInfoHtml(s, info) : '';
    const list = nextCombines(s, { target: targetId, slot: selected, scope });
    const listShown = view && opts.data ? helperOpen() : s.phase !== 'ended' && !infoHtml;
    const hovered = (listShown && list.rows.find(r => r.result === hoverRow)) || null;
    if (!hovered) hoverRow = null;
    // Z/X/C keys come from the selected unit's own list whatever scope the panel shows
    const keyList = selected === null || scope === 'unit' ? list : nextCombines(s, { target: targetId, slot: selected });
    const marks = driver.readOnly || s.phase === 'ended' ? NO_MARKS : {
      ...boardMarks(s, keyList, selected),
      // a row the selected unit is not in combines without it (its button sends no slot)
      focus: hovered ? rowCells(s, hovered.result, hovered.uses ? selected : null) : null,
    };
    scene.boardMarks = marks;
    const target = targetId && pinnedTarget(
      s.data, targetId, driver.readOnly && view ? view.mine.units : s.slots, driver.readOnly && view ? view.mine.storage : s.storage, s,
    );
    setHtml(el('target-overlay'), target && s.phase !== 'ended' ? targetHtml(target, targetFolded) : '');
    el('stage').classList.toggle('has-target', !!el('target-overlay').firstChild);
    const leftFocus = focusedIn(el('left'));
    // design ⑩: beside the board the helper is the left window and the six rows stay in view
    const helperFrame = currentWins() === 'outside' ? 'win' : 'pop';
    let helperWin = '';
    if (view && opts.data) {
      renderTop(view, opts.data);
      const helper = helperOpen() ? helperPopHtml(s, list, {
        unitId: selected === null ? null : s.slots[selected]?.id ?? null, scope, wPick: wPick?.result ?? null, hover: hoverRow, showAllOne,
      }, helperFrame) : '';
      if (helperFrame === 'win') helperWin = helper;
      renderRows(view, opts.data, helperFrame === 'win' ? '' : helper, flashingSeats(now));
      renderAlert(s);
    } else {
      renderHud(s, driver.paused, activeNotice(notice, now));
      setHtml(el('left'), s.phase === 'ended' ? '' : infoHtml || soloPanelHtml(s, {
        selected, list, idleList, wPick: wPick?.result ?? null, hover: hoverRow, showAllOne, skillOpen, jige: held, sellArmed: sellArmed(s, selected),
      }));
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
        ...(s.data.economy?.market ? { market: sides.right === 'market' } : {}),
        quests: questBox(),
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
    } else displayedCard = renderBottom(s, selected, online, helpLine ? (s.data.economy?.market ? 'B 장터' : undefined) : null, held, sellArmed(s, selected), targetId, movingId !== null);
    setHtml(el('storage'), storageVisible() ? storageHtml(
      s, held, defId => confirm.armed(`sellStored:${defId}`, now), info ? info.defId : null, new Map(marks.stored.map(p => [p.defId, p.key])),
    ) : '');
    if (sides.left === 'details' && (selected === null || spiritCard)) sides = closeSide(sides, 'left');
    // online the team result screen (Task 19) replaces the 1-player result window
    const soloResult = !online && s.phase === 'ended';
    const lockOpen = modal !== null || soloResult;
    const wins = currentWins();
    renderSides(s, wins, selected, helperWin);
    const covered = coveredIds(wins, sides);
    const leftCovered = covered.includes('left');
    // design ⑤: a pillar over the left panel leaves no focus behind it, or Space would press the hidden button
    if (leftCovered) {
      const active = document.activeElement as HTMLElement | null;
      if (active && (el('left').contains(active) || el('storage').contains(active))) active.blur();
    }
    scene.storageCovered = covered.includes('storage');
    const narrow = covered.length > 0;
    el('stage').classList.toggle('pillar-open', narrow);
    if (narrow !== noticeNarrow) {
      noticeNarrow = narrow;
      scene.setNoticeSpan?.(narrow);
    }
    for (const id of ['top', 'left', 'right', 'bottom', 'lane', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) {
      el(id).inert = lockOpen || covered.includes(id);
    }
    const sideLock = locked();
    for (const side of SIDES) {
      const box = el(`win-${side}`);
      box.inert = sideLock;
      box.classList.toggle('locked', sideLock);
    }
    if (!lockOpen && !leftCovered) refocusIn(el('left'), leftFocus, '.nc-list');
    // a redraw of the dex (a board change moves the tree marks) keeps its scroll position
    const dexShown = !soloResult && modal === 'dex';
    const listKey = `${dex.filter}
${dex.kind}
${dex.role}
${dex.query}
${dex.skill}
${dex.mine.join()}`;
    const keepTop = dexShown && dexListKey === listKey ? dexScroller()?.scrollTop ?? 0 : 0;
    setHtml(el('modal'), soloResult ? resultHtml(s, best?.id ?? null) : modal === 'menu' || modal === 'forfeit' ? menuHtml(modal, !!view && spiritModel(view) !== null) : modal === 'settings' ? settingsHtml({ helper: online ? helperOpen() : idleList, solo: !online, reducedFx: !!scene.reduceEffects, help: helpLine, ...(driver.speed !== undefined ? { speed: driver.speed } : {}) }) : dexShown ? dexHtml(s.data,  dex.filter, dex.query, s.round, { back: dex.back, open: dex.open, board: boardUnits(s), unfold: dex.unfold, recent: dexRecent, adv: dex.adv, state: s, target: targetId }, { kind: dex.kind, role: dex.role, skill: dex.skill, mine: dex.mine }) : '');
    if (dexShown) {
      const box = dexScroller();
      if (box && box.scrollTop !== keepTop) box.scrollTop = keepTop;
    }
    if (modal === 'settings' && !soloResult) wireAudioSettings(el('modal'));
    if (shownModal === 'settings' && (modal !== 'settings' || soloResult)) gameAudio.previewTrack();
    shownModal = modal;
    dexListKey = dexShown ? listKey : '';
    hooks.onRender?.();
  }

  /** Draws each side window into its box as a non-modal dialog named by its head title. */
  function renderSides(s: GameState, wins: WinPlace, selected: number | null, helperWin: string): void {
    const e = econ();
    shownMarket = sides.right === 'market' && e ? marketModel(e, s) : null;
    if ((sides.right === 'quests' && !e) || (sides.right === 'market' && !shownMarket)) sides = closeSide(sides, 'right');
    const held = heldCoins(reveal);
    const right = sides.right === 'upgrades' ? { cls: 'upgrades', html: upgradesHtml(s, wins, held) }
      : sides.right === 'quests' && e ? {
        cls: 'quest-modal',
        html: questListHtml(questRows(e, s, online), questFocus, huntRows(e, s), { wins, bar: rightBarHtml(s, held) }),
      } : null;
    const section = (side: Side, w: { cls: string; html: string } | null) =>
      (w ? `<section class="win ${w.cls}" role="dialog" aria-labelledby="win-${side}-title">${w.html}</section>` : '');
    const leftBox = el('win-left');
    const leftMark = focusedIn(leftBox);
    setHtml(leftBox, sides.left === 'details' && selected !== null ? unitDetailsHtml(s, selected, targetId)
      : sides.left === 'helper' ? helperWin
      : section('left', sides.left === 'jige' && jigeList ? { cls: 'jige-modal', html: jigeListHtml(s.data, jigeList, e?.jige ?? 0) } : null));
    refocusIn(leftBox, leftMark, '.win-close');
    const active = document.activeElement as HTMLElement | null;
    const inMarket = !!active && !!marketPanel()?.contains(active);
    const marketFocus = inMarket ? active!.dataset.marketFocus : undefined;
    const marketMark = inMarket ? focusedIn(rightBox) : null;
    const folded = wins === 'inside' && !historyOpen;
    setHtml(rightBox, shownMarket ? econPanelHtml(shownMarket, shownReveal, driver.readOnly, {
      wins, bar: rightBarHtml(s, held), historyOpen, historyCount: gambleHistory.length,
    }) : section('right', right));
    const panel = marketPanel();
    if (panel) {
      // these parts change on their own clock (reveal frames, settled draws), so they redraw in place
      const wallet = panel.querySelector<HTMLElement>('.gamble-wallet');
      if (wallet) setHtml(wallet, `엽전 <b>${s.coins - held}</b> · 묵 <b>${s.buckwheat}</b>`);
      renderMarketInfo();
      const result = panel.querySelector<HTMLElement>('.gamble-result');
      const history = panel.querySelector<HTMLElement>('.gamble-history');
      if (result) setHtml(result, gambleRevealHtml(shownReveal));
      if (history) setHtml(history, gambleHistoryHtml(gambleHistory, s, wins === 'inside' ? { folded } : undefined));
      if (inMarket && !panel.contains(active)) {
        const next = marketFocus ? panel.querySelector<HTMLElement>(`[data-market-focus="${marketFocus}"]:not(:disabled)`) : null;
        if (next) next.focus({ preventScroll: true });
        else refocusIn(panel, marketMark, '.win-close');
      }
    }
    const row = sides.right === 'quests' ? questFocus : null;
    if (row && row !== shownQuest) el('win-right').querySelector<HTMLElement>(`.quest-row[data-quest="${row}"]`)?.scrollIntoView?.({ block: 'nearest' });
    shownQuest = row;
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
   * Stage 3 economy: the gamble reveal the B window shows, prompts over the top of the lane, the tracker under it.
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
    shownReveal = display;
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
    scope = 'all';
    hoverRow = null;
    movingId = null;
    lastSelectedId = null;
    skillOpen = false;
    showAllOne = false;
    banner = null;
    modal = null;
    sides = NO_SIDES;
    best = null;
    notice = null;
    historyOpen = false;
    reveal = null;
    shownReveal = null;
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
