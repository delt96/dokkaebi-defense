import {
  birthOf, laneOf, pickStored, unitDefFast, type ClientView, type Command, type EconMine, type EconNote, type GameData, type GameEvent, type GameState, type GambleCommand, type QuestId, type RowView, type UpgradeId,
} from '@dorandi/logic';
import { SPEEDS, type Driver } from '../driver';
import { isTypingTarget } from '../online/entry';
import {
  arrivalModel, CAUSE_TEXT, fallenSeats, gateCountdown, gateDeadlineRound, returnedSeats, rightNotices, STAGE_NAME, supportCount, type GateCountdown,
} from '../online/models';
import { arrivalHtml, countdownHtml, renderRows, renderTop, type RowMarks } from '../online/panels';
import { menuHtml, spiritCardHtml, spiritModel, survivorsHtml, survivorsModel } from '../online/spirit';
import type { LaneScene } from '../LaneScene';
import { cellCorner, cellPx, CENTER_X, CENTER_Y, NOTICE_SPAN, type WinPlace } from '../layout';
import { currentWins } from '../fit';
import { gameAudio } from '../audio/engine';
import { wireAudioSettings } from '../audio/settings-ui';
import { playGamblePress, playGambleResult } from '../sfx';
import { BIRTH_MS, BirthHold, FirstSix, birthBanner, birthLine, birthSource, type BirthAlert } from './birth';
import { dexHtml } from './dex';
import { addRecent, loadRecent, loadView, removeRecent, saveRecent, saveView } from './dex-memory';
import {
  econBottomHtml, econPanelHtml, tameButtonHtml, marketModel, noteText, questChips, tameModel,
  tameRejectText, type TameModel, jigeListHtml, questBoxHtml, questBoxModel, questListHtml, questRows, huntRows, jigeRowsHtml, jigeReasons, type JigeList, type MarketModel, type MarketTab,
} from './econ';
import {
  advanceReveal, gambleHistoryHtml, gambleRevealHtml, heldCoins, recordGamble,
  revealDisplay, revealResultAt, startReveal, type GambleHistoryEntry, type Reveal, type RevealDisplay,
} from './gamble';
import { el, esc, focusedIn, onAction, refocusIn, setHtml } from './dom';
import { helperPopHtml } from './helper';
import { markHover } from './next-list';
import { edgeLevel, renderAlert, renderHud } from './hud';
import {
  coinSpot, END_SCENE_SUB, EndScene, endSceneText, loopOwner, OneShots, refusalPos, refusalSpot, TopSlot, type EndKind, type RefusalSpot, type SlotItem, type SlotShown,
} from './signals';
import { PressConfirm } from './confirm';
import {
  boardMarks, hudModel, boardUnits, dexBack, dexFold, dexGo, dexNavStart, dexToggle, roleList, MINE_KEYS, NO_MARKS, moveStep, nextCombines, nextPick, nextUnitId,
  pinnedTarget, rejectText, rowCells, selectedSlot, type DexNav, type MoveInput, type NextScope,
} from './models';
import { renderBottom, renderRight, soloPanelHtml, unitDetailsHtml, upgradesHtml } from './panels';
import { resultHtml, soloCaption } from './result';
import { captureDate, captureLane } from './capture';
import { readHelpLine, settingsHtml, writeHelpLine } from './settings';
import { STORE_ALL_KEY, STORE_KEY, storageHtml, storageInfoHtml, storageInfoModel, wireStorage } from './storage';
import { readTarget, targetHtml, writeTarget } from './target';
import { closeSide, coveredIds, escStep, NO_SIDES, openSide, portraitGuide, rightBarHtml, sidesLocked, soloPause, toggleSide, type Side, type SideWin, type Sides } from './windows';
import { soloMenuHtml } from './solo-menu';
import { PORTRAIT_TITLE, portraitText } from './first-visit';
import {
  actionOf, assignNumKey, clearAction, DEFAULT_NUM_KEYS, numKeyAskHtml, numKeyName, numKeyOfCode, parseNumKeyAction, readNumKeys, splitAction, writeNumKeys,
  type NumKeyAction, type NumKeyMap,
} from './numkeys';

const RENDER_MS = 100;
const NOTICE_MS = 1500;
const BANNER_MS = 1800;
/** The slot's words fade out over this long before their time is up (CSS .out). */
const SLOT_OUT_MS = 110;
/** Design ⑪: the countdown box fades out over 140 ms, ⑬ over 110 ms (CSS #round-banner.k-countdown.out, #gate-near.out). */
const COUNTDOWN_OUT_MS = 140;
const NEAR_OUT_MS = 110;
/** The countdown number swells once a second from this many seconds left. */
const PULSE_FROM = 5;
const DEADLINE_TAIL = ' · 관문 마감';
/** Design ⑫: the result screen or window fades in over this long after the end scene (CSS :root[data-end-cover]). */
const COVER_MS = 240;
/** Design ⑮: a fallen row flashes (or stays red) this long, its notice holds the slot for FALLEN_NOTE_MS; ⑯ 돌아옴 for RETURNED_MS. */
const FALLEN_MS = 1000;
const FALLEN_NOTE_MS = 3000;
const RETURNED_MS = 2000;
/** Design ㉑: the coin number stays gold 700 ms and turns back over 300 ms (CSS .coin-glow); "+5" rises for 800 ms (CSS .coin-float). */
const COIN_GLOW_MS = 1000;
const COIN_FLOAT_MS = 800;
const COIN_NOTE_MS = 3000;
const CONFIRM_SELL_GRADE = 3;
/** Economy notices stay a little longer than a refusal. */
const NOTE_MS = 2500;
const SLOT_KINDS = ['banner', 'fallen', 'note', 'birth', 'countdown'] as const;
const NOTE_TYPES: ReadonlySet<string> = new Set(['jigeSwap', 'questReward', 'tame', 'tameTry', 'hunt', 'itemBought', 'itemAttached']);

/** The data-arg of the button that sends `cmd`, for the refusal box over it (signals.ts refusalSpot). */
function refusalArg(cmd: Command, state: GameState): string | undefined {
  switch (cmd.type) {
    case 'upgrade': return cmd.id;
    case 'buyItem': return cmd.item;
    case 'attachItem': return cmd.unitId === undefined ? undefined : `${cmd.item}@${cmd.unitId}`;
    case 'combine': {
      if (cmd.slot === undefined) return cmd.result;
      const id = state.slots[cmd.slot]?.id;
      return id === undefined ? undefined : `${cmd.result}@${id}`;
    }
    default: return undefined;
  }
}

/** The economy message for a solo or streamed event, or null for events that show none. */
export function econNoteText(event: GameEvent, data: GameData): string | null {
  return NOTE_TYPES.has(event.type) ? noteText(event as EconNote, data) : null;
}

export interface UiHooks { onEvents?: (events: GameEvent[]) => void; onRender?: () => void; onRestart?: () => void; onHome?: () => void }

/** Settings window presses; the pressed choice keeps the focus after the redraw. */
const SETTING_ACTIONS: ReadonlySet<string> = new Set(['setHelper', 'speed', 'setFx', 'setHelp', 'numKeysFold', 'numKeysReset']);

/** Board and resource commands; blocked while the driver is read-only (spirit, or another lane on screen). */
const GAME_ACTIONS: ReadonlySet<string> = new Set([
  'summon', 'convert', 'combine', 'storageCombine', 'sell', 'upgrade', 'gambleCoins', 'gambleUnit', 'hunt', 'tame', 'jigeOpen', 'jigeSwap',
  'store', 'storeAll', 'retrieve', 'sellStored', 'sellStack', 'buyItem', 'attachItem',
]);
const PRESS_MS = 120;
/** The refusal box fades in for 120 ms, then shakes for 160 ms; it fades out over its last 80 ms (CSS .refusal). */
const REFUSAL_MOTION_MS = 280;
const REFUSAL_OUT_MS = 80;
const PAUSED_TEXT = '멈춤 중입니다 · P로 계속';
/** The command a pressed action sends, so a refusal while paused finds the same button a refused command would. */
const COMMAND_OF: Partial<Record<string, string>> = { summon: 'summon', convert: 'convertToken', sell: 'sell', upgrade: 'upgrade', storageCombine: 'combine' };
const SIDES: readonly Side[] = ['left', 'right'];
/** The panel button that opens each side window; a window closed from inside gives the focus back to it. */
const OPENERS: Partial<Record<SideWin, string>> = {
  upgrades: '#right [data-action="openUpgrades"]',
  quests: '#right .quest-box > [data-action="openQuests"][data-arg=""]',
  market: '#right [data-action="toggleMarket"]',
  details: '#left [data-action="unitDetails"]',
  jige: '#left [data-action="jigeOpen"]',
};

/** Online screens also read the server view for the scoreboard and the two-line top bar. `support()` with no target sends to the watched lane. */
export interface OnlineActions { support(target?: number): void; watch(seat: number): void; forfeit(): void }
export interface MountOpts { online?: boolean; view?: () => ClientView | null; data?: GameData; actions?: OnlineActions; targetKey?: string }

export function mountUi(driver: Driver, scene: LaneScene, hooks: UiHooks = {}, opts: MountOpts = {}): { resetUi: () => void; afterEndScene: (cb: () => void) => void } {
  const online = opts.online === true;
  scene.selectedId = null;
  let displayedCard: ReturnType<typeof renderBottom> | null = null;
  let inspectedStack: string | null = null;
  let targetId = readTarget(opts.targetKey);
  let targetFolded = false;
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
  // the over-limit cue rings on the step into over, not on every frame while over
  let wasOver = false;
  // the hotkey line under the board (단축키 안내 줄 in the settings window)
  let helpLine = readHelpLine();
  let numKeys: NumKeyMap = readNumKeys();
  // the settings window's 숫자키 list; folded again when the page loads
  let numKeysOpen = false;
  // the Ctrl+click question: the market or 강화 item waiting for its key
  let keyAsk: NumKeyAction | null = null;
  let modal: 'dex' | 'menu' | 'forfeit' | 'settings' | 'restartAsk' | 'homeAsk' | null = null;
  let sides: Sides = NO_SIDES;
  // design ⑫: the end scene runs once, when this screen sees the game end; a screen mounted on an ended game (a rejoin) skips it
  const endScene = new EndScene();
  const endedNow = () => (online ? !!opts.view?.()?.result : driver.state.phase === 'ended');
  let endSeen = endedNow();
  let sceneRunning = false;
  let afterScene: (() => void)[] = [];
  let coverUntil = 0;
  // online Q: the left window beside the board, or laid over the six rows when the windows sit on the board
  const helperOpen = () => sides.left === 'helper';
  let guideOn = false;
  // 이대로 보기 lasts for the page: resetUi must not clear it
  let guideDismissed = false;
  const locked = () => sidesLocked({
    locking: modal !== null || (!online && driver.state.phase === 'ended'),
    paused: !online && userPaused,
    scene: driver.state.phase === 'ended' || sceneRunning,
    portrait: guideOn,
    failed: driver.failed,
  });
  // a lock hides the pillar boxes under the board, so the panels under them are in view and live again
  const coveredNow = (wins: WinPlace) => locked() ? [] : coveredIds(wins, sides);
  // the J list row to bring into view (a chip or a box line opened it); shownQuest is the row last scrolled to
  let questFocus: QuestId | 'hunts' | null = null;
  let shownQuest: QuestId | 'hunts' | null = null;
  let shownModal: string | null = null;
  // the open R list (sides.left 'jige'); see jigeStale for when a pick is dropped
  let jigeList: JigeList | null = null;
  let best: { id: string; grade: number } | null = null;
  let refusal: { spot: Exclude<RefusalSpot, { at: 'slot' }>; text: string; until: number; node: HTMLElement | null } | null = null;
  const oneShots = new OneShots();
  // design ㉑: the received supports already shown, and the light on the coin number in view (or none: the slot said it)
  let seenSupports = supportCount();
  let coinFx: { spot: 'right' | 'win'; until: number; float: { start: number; text: string; node: HTMLElement | null } | null } | null = null;
  // the pillar market folds 최근 결과 to one line; this is whether it was pressed open
  let historyOpen = false;
  // stage 3: the market window's tab (draws or the item shop); opening the window starts on the draws
  let marketTab: MarketTab = 'market';
  // online: the unit whose 아이템 ▾ list is open under the board
  let itemMenuId: number | null = null;
  let reveal: Reveal | null = null;
  let shownReveal: RevealDisplay | null = null;
  let revealEpoch = driver.laneEpoch;
  // S on grade 3+ and T take a second press within 2 seconds
  const confirm = new PressConfirm();
  const sellArmed = (s: GameState, slot: number | null) => slot !== null && !!s.slots[slot] && confirm.armed(`sell:${s.slots[slot]!.id}`, performance.now());
  let shownMarket: MarketModel | null = null;
  let gambleHistory: GambleHistoryEntry[] = [];
  let pendingGambles: { receipt: GambleHistoryEntry; visibleAt: number }[] = [];
  let marketCell: HTMLElement | null = null;

  function gamble(cmd: GambleCommand): void {
    const g = econ()?.market?.gamble;
    if (!g || (reveal && reveal.phase !== 'result')) return;
    // a number key reaches here with the market closed or its button locked, so a known refusal is said instead of rolling
    const table = cmd.type === 'gambleUnit' ? g.units.tables[cmd.table] : undefined;
    const why = cmd.type === 'gambleCoins' ? g.coins.stakes.find(s => s.price === cmd.stake)?.why : table?.why;
    if (why) {
      const text = why === 'gambleRound' && table ? `큰 보따리는 ${table.fromRound}라운드부터입니다` : rejectText(why);
      if (text) refuse(text, { type: cmd.type, arg: cmd.type === 'gambleCoins' ? String(cmd.stake) : cmd.table });
      return;
    }
    playGamblePress(cmd.type);
    reveal = startReveal(performance.now());
    driver.queue(cmd);
  }

  driver.onGambleNotice?.(text => scene.showGambleNotice(text));
  const births = new BirthHold();
  const firstSix = new FirstSix();
  const flashUntil = new Map<number, number>();
  // design ⑲: another player's birth shows on their row only (the row text is drawn from this)
  const peerBirth = new Map<number, { name: string; hidden: boolean; until: number }>();
  // design ⑰: the one notice slot over the lane; #round-banner draws what it shows
  const topSlot = new TopSlot();
  const slotNote = (text: string, ms = NOTICE_MS, say?: string) => {
    topSlot.push({ kind: 'note', text, ms, ...(say ? { say } : {}) }, performance.now());
  };
  scene.onToast = (text, color) => topSlot.push({ kind: 'note', text, ms: NOTICE_MS, color }, performance.now());
  function showBirth(alert: BirthAlert, mine: boolean): void {
    const data = opts.data ?? driver.state.data;
    const b = birthBanner(data, alert, { mine, team: online });
    const now = performance.now();
    gameAudio.play('sparkle');
    if (mine) topSlot.push({ kind: 'birth', birth: b, ms: BIRTH_MS, text: birthLine(b), say: `${birthLine(b)} · ${b.title}` }, now);
    if (online && alert.seat !== undefined) flashUntil.set(alert.seat, now + BIRTH_MS);
    if (!mine && alert.seat !== undefined) peerBirth.set(alert.seat, { name: b.title, hidden: !!unitDefFast(data, alert.defId).hidden, until: now + BIRTH_MS });
  }
  function ownBirth(alert: BirthAlert): void {
    const ready = alert.via === 'gamble' ? births.hold(alert) : alert;
    if (ready) showBirth(ready, true);
  }
  function flashingSeats(now: number): Set<number> {
    for (const [seat, until] of flashUntil) if (until <= now) flashUntil.delete(seat);
    return new Set(flashUntil.keys());
  }
  // the rows of the last drawn view, copied: a view may be patched in place before the next draw
  let shownRows: RowView[] | null = null;
  const fallenAt = new Map<number, { mode: 'flash' | 'still'; at: number }>();
  const returnedUntil = new Map<number, number>();
  function rowMarks(view: ClientView, now: number): RowMarks {
    const fell = fallenSeats(shownRows, view.rows);
    const peers = fell.filter(r => r.seat !== view.me.seat);
    for (const r of fell) {
      const mode = scene.reduceEffects || !oneShots.begin(now, FALLEN_MS) ? 'still' : 'flash';
      fallenAt.set(r.seat, { mode, at: now });
    }
    // a pillar over the rows hides the flash; the notice and the gong still tell of it
    if (!view.result) {
      for (const r of peers) {
        const cause = r.cause ? ` · ${CAUSE_TEXT[r.cause]}` : '';
        topSlot.push({ kind: 'fallen', text: `${r.seat} ${r.name} 님이 쓰러졌습니다${cause}`, say: `${r.seat}번 ${r.name} 님이 쓰러졌습니다`, ms: FALLEN_NOTE_MS }, now);
      }
      if (peers.length) gameAudio.play('fallen');
    }
    for (const seat of returnedSeats(shownRows, view.rows)) returnedUntil.set(seat, now + RETURNED_MS);
    shownRows = view.rows.map(r => ({ ...r }));
    const fallen = new Map<number, 'flash' | 'still'>();
    const fallenAge = new Map<number, number>();
    for (const [seat, f] of fallenAt) {
      if (now - f.at >= FALLEN_MS) { fallenAt.delete(seat); continue; }
      fallen.set(seat, f.mode);
      fallenAge.set(seat, now - f.at);
    }
    for (const [seat, until] of returnedUntil) if (until <= now) returnedUntil.delete(seat);
    const births = new Map<number, { name: string; hidden: boolean }>();
    for (const [seat, b] of peerBirth) {
      if (b.until <= now) peerBirth.delete(seat);
      else births.set(seat, { name: b.name, hidden: b.hidden });
    }
    return { birthFlash: flashingSeats(now), births, fallen, returned: new Set(returnedUntil.keys()), fallenAge };
  }
  driver.onBirthNotice?.((alert, mine) => (mine ? ownBirth(alert) : showBirth(alert, false)));
  const econ = (): EconMine | null => driver.econ?.() ?? null;
  const say = (text: string, ms = NOTICE_MS) => slotNote(text, ms);
  for (const id of ['econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay']) {
    if (document.getElementById(id)) continue;
    const node = document.createElement('div');
    node.id = id;
    el('stage').append(node);
  }
  if (!document.getElementById('slot-row')) {
    const row = document.createElement('div');
    row.id = 'slot-row';
    row.innerHTML = '<div id="gate-near" aria-hidden="true"></div><div id="limit-instant"></div>';
    el('stage').append(row);
  }
  if (!document.getElementById('pause-cover')) {
    const node = document.createElement('div');
    node.id = 'pause-cover';
    node.hidden = true;
    node.innerHTML = '<b class="pause-title">멈춤</b><button data-action="resume">계속 (P)</button>';
    el('stage').append(node);
  }
  if (!document.getElementById('end-scene')) {
    const node = document.createElement('div');
    node.id = 'end-scene';
    node.hidden = true;
    el('stage').append(node);
  }
  el('end-scene').addEventListener('click', () => skipScene());
  if (!document.getElementById('slot-say')) {
    const node = document.createElement('div');
    node.id = 'slot-say';
    node.className = 'sr-only';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-atomic', 'true');
    el('stage').append(node);
  }
  for (const side of SIDES) {
    if (document.getElementById(`win-${side}`)) continue;
    const node = document.createElement('div');
    node.id = `win-${side}`;
    node.className = 'win-box';
    el('stage').insertAdjacentElement(side === 'left' ? 'beforebegin' : 'afterend', node);
  }
  if (!document.getElementById('portrait-guide')) {
    const node = document.createElement('div');
    node.id = 'portrait-guide';
    node.hidden = true;
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-labelledby', 'pg-title');
    document.body.append(node);
  }
  const guideBox = el('portrait-guide');
  guideBox.innerHTML = `<div class="pg-box"><b id="pg-title" class="pg-title">${esc(PORTRAIT_TITLE)}</b><p class="pg-text">${esc(portraitText(online))}</p><button data-action="portraitDismiss">이대로 보기</button></div>`;
  const rightBox = el('win-right');
  const marketPanel = () => rightBox.querySelector<HTMLElement>('.econ-panel');

  function shownNow(selector: string): boolean {
    const node = document.querySelector<HTMLElement>(selector);
    // a browser gives null for a node that is not drawn; happy-dom has no offsetParent at all (undefined)
    return !!node && node.offsetParent !== null && !node.closest('[inert], [hidden]');
  }
  function showRefusal(text: string, command: { type: string; arg?: string }): void {
    refusal?.node?.remove();
    refusal = null;
    const spot = refusalSpot(command, shownNow);
    el('slot-say').textContent = text;
    if (spot.at === 'slot') { slotNote(text, NOTICE_MS); return; }
    const now = performance.now();
    refusal = { spot, text, until: now + NOTICE_MS, node: null };
    placeRefusal(now, true);
  }
  const refuse = (text: string, command: { type: string; arg?: string } = { type: '' }) => {
    gameAudio.play('error');
    showRefusal(text, command);
  };
  /** Keeps the box up for its time; a redraw of its window box takes it away, so it goes back in without moving again. */
  function placeRefusal(now: number, fresh: boolean): void {
    const r = refusal;
    if (!r) return;
    const target = document.querySelector(r.spot.selector);
    if (now >= r.until || (r.spot.at === 'win' && !target)) {
      r.node?.remove();
      refusal = null;
      return;
    }
    const container = r.spot.at === 'win' ? el(`win-${r.spot.side}`) : el('stage');
    if (!r.node || !container.contains(r.node)) {
      if (!target) return;
      const node = document.createElement('div');
      node.className = 'refusal';
      node.setAttribute('aria-hidden', 'true');
      node.textContent = r.text;
      if (fresh) node.classList.add('enter');
      if (fresh && !scene.reduceEffects && oneShots.begin(now, REFUSAL_MOTION_MS)) node.classList.add('shake');
      container.append(node);
      const box = container.getBoundingClientRect();
      const scale = (container.offsetWidth ? box.width / container.offsetWidth : 1) || 1;
      const at = target.getBoundingClientRect();
      const pos = refusalPos(
        { left: (at.left - box.left) / scale, top: (at.top - box.top) / scale, width: at.width / scale }, { w: node.offsetWidth }, box.width / scale,
      );
      node.style.left = `${pos.left}px`;
      node.style.top = `${pos.top}px`;
      r.node = node;
    }
    r.node.classList.toggle('out', r.until - now <= REFUSAL_OUT_MS);
  }

  /** Design ㉑: a new support lights the coin number in view; with a pillar over it and no coin number there, the slot says it. */
  function noteCoins(now: number, ended: boolean): void {
    if (coinFx && now >= coinFx.until) {
      coinFx.float?.node?.remove();
      coinFx = null;
    }
    const got = supportCount();
    if (got <= seenSupports) return;
    const fresh = got - seenSupports;
    seenSupports = got;
    if (ended) return;
    const spot = coinSpot(currentWins(), locked() ? NO_SIDES : sides);
    if (spot === 'slot') {
      for (const text of rightNotices(now).slice(-fresh)) topSlot.push({ kind: 'note', text, ms: COIN_NOTE_MS }, now);
      return;
    }
    coinFx?.float?.node?.remove();
    const coins = (opts.data?.coop?.support.coins ?? 0) * fresh;
    const float = coins > 0 && !scene.reduceEffects && oneShots.begin(now, COIN_FLOAT_MS) ? { start: now, text: `+${coins}`, node: null } : null;
    coinFx = { spot, until: now + COIN_GLOW_MS, float };
  }

  /** "+5" beside the lit number; a redraw of its window box takes it away, so it goes back in where its rise had got to. */
  function placeCoinFloat(now: number): void {
    const f = coinFx?.float;
    if (!coinFx || !f) return;
    const container = coinFx.spot === 'win' ? rightBox : el('stage');
    const target = (coinFx.spot === 'win' ? rightBox : el('right')).querySelector('.coin-glow');
    if (now - f.start >= COIN_FLOAT_MS || !target) {
      f.node?.remove();
      coinFx.float = null;
      return;
    }
    if (f.node && container.contains(f.node)) return;
    const node = document.createElement('div');
    node.className = 'coin-float';
    node.setAttribute('aria-hidden', 'true');
    node.textContent = f.text;
    if (now > f.start) node.style.animationDelay = `${Math.round(f.start - now)}ms`;
    container.append(node);
    const box = container.getBoundingClientRect();
    const scale = (container.offsetWidth ? box.width / container.offsetWidth : 1) || 1;
    const at = target.getBoundingClientRect();
    node.style.left = `${Math.round((at.left - box.left) / scale) - 2}px`;
    node.style.top = `${Math.round((at.top - box.top) / scale) - 4}px`;
    f.node = node;
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
    if (driver.failed && action !== 'restart' && action !== 'home' && action !== 'portraitDismiss') return;
    if (driver.readOnly && GAME_ACTIONS.has(action)) return;
    // design ⑦: only a P pause says so; the dex pause takes the keys itself
    if (!online && userPaused && GAME_ACTIONS.has(action)) {
      refuse(PAUSED_TEXT, { type: COMMAND_OF[action] ?? action, arg });
      return;
    }
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
        // the recipe list (rows and Z/X/C) is the solo 도우미; its combines are counted for the result screen
        const via = online ? {} : { via: 'list' as const };
        const [result = '', target] = arg.split('@');
        if (target === undefined) driver.queue({ type: 'combine', result, ...via });
        else {
          const slot = selectedSlot(driver.state, Number(target));
          if (slot !== null) driver.queue({ type: 'combine', result, slot, ...via });
        }
        break;
      }
      case 'storageCombine': driver.queue({ type: 'combine', result: arg }); break;
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
      case 'toggleMarket':
        sides = toggleSide(sides, 'market');
        if (sides.right === 'market') marketTab = 'market';
        break;
      case 'econTab': marketTab = arg === 'items' ? 'items' : 'market'; break;
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
        if (!t.ready) { refuse(t.label, { type: 'tame' }); break; }
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
      case 'supportTo': opts.actions?.support(Number(arg)); break;
      case 'watch': opts.actions?.watch(Number(arg)); break;
      case 'openMenu': modal = 'menu'; break;
      case 'askRestart': modal = 'restartAsk'; break;
      case 'askHome': modal = 'homeAsk'; break;
      case 'menuBack': modal = 'menu'; break;
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
        const index = zone === 'board' ? selectedSlot(s, Number(ref)) ?? -1 : pickStored(s.storage ?? [], ref);
        const unit = (zone === 'board' ? s.slots : s.storage ?? [])[index];
        if (!e || !unit || (zone !== 'board' && zone !== 'storage')) break;
        if (e.jige < 1) { refuse(rejectText('noJige') ?? '', { type: 'jigeOpen' }); break; }
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
        if (jigeStale(list)) { refuse('유닛이 바뀌어 지게 바꾸기를 취소했습니다', { type: 'jigeSwap' }); break; }
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
      case 'numKeysFold': numKeysOpen = !numKeysOpen; break;
      case 'numKeysReset': numKeys = DEFAULT_NUM_KEYS; writeNumKeys(numKeys); break;
      case 'keyAskPick':
        if (keyAsk) { numKeys = assignNumKey(numKeys, Number(arg), keyAsk); writeNumKeys(numKeys); }
        keyAsk = null;
        break;
      case 'keyAskClear':
        if (keyAsk) { numKeys = clearAction(numKeys, keyAsk); writeNumKeys(numKeys); }
        keyAsk = null;
        break;
      case 'keyAskClose': keyAsk = null; break;
      case 'setFx': if ((arg === 'on') !== !!scene.reduceEffects) scene.setReduceEffects(arg === 'on'); break;
      case 'resume': userPaused = false; break;
      case 'portraitDismiss': guideDismissed = true; break;
      case 'restart': hooks.onRestart?.(); break;
      case 'capture': {
        const date = captureDate();
        const button = el('modal').querySelector<HTMLButtonElement>('[data-action="capture"]');
        void captureLane(() => scene.capture(), soloCaption(driver.state, date), `dokkaebi-${date}.png`, button);
        break;
      }
      case 'home': hooks.onHome?.(); break;
    }
    if (action.startsWith('dex')) dexRemember();
    // the cell a history row pointed at goes with the market, however it was closed or replaced
    if (previousSides.right === 'market' && sides.right !== 'market') marketCell?.remove();
    render();
    if (action === 'itemMenu' || action === 'attachItem') {
      const unitId = action === 'itemMenu' ? arg : arg.split('@')[1];
      const box = el(online ? 'bottom' : 'left');
      const menuButton = box.querySelector<HTMLElement>(`[data-action="itemMenu"][data-arg="${unitId}"]`);
      const first = itemMenuId !== null ? box.querySelector<HTMLElement>('.item-pop [data-action="attachItem"]') : null;
      (first ?? menuButton)?.focus({ preventScroll: true });
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
    const focusRow = (action === 'dexGo' || action === 'dexBack' || action === 'dexOpen') && dex.focus !== null;
    if (focusRow && dex.focus) {
      revealDexRow(dex.focus);
      // the pressed link is gone with the redraw: keep the keyboard in the dex
      const row = el('modal').querySelector<HTMLElement>(`tr[data-dex-id="${dex.focus}"]`);
      (el('modal').querySelector<HTMLButtonElement>('.dex-back') ?? row?.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
      dex = { ...dex, focus: null };
    }
    if (focusSide) refocusOpener(focusSide, previousSides);
    // back from a confirm window the focus goes to the button that asked
    const asked = action === 'menuBack' ? el('modal').querySelector<HTMLButtonElement>(`[data-action="${previousModal === 'homeAsk' ? 'askHome' : 'askRestart'}"]`) : null;
    if (modal && modal !== previousModal && !focusRow) (asked ?? el('modal').querySelector<HTMLButtonElement>('[data-autofocus]') ?? el('modal').querySelector<HTMLButtonElement>('button'))?.focus();
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

  for (const id of ['top', 'left', 'right', 'bottom', 'modal', 'error', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay', 'pause-cover']) onAction(el(id), act);
  // a press that reaches a locked box anyway (inert is not honoured everywhere) still buys nothing
  for (const side of SIDES) onAction(el(`win-${side}`), (a, g) => { if (!locked()) act(a, g); });
  /** The market or 강화 cell under a pointer and the item its button buys; a locked button takes no pointer, so the cell answers. */
  function askedCell(target: EventTarget | null): { cell: HTMLElement; action: NumKeyAction } | null {
    const cell = (target as HTMLElement | null)?.closest?.<HTMLElement>('.gamble-option, .up-item');
    const button = cell?.querySelector<HTMLElement>('[data-action]');
    const action = button ? actionOf(button.dataset.action ?? '', button.dataset.arg ?? '') : null;
    return cell && action ? { cell, action } : null;
  }
  // capture: onAction buys on the plain pointerdown of the same press, so this has to run first and stop it
  rightBox.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || !(ev.ctrlKey || ev.metaKey) || driver.readOnly || locked()) return;
    const asked = askedCell(ev.target);
    if (!asked) return;
    ev.preventDefault();
    ev.stopPropagation();
    keyAsk = asked.action;
    render();
  }, true);
  // a Mac turns Ctrl+click into the context menu as well
  rightBox.addEventListener('contextmenu', ev => { if ((ev.ctrlKey || ev.metaKey) && askedCell(ev.target)) ev.preventDefault(); });
  /** Draws the Ctrl+click question over its cell, or drops it once the cell is gone (window closed, tab changed, a lock). */
  function placeKeyAsk(): void {
    rightBox.querySelector('.key-ask')?.remove();
    if (keyAsk === null) return;
    const cell = locked() ? undefined : Array.from(rightBox.querySelectorAll<HTMLElement>('.gamble-option, .up-item')).find(c => askedCell(c)?.action === keyAsk);
    if (!cell) { keyAsk = null; return; }
    rightBox.insertAdjacentHTML('beforeend', numKeyAskHtml(keyAsk, numKeys, numKeyName(keyAsk, driver.state.data)));
    const box = rightBox.querySelector<HTMLElement>('.key-ask')!;
    const frame = rightBox.getBoundingClientRect();
    const scale = (rightBox.offsetWidth ? frame.width / rightBox.offsetWidth : 1) || 1;
    const at = cell.getBoundingClientRect();
    box.style.top = `${Math.max(2, Math.round((at.top - frame.top) / scale) - box.offsetHeight - 2)}px`;
  }
  onAction(guideBox, act);
  for (const type of ['resize', 'orientationchange']) window.addEventListener(type, () => render());
  // the storage column belongs to the own living lane; it takes presses while no locking window is open and no pillar covers it
  const storageVisible = () => !driver.readOnly && driver.state.phase !== 'ended';
  const storageLive = () => storageVisible() && !driver.failed && modal === null && !coveredNow(currentWins()).includes('storage');
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
        const v = online && opts.data ? opts.view?.() ?? null : null;
        const deadline = !!v && event.round === gateDeadlineRound(v, opts.data!);
        topSlot.push({ kind: 'banner', text: [reward, title].filter(Boolean).join('\n'), ms: BANNER_MS, ...(deadline ? { tail: DEADLINE_TAIL } : {}) }, performance.now());
      }
      if (event.type === 'cleanupStart') {
        topSlot.push({ kind: 'banner', text: '보스를 잡았습니다\n남은 시간 동안 잡귀를 정리하세요', ms: BANNER_MS }, performance.now());
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
      const c = r.command;
      const arg = refusalArg(c, driver.state);
      // the battle audio already rang the refusal
      if (text) showRefusal(text, { type: c.type, ...(arg === undefined ? {} : { arg }) });
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
  el('modal').addEventListener('change', ev => {
    const select = (ev.target as HTMLElement).closest?.<HTMLSelectElement>('select[data-numkey]');
    if (!select) return;
    const n = Number(select.dataset.numkey);
    numKeys = assignNumKey(numKeys, n, parseNumKeyAction(select.value));
    writeNumKeys(numKeys);
    render();
    el('modal').querySelector<HTMLSelectElement>(`select[data-numkey="${n}"]`)?.focus();
  });
  el('win-left').addEventListener('input', ev => {
    const input = (ev.target as HTMLElement).closest<HTMLInputElement>('.jige-search input');
    if (!input || !jigeList) return;
    jigeList = { ...jigeList, name: input.value };
    setHtml(el('win-left').querySelector<HTMLElement>('.jige-rows')!, jigeRowsHtml(driver.state.data, jigeList));
  });
  /** Space is the summon key here (nothing locks the board and no text box has it), whatever button has the focus. */
  const spaceSummons = (ev: KeyboardEvent): boolean => {
    const target = ev.target as HTMLElement | null;
    return ev.code === 'Space' && !guideOn && !isTypingTarget(ev) && !ev.isComposing && !driver.failed
      && !target?.isContentEditable && !target?.closest?.('input, textarea, select')
      && !modal && !sceneRunning && driver.state.phase !== 'ended';
  };
  // a focused button is pressed on Space keyup after any keydown, auto-repeats included, so those are cancelled too
  window.addEventListener('keyup', ev => { if (spaceSummons(ev)) ev.preventDefault(); });
  window.addEventListener('keydown', ev => {
    // the focused 이대로 보기 still takes its own Enter and Space
    if (guideOn) return;
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
    // while the question is up the digits answer it instead of buying, Ctrl still held from the click included
    if (keyAsk !== null && !ev.isComposing) {
      const n = numKeyOfCode(ev.code);
      if (n !== null) { ev.preventDefault(); act('keyAskPick', String(n)); return; }
      if (ev.code === 'Escape') { act('keyAskClose', ''); return; }
    }
    if (ev.repeat && spaceSummons(ev)) { ev.preventDefault(); return; }
    if (driver.failed || ev.defaultPrevented || ev.isComposing || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const target = ev.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return;
    if (sceneRunning && (ev.code === 'Enter' || ev.code === 'NumpadEnter')) {
      ev.preventDefault();
      skipScene();
      return;
    }
    if (ev.code === 'Escape') {
      // the end scene first, then a locking window, then the last side window opened, then a waiting move, then the selection
      const step = escStep({ scene: sceneRunning, locking: modal !== null, sidesLocked: locked(), sides });
      // the item list is the newest thing open over the board, so it goes before any side window
      if (itemMenuId !== null && step !== 'scene' && step !== 'locking') { act('itemMenu', String(itemMenuId)); return; }
      if (step === 'scene') skipScene();
      else if (step === 'locking') act(modal === 'restartAsk' || modal === 'homeAsk' ? 'menuBack' : 'closeModal', '');
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
    if (modal || sceneRunning || driver.state.phase === 'ended') return;
    // side-window keys do nothing under a lock (P pause too), so a paused board buys nothing
    const num = numKeyOfCode(ev.code);
    if (num !== null) {
      const assigned = numKeys[num - 1];
      if (assigned && !locked()) { const { action, arg } = splitAction(assigned); act(action, arg); }
      return;
    }
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
    if (ev.code === 'KeyE' || quests || market || jige || helperKey) {
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
    }
    // one Space rule while nothing locks the board: summon even on a focused button; buttons take Enter
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

  /**
   * Starts the end scene the first time the game is seen ended and closes a locking window then; when the scene is
   * over (its time or a skip) the waiting callbacks run. Returns whether the scene is on.
   */
  function watchEnd(now: number): boolean {
    const ended = endedNow();
    if (!ended) endSeen = false;
    else if (!endSeen) {
      endSeen = true;
      const v = online ? opts.view?.() ?? null : null;
      const kind: EndKind = v?.result ? v.result.outcome : driver.state.result?.outcome === 'clear' ? 'soloClear' : 'soloDefeat';
      endScene.start(kind, endSceneText(kind, kind === 'gate' && v ? STAGE_NAME[v.gate.stage] : undefined), now);
      sceneRunning = true;
      if (modal === 'dex') dexRemember();
      // design 5-2-3: the closed window takes its focus with it (an online menu stays open while the clock runs)
      const active = document.activeElement as HTMLElement | null;
      if (modal && active && el('modal').contains(active)) active.blur();
      modal = null;
    }
    const on = ended && endScene.active(now);
    if (sceneRunning && !on) {
      sceneRunning = false;
      coverUntil = ended && !scene.reduceEffects ? now + COVER_MS : 0;
      const waiting = afterScene;
      afterScene = [];
      for (const cb of waiting) cb();
    }
    return on;
  }
  function skipScene(): void {
    if (!sceneRunning) return;
    endScene.skip();
    render();
  }
  function afterEndScene(cb: () => void): void {
    if (watchEnd(performance.now())) afterScene.push(cb);
    else cb();
  }
  /** #end-scene over the board while the scene is on; the board stays grey under the result until the next game. */
  function drawEndScene(on: boolean, ended: boolean): void {
    const node = el('end-scene');
    const text = on ? endScene.text : null;
    if (text && !node.firstChild) {
      const win = endScene.kind === 'clear' || endScene.kind === 'soloClear';
      node.innerHTML = `<div class="end-box${win ? ' win' : ''}"><b class="end-title">${esc(text)}</b><span class="end-sub">${esc(END_SCENE_SUB)}</span></div>`;
      node.hidden = false;
      el('slot-say').textContent = text;
    } else if (!text && node.firstChild) {
      node.replaceChildren();
      node.hidden = true;
    }
    el('stage').classList.toggle('end-scene', ended && endScene.kind !== null);
  }

  function render(): void {
    const sceneOn = watchEnd(performance.now());
    const s = driver.state;
    // design ⑰: the end of the game closes a locking window, whose choices no longer mean anything; side windows only lock
    if (s.phase === 'ended' && modal) {
      if (modal === 'dex') dexRemember();
      modal = null;
    }
    const guideWas = guideOn;
    guideOn = portraitGuide({
      portrait: !!window.matchMedia?.('(orientation: portrait)')?.matches,
      width: window.innerWidth,
      dismissed: guideDismissed,
      screenOpen: !!document.getElementById('screen')?.firstElementChild,
    });
    // commands wait for ticks, so only the windows that send none (dex, menu) stop the clock
    const pause = soloPause({ userPaused, modal, ended: s.phase === 'ended', portrait: guideOn });
    if (!online) driver.paused = pause.paused;
    const selected = selectedSlot(s, scene.selectedId);
    if (selected === null) scene.selectedId = null;
    if (wPick && scene.selectedId !== wPick.unitId) wPick = null;
    if (!isMoving()) movingId = null;
    scene.moving = movingId !== null;
    syncSelection(scene.selectedId);
    const held = s.data.economy?.market ? econ()?.jige : undefined;
    // held items come from the shop view: the online drawn state has no econ
    const shop = econ()?.shop ?? null;
    if (itemMenuId !== null && (selected === null || s.slots[selected]?.id !== itemMenuId)) itemMenuId = null;
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
    const edge = edgeLevel(s);
    const cd = view && opts.data && s.phase !== 'ended' ? gateCountdown(view, opts.data) : null;
    const pulse = cd !== null && cd.seconds <= PULSE_FROM && !scene.reduceEffects;
    const owner = loopOwner({ countdownPulse: pulse, over: edge === 'over', danger: edge === 'danger' });
    scene.pulseHeld = owner !== 'triangle';
    scene.shakeJangseung = owner === 'jangseung' && !scene.reduceEffects;
    const alertOpts = { still: owner !== 'edge' || !!scene.reduceEffects };
    // online the stage shows the watched lane; another lane going over is not my alarm
    const over = edge === 'over' && (!view || view.watching === view.me.seat);
    if (over && !wasOver) gameAudio.play('limitOver');
    wasOver = over;
    if (view && opts.data) {
      renderTop(view, opts.data);
      const helper = helperOpen() ? helperPopHtml(s, list, {
        unitId: selected === null ? null : s.slots[selected]?.id ?? null, scope, wPick: wPick?.result ?? null, hover: null, showAllOne,
      }, helperFrame) : '';
      if (helperFrame === 'win') helperWin = helper;
      renderRows(view, opts.data, helperFrame === 'win' ? '' : helper, rowMarks(view, now));
      renderAlert(s, alertOpts);
    } else {
      renderHud(s, pause.pill, alertOpts);
      setHtml(el('left'), s.phase === 'ended' ? '' : infoHtml || soloPanelHtml(s, {
        selected, list, idleList, wPick: wPick?.result ?? null, hover: null, showAllOne, skillOpen, jige: held, sellArmed: sellArmed(s, selected), shop,
        itemOpen: itemMenuId !== null,
      }));
    }
    // before the slot is drawn, so a support it has to tell shows on this frame
    noteCoins(now, s.phase === 'ended');
    const prompts = renderEcon(view, selected);
    if (s.phase === 'ended') {
      topSlot.clear();
      countdownShown = null;
    }
    // design ⑪: the box holds the slot through its 140 ms fade too, then what waited comes up
    if (cd) countdownGone = 0;
    else if (countdownShown && countdownGone === 0) countdownGone = scene.reduceEffects ? now : now + COUNTDOWN_OUT_MS;
    if (!cd && countdownShown && now >= countdownGone) countdownShown = null;
    if (cd) countdownShown = cd;
    const shownSlot = s.phase === 'ended' ? null : topSlot.current(now, countdownShown !== null);
    const moved = renderSlot(shownSlot, prompts, now, countdownShown && { c: countdownShown, pulse, leaving: !cd });
    renderSlotRow(s, view, now);
    // after the slot: its emptied sentence must not wipe the scene's words from #slot-say
    drawEndScene(sceneOn, endedNow());
    const rootData = document.documentElement.dataset;
    if ((now < coverUntil) !== ('endCover' in rootData)) {
      if (now < coverUntil) rootData.endCover = '';
      else delete rootData.endCover;
    }
    if (view && driver.readOnly) {
      const survivors = opts.data ? survivorsModel(view, opts.data, undefined, now) : null;
      const mark = focusedIn(el('right'));
      setHtml(el('right'), survivors ? survivorsHtml(survivors) : '');
      refocusIn(el('right'), mark, '.sv-watch');
    } else {
      renderRight(s, {
        ...(view ? { online: true, notices: [...moved, ...rightNotices(now)] } : {}),
        ...(s.data.economy?.market ? { market: sides.right === 'market' } : {}),
        quests: questBox(),
        heldCoins: heldCoins(reveal),
        coinGlow: coinFx?.spot === 'right',
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
      displayedCard = renderBottom(s, selected, online, helpLine ? (s.data.economy?.market ? 'B 장터' : undefined) : null, held, sellArmed(s, selected), targetId, movingId !== null, driver.readOnly, {
        shop: driver.readOnly ? null : shop, open: itemMenuId !== null,
      });
    }
    setHtml(el('storage'), storageVisible() ? storageHtml(
      s, held, defId => confirm.armed(`sellStored:${defId}`, now), info ? info.defId : null, new Map(marks.stored.map(p => [p.defId, p.key])),
    ) : '');
    if (sides.left === 'details' && (selected === null || spiritCard)) sides = closeSide(sides, 'left');
    // online the team result screen (Task 19) replaces the 1-player result window
    const soloResult = !online && s.phase === 'ended' && !sceneOn;
    const lockOpen = modal !== null || soloResult;
    const wins = currentWins();
    renderSides(s, wins, selected, helperWin);
    // the lists are drawn without hover, so a hover change leaves their HTML (and scroll boxes) as they are
    for (const id of ['left', 'win-left']) markHover(el(id), list, hoverRow);
    placeRefusal(now, false);
    placeCoinFloat(now);
    placeKeyAsk();
    const cover = el('pause-cover');
    const coverOn = !online && pause.cover;
    if (cover.hidden === coverOn) cover.hidden = !coverOn;
    const covered = coveredNow(wins);
    const leftCovered = covered.includes('left');
    // design ⑤: a pillar over the left panel leaves no focus behind it, or Enter would press the hidden button
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
    for (const id of ['top', 'left', 'right', 'bottom', 'lane', 'econ-top', 'econ-bottom', 'storage', 'tame-anchor', 'target-overlay', 'pause-cover']) {
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
    setHtml(el('modal'), soloResult ? resultHtml(s, best?.id ?? null) : !online && (modal === 'menu' || modal === 'restartAsk' || modal === 'homeAsk') ? soloMenuHtml(modal) : modal === 'menu' || modal === 'forfeit' ? menuHtml(modal, !!view && spiritModel(view) !== null) : modal === 'settings' ? settingsHtml({ helper: online ? helperOpen() : idleList, solo: !online, reducedFx: !!scene.reduceEffects, help: helpLine, numKeys: { map: numKeys, open: numKeysOpen, data: s.data }, ...(driver.speed !== undefined ? { speed: driver.speed } : {}) }) : dexShown ? dexHtml(s.data,  dex.filter, dex.query, s.round, { back: dex.back, open: dex.open, board: boardUnits(s), unfold: dex.unfold, recent: dexRecent, adv: dex.adv, state: s, target: targetId }, { kind: dex.kind, role: dex.role, skill: dex.skill, mine: dex.mine }) : '');
    if (dexShown) {
      const box = dexScroller();
      if (box && box.scrollTop !== keepTop) box.scrollTop = keepTop;
    }
    if (modal === 'settings' && !soloResult) {
      wireAudioSettings(el('modal'));
      for (const select of Array.from(el('modal').querySelectorAll<HTMLSelectElement>('select[data-numkey]'))) {
        const want = numKeys[Number(select.dataset.numkey) - 1] ?? '';
        if (select.value !== want) select.value = want;
      }
    }
    if (shownModal === 'settings' && (modal !== 'settings' || soloResult)) gameAudio.previewTrack();
    shownModal = modal;
    dexListKey = dexShown ? listKey : '';
    renderGuide(guideWas);
    hooks.onRender?.();
  }

  function renderGuide(was: boolean): void {
    let loose = false;
    if (!guideOn && was) {
      const active = document.activeElement as HTMLElement | null;
      if (active && guideBox.contains(active)) active.blur();
      loose = !document.activeElement || document.activeElement === document.body;
    }
    el('stage').inert = guideOn;
    if (guideBox.hidden === guideOn) guideBox.hidden = !guideOn;
    if (guideOn && !was) guideBox.querySelector<HTMLButtonElement>('button')?.focus();
    // after the stage stops being inert: a locking window left open under the guide takes the focus back, as on opening
    if (loose) (el('modal').querySelector<HTMLButtonElement>('[data-autofocus]') ?? el('modal').querySelector<HTMLButtonElement>('button'))?.focus();
  }

  let slotItem: SlotItem | null = null;
  let slotKey = '';
  let spoken = '';
  // the countdown last drawn, kept while its box fades out; countdownGone is when it goes (0 while it runs)
  let countdownShown: GateCountdown | null = null;
  let countdownGone = 0;
  let nearHtml = '';
  let nearGone = 0;
  /**
   * The top slot (#round-banner): words for banners, fallen notices and toasts; a birth is drawn on the board, so the
   * box stays empty for it. Prompts over the lane push the words down a row, and with two prompts the band above the
   * lane is full, so the line goes to the notices in the right column instead (returned).
   */
  function renderSlot(shown: SlotShown | null, prompts: number, now: number, countdown: { c: GateCountdown; pulse: boolean; leaving: boolean } | null): string[] {
    const item = shown?.item ?? null;
    if (item !== slotItem) {
      // a countdown can push a birth off before its time; the band it handed the scene must go with it
      if (slotItem?.kind === 'birth') scene.hideBirth();
      slotItem = item;
      if (item?.kind === 'birth' && item.birth) scene.showBirth(item.birth);
    }
    if (shown?.kind === 'countdown' && countdown) {
      renderCountdown(countdown.c, countdown.pulse, countdown.leaving);
      return [];
    }
    const words = item ? (item.kind === 'birth' ? '' : item.text) : '';
    const tail = item && item.kind !== 'birth' ? item.tail ?? '' : '';
    const oneLine = words.replace(/\n/g, ' · ');
    const body = prompts >= 2 ? '' : prompts === 1 ? oneLine : words;
    const box = el('round-banner');
    box.classList.toggle('low', prompts === 1);
    box.classList.toggle('out', !!shown && shown.until - now <= SLOT_OUT_MS);
    const kind = item?.kind ?? '';
    const key = `${kind}|${shown?.start ?? ''}|${body}|${tail}`;
    if (key !== slotKey) {
      slotKey = key;
      for (const k of SLOT_KINDS) box.classList.toggle(`k-${k}`, k === kind);
      const color = item?.color === undefined ? '' : ` style="color:#${item.color.toString(16).padStart(6, '0')}"`;
      box.innerHTML = body && prompts < 2
        ? `<span class="slot-text"${color}>${esc(body)}${tail ? `<b class="slot-tail">${esc(tail)}</b>` : ''}</span>`
        : '';
    }
    const sentence = (item ? item.say ?? item.text + tail : '').replace(/\n/g, ' · ');
    if (sentence !== spoken) {
      spoken = sentence;
      el('slot-say').textContent = sentence;
    }
    return prompts >= 2 && words ? [oneLine + tail] : [];
  }

  /**
   * Design ⑪ in the top slot; prompts over the lane do not move it. The box is drawn again only when the second (or
   * the pulse) changes, so the swell runs once a second; the health in between is written in place.
   */
  function renderCountdown(c: GateCountdown, pulse: boolean, leaving: boolean): void {
    const box = el('round-banner');
    box.classList.remove('low');
    box.classList.toggle('out', leaving);
    const key = `countdown|${c.seconds}|${pulse}`;
    if (key !== slotKey) {
      slotKey = key;
      for (const k of SLOT_KINDS) box.classList.toggle(`k-${k}`, k === 'countdown');
      box.innerHTML = countdownHtml(c, pulse);
    } else {
      const fresh = document.createElement('div');
      fresh.innerHTML = countdownHtml(c, pulse);
      for (const sel of ['.cd-where', '.cd-bar']) {
        const cur = box.querySelector(sel);
        const next = fresh.querySelector(sel)!;
        if (cur && cur.innerHTML !== next.innerHTML) cur.innerHTML = next.innerHTML;
      }
    }
    // read at 10 and 5 seconds only; the seconds between keep the last sentence
    if (c.say && c.say !== spoken) {
      spoken = c.say;
      el('slot-say').textContent = c.say;
    }
  }

  /** The fixed row under the slot: design ⑬ on its left (the 역신 and my lane), ⑤ on its right end. */
  function renderSlotRow(s: GameState, view: ClientView | null, now: number): void {
    const arrival = view && opts.data && s.phase !== 'ended' ? arrivalModel(view, opts.data) : null;
    const html = arrival ? arrivalHtml(arrival) : '';
    const near = el('gate-near');
    if (html) {
      nearGone = 0;
      near.classList.remove('out');
      near.classList.add('on');
      if (html !== nearHtml) {
        nearHtml = html;
        near.innerHTML = html;
      }
    } else if (nearHtml) {
      if (nearGone === 0) nearGone = scene.reduceEffects || s.phase === 'ended' ? now : now + NEAR_OUT_MS;
      if (now >= nearGone) {
        nearHtml = '';
        nearGone = 0;
        near.textContent = '';
        near.classList.remove('out', 'on');
      } else near.classList.add('out');
    }
    const hud = hudModel(s);
    // online the stage may show another lane; the line is about my own
    const mine = !view || view.watching === view.me.seat;
    const instant = s.phase !== 'ended' && mine && hud.instant && (hud.level === 'danger' || hud.level === 'over');
    const text = instant ? `${hud.limit + 1}마리면 바로 패배` : '';
    const node = el('limit-instant');
    if (node.textContent !== text) node.textContent = text;
  }

  /** Draws each side window into its box as a non-modal dialog named by its head title. */
  function renderSides(s: GameState, wins: WinPlace, selected: number | null, helperWin: string): void {
    const e = econ();
    shownMarket = sides.right === 'market' && e ? marketModel(e, s) : null;
    if ((sides.right === 'quests' && !e) || (sides.right === 'market' && !shownMarket)) sides = closeSide(sides, 'right');
    const held = heldCoins(reveal);
    const right = sides.right === 'upgrades' ? { cls: 'upgrades', html: upgradesHtml(s, wins, held, numKeys) }
      : sides.right === 'quests' && e ? {
        cls: 'quest-modal',
        html: questListHtml(questRows(e, s, online), questFocus, huntRows(e, s), { wins, bar: rightBarHtml(s, held, coinFx?.spot === 'win') }),
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
    const oldBody = rightBox.querySelector<HTMLElement>('.econ-body');
    const bodyTop = oldBody?.scrollTop ?? 0;
    setHtml(rightBox, shownMarket ? econPanelHtml(shownMarket, shownReveal, driver.readOnly, {
      wins, bar: rightBarHtml(s, held, coinFx?.spot === 'win'), historyOpen, historyCount: gambleHistory.length, tab: marketTab, keys: numKeys,
    }) : section('right', right));
    const panel = marketPanel();
    if (panel) {
      // these parts change on their own clock (reveal frames, settled draws), so they redraw in place
      const wallet = panel.querySelector<HTMLElement>('.gamble-wallet');
      if (wallet) setHtml(wallet, `<span class="nw">엽전 <b>${s.coins - held}</b> ·</span> <span class="nw">묵 <b>${s.buckwheat}</b></span>`);
      const result = panel.querySelector<HTMLElement>('.gamble-result');
      const history = panel.querySelector<HTMLElement>('.gamble-history');
      if (result) setHtml(result, gambleRevealHtml(shownReveal));
      if (history) setHtml(history, gambleHistoryHtml(gambleHistory, s, wins === 'inside' ? { folded } : undefined));
      // setHtml put the scroll back while the result and history were still empty, so the browser stopped it short
      const body = panel.querySelector<HTMLElement>('.econ-body');
      if (body && oldBody && body !== oldBody && body.scrollTop !== bodyTop) body.scrollTop = bodyTop;
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
    let x = at?.x ?? 0;
    // a pillar window sits over the board, so a box following an enemy on a side path would slide under it
    if (at && el('stage').classList.contains('pillar-open')) {
      const half = box.offsetWidth / 2;
      const lo = NOTICE_SPAN.x + half, hi = NOTICE_SPAN.x + NOTICE_SPAN.w - half;
      x = lo > hi ? NOTICE_SPAN.x + NOTICE_SPAN.w / 2 : Math.min(Math.max(x, lo), hi);
    }
    box.style.left = at ? `${Math.round(x)}px` : '';
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
    modal = null;
    sides = NO_SIDES;
    best = null;
    refusal?.node?.remove();
    refusal = null;
    coinFx?.float?.node?.remove();
    coinFx = null;
    seenSupports = supportCount();
    historyOpen = false;
    marketTab = 'market';
    itemMenuId = null;
    reveal = null;
    shownReveal = null;
    confirm.clear();
    userPaused = false;
    gambleHistory = [];
    pendingGambles = [];
    births.clear();
    firstSix.reset();
    flashUntil.clear();
    peerBirth.clear();
    shownRows = null;
    fallenAt.clear();
    returnedUntil.clear();
    topSlot.clear();
    countdownShown = null;
    countdownGone = 0;
    marketCell?.remove();
    endScene.skip();
    afterScene = [];
    render();
  }
  return { resetUi, afterEndScene };
}

export function unitName(driver: Driver, defId: string): string {
  return unitDefFast(driver.state.data, defId).name;
}
