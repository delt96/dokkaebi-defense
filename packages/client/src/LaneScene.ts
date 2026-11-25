import Phaser from 'phaser';
import {
  STORAGE_MAX_GRADE, countNormalEnemies, laneOf, loopPos, unitDefFast, unitRange, type GameEvent, type GameState, type Lane,
} from '@dorandi/logic';
import { NO_MARKS, itemShort, limitLevel, selectedSlot, type BoardMarks, type LimitLevel } from './ui/models';
import type { Driver } from './driver';
import type { BirthBanner } from './ui/birth';
import { CELL, CENTER_H, CENTER_W, CENTER_X, CENTER_Y, GRADE_COLOR, NOTICE_SPAN, canvasInStorage, gradeShape, canvasToCell, cellCorner, cellPx, laneToCanvas } from './layout';
import { FX_DEPTH, FxLayer, type AuraView, type StatusView } from './fx/FxLayer';
import { FX_FILES, SMALL_IDS, SPRITE_IDS, loadArt, smallFile, smallKey, spriteFile } from './art';
import { spriteKey, tameArt } from './sprites';
import { FX_FLAGS, auraBuffedBy, auraBuffedSlots, auraMarkedEnemies, enemyStatus, planEvents, planFromState, readReduceFx, slowLook, storedReduceFx, writeReduceFx, type FxCmd } from './fx/plan';

const ENEMY_COLOR: Record<string, number> = { geuseundae: 0x5a4a7a, dueoksini: 0x6a4a3a, jinegaksi: 0x8a2a3a, gangcheori: 0x4a5a6a };
const hex = (c: string) => Number.parseInt(c.slice(1), 16);
const JANGSEUNG_FILL: Record<LimitLevel, number> = { ok: 0x8a6a4a, warn: 0xd0884a, danger: 0xc04a3a, over: 0xc04a3a };
/** The 장승 post: its colour follows the limit step; it shakes only while it owns the one board-wide loop. */
export function jangseungLook(level: LimitLevel, now: number, shake: boolean): { fill: number; angle: number } {
  return { fill: JANGSEUNG_FILL[level], angle: shake ? Math.sin(now / 40) * 8 : 0 };
}
/** The '입구' and '장승' board labels share one look. */
const BOARD_LABEL = { fontFamily: 'sans-serif', fontSize: '10px', color: '#ffe08a', stroke: '#0d0a14', strokeThickness: 2, padding: { top: 2 } };
/** Register lobby-warmed assets through Phaser's loader before the board is created. */
class LaneArtFile extends Phaser.Loader.File {
  private art?: Awaited<ReturnType<typeof loadArt>>;

  constructor(loader: Phaser.Loader.LoaderPlugin, private readonly file: Parameters<typeof loadArt>[0]) {
    super(loader, { type: 'laneArt', key: file.key, url: file.image });
  }

  override load(): void {
    void loadArt(this.file).then(
      art => { this.art = art; this.loader?.nextFile(this, true); },
      () => { this.loader?.nextFile(this, false); },
    );
  }

  override addToCache(): void {
    if (!this.art) return;
    const { image, atlas } = this.art;
    if (atlas) this.loader.textureManager.addAtlas(this.key, image, atlas);
    else this.loader.textureManager.addImage(this.key, image);
  }
}

/** Board marks for combining (▲, pair brackets, key tags) are cream; yellow around a cell means the selected unit. */
const MARK_CREAM = 0xe8e0d0;
const GRADE_RADIUS = 2.5;
/** A diamond's half-diagonal, so it covers about as much as the circle and square. */
const DIAMOND_REACH = 3.25;
const BRACKET_ARM = 7;
const TAG_PX = 12;
/** The red of a cell a dragged unit cannot go to (--danger). */
const MARK_DANGER = 0xff3b2f;
const DASH = 3;
const DASH_GAP = 3;

/** The first ▲ breathes once a second; reduced effects, or a higher-priority loop on the board (B3), hold it bright. */
export function triangleAlpha(now: number, reduced: boolean, held: boolean): number {
  if (reduced || held) return 1;
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((2 * Math.PI * now) / 1000));
}

const PRIZE_HIDDEN = 0xc48cff;
const PRIZE_GRADE: Record<number, number> = { 6: 0xffe35a, 5: 0xff4a3a };
/** ㉒ A grade 5-6 (or hidden) market prize: its ring colour and the word over its cell. */
export function prizeLook(def: { grade: number; hidden?: boolean }): { color: number; text: string } | null {
  if (def.grade < 5) return null;
  return { color: def.hidden ? PRIZE_HIDDEN : PRIZE_GRADE[def.grade] ?? PRIZE_GRADE[6]!, text: `${def.grade}등급!` };
}

const PRIZE_MS = 1200;
const RING_ON_MS = 240;
const RING_CYCLE_MS = 400;
/** The prize ring blinks on 240 / off 160 three times (2.5 a second, under the 3 a second flash limit); reduced, it just stays on. */
export function ringOn(ms: number, reduced: boolean): boolean {
  if (ms < 0 || ms >= PRIZE_MS) return false;
  return reduced || ms % RING_CYCLE_MS < RING_ON_MS;
}
const PRIZE_RING_R = 20;
const PRIZE_RISE_MS = 160;
const PRIZE_FADE_MS = 140;
const PRIZE_RISE_PX = 4;

/** How a board press selected (see moveStep): a drag start, a short press on the selected unit, any other press, a right click. */
export type SelectHow = 'press' | 'again' | 'tap' | 'cancel';

type UnitView = Phaser.GameObjects.Container & {
  targetSlot?: number; motion?: Phaser.Tweens.Tween; unitId: number; defId: string; grade: number; gradeColor: number;
  itemTag?: Phaser.GameObjects.Text; itemShort?: string | null;
};
type EnemyContainer = Phaser.GameObjects.Container & {
  defId?: string; shared?: boolean; bar?: Phaser.GameObjects.Container; hp?: Phaser.GameObjects.Rectangle;
  /** Shared enemy only: when it came in (ms) and from which side, for the slide-in. */
  enterAt?: number; enterSide?: number;
};
/** The yeoksin slides in from the lane's left edge over this long. */
const ENTER_MS = 600;
const SLOW_TINT = 0x8fc8ff;

export class LaneScene extends Phaser.Scene {
  private driver: Driver;
  /** Canvas height this scene is laid out for (308 for 1 player, 292 online). */
  readonly canvasHeight: number;
  private units = new Map<number, UnitView>();
  private enemies = new Map<number, EnemyContainer>();
  /** The lane the views were made for (online): `${laneSeat}:${laneEpoch}`. */
  private laneKey = '';
  private board!: Phaser.GameObjects.Graphics;
  private coverage!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fires!: Phaser.GameObjects.Graphics;
  private jangseung!: Phaser.GameObjects.Rectangle;
  private dragging: UnitView | null = null;
  /** The cell under a dragged unit (null outside the grid). */
  private dropCell: number | null = null;
  /**
   * Whether the unit pressed was already selected, read before the press selects it. Keyed by the press's downTime because
   * Phaser (drag threshold 0) fires dragstart before the object's pointerdown, and with a threshold it would be the other way.
   */
  private press: { at: number; selected: boolean } | null = null;
  private selectListeners: ((slot: number | null, how?: SelectHow) => void)[] = [];
  private eventListeners: ((events: GameEvent[]) => void)[] = [];
  selectedId: number | null = null;
  private hoveredId: number | null = null;
  private effects!: Phaser.GameObjects.Group;
  private openKey = '';
  /** Skill, attack and moment effects; absent until create() (unit tests build the scene without it). */
  private fx?: FxLayer;
  /** Each enemy's distance as drawn last frame: knockback streaks and the blast spot of a killed enemy. */
  private lastD = new Map<number, number>();
  private buffed = new Set<number>();
  private auraKey = '';
  /** The slots the selected unit's aura reaches (their halos turn), cached by auraKey and the selected slot. */
  private liveAura = new Set<number>();
  private liveAuraKey = '';
  private prize: { unitId: number; start: number; ring: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text } | null = null;
  private tags: Phaser.GameObjects.Text[] = [];
  /** What the page wants marked on the board (set each render). */
  boardMarks: BoardMarks = NO_MARKS;
  /** Set by the page while the selected unit waits for the cell to move to: drags do not start, empty open cells get a dashed frame. */
  moving = false;
  /** Set by B3 while a higher-priority loop moves (gate countdown, over-limit jangseung, danger edge): the ▲ stays still and bright. */
  pulseHeld = false;
  /** Set by the page: the over-limit 장승 is the board's one moving loop (never under reduce effects). */
  shakeJangseung = false;
  /** Told while a dragged board unit is over the storage column: 'ok' when it may go in, 'no' when not (grade 3+). */
  onStorageHover?: (hover: 'ok' | 'no' | null) => void;
  /** Told when a board unit drag starts and ends (the page lets the pointer through its storage column meanwhile). */
  onBoardDrag?: (on: boolean) => void;
  /** Set by the page while a left pillar window covers the storage column: board units cannot be dropped into it. */
  storageCovered = false;
  private storageHover: 'ok' | 'no' | null = null;
  private reduceFx = readReduceFx();
  private wasRound = false;
  /** Views were just dropped (lane switch, resync): a yeoksin found now was already there, no slide-in. */
  private freshLane = true;
  private yeoksinIn = false;
  private yeoksinKilled = false;
  private desaturated = false;
  private desatFx: Phaser.FX.ColorMatrix | null = null;
  private desatOverlay: Phaser.GameObjects.Rectangle | null = null;

  constructor(driver: Driver, opts: { height?: number } = {}) {
    super('lane');
    this.driver = driver;
    this.canvasHeight = opts.height ?? CENTER_H;
    this.applyReduceFx(this.reduceFx);
    try {
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', e => {
        if (storedReduceFx() === null) this.applyReduceFx(e.matches);
      });
    } catch { /* no media queries here: the stored or default value stays */ }
  }

  onSelect(cb: (slot: number | null, how?: SelectHow) => void): void { this.selectListeners.push(cb); }
  onEvents(cb: (events: GameEvent[]) => void): void { this.eventListeners.push(cb); }

  get state(): GameState { return this.driver.state; }

  /** 'Reduce effects' (stored per browser): fewer, plainer effects and no shake. */
  get reduceEffects(): boolean { return this.reduceFx; }
  setReduceEffects(on: boolean): void {
    writeReduceFx(on);
    this.applyReduceFx(on);
  }
  /** body.fx-reduced stops the page's CSS loops the same way the flag stops the board's. */
  private applyReduceFx(on: boolean): void {
    this.reduceFx = on;
    this.fx?.setReduced(on);
    globalThis.document?.body?.classList.toggle('fx-reduced', on);
  }

  /** Set by the page: toasts go to its notice slot over the lane instead of being drawn on the board. */
  onToast?: (text: string, color: number) => void;
  private noticeNarrow = false;
  /** Design ⑯: while a pillar window is open, toasts and birth bands keep to the board between the pillars. */
  setNoticeSpan(narrow: boolean): void {
    this.noticeNarrow = narrow;
    this.fx?.setNoticeSpan(narrow ? { x: NOTICE_SPAN.x - CENTER_X, w: NOTICE_SPAN.w } : null);
  }

  /** Running transient effects (for the headless performance check). */
  get fxCount(): number { return this.fx?.activeCount ?? 0; }
  get lane(): Lane { return laneOf(this.state); }

  preload(): void {
    const data = this.driver.state.data;
    const sprites = [...data.units, ...data.enemies].filter(def => SPRITE_IDS.has(def.id)).map(def => spriteFile(def.id));
    const small = data.enemies.filter(def => SMALL_IDS.has(def.id)).map(def => smallFile(def.id));
    this.load.addFile([...sprites, ...small, ...FX_FILES].map(file => new LaneArtFile(this.load, file)));
  }

  private warned = new Set<string>();
  private aliasCache: ReadonlyMap<string, string> | null = null;
  /** Art borrowed by stage 3 event enemies (the hidden unit each one is tamed into). */
  private get artAlias(): ReadonlyMap<string, string> { return (this.aliasCache ??= tameArt(this.driver.state.data)); }
  private hasTexture(id: string): boolean {
    if (this.textures.exists(id)) return true;
    // only a sprite file that failed to load is worth a warning; units without art are expected
    if (!this.warned.has(id) && SPRITE_IDS.has(id)) { this.warned.add(id); console.warn(`missing sprite texture: ${id}`); }
    return false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0a14');
    this.board = this.add.graphics();
    this.effects = this.add.group();
    this.fires = this.add.graphics();
    this.coverage = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(FX_DEPTH.unitOverlay);
    const post = laneToCanvas({ x: this.lane.frame.cols + 0.9, y: this.lane.frame.rows + 0.4 });
    this.jangseung = this.add.rectangle(post.x, post.y, 8, 22, JANGSEUNG_FILL.ok).setStrokeStyle(1, 0x2a1a0e);
    this.add.text(post.x, post.y + 13, '장승', BOARD_LABEL).setOrigin(0.5, 0).setDepth(1);
    if (this.driver.online) {
      // where enemies really come in (d = 0), so a player can read the path direction
      const gate = laneToCanvas(this.lane.pointAt(0));
      this.add.text(gate.x, gate.y - 13, '입구', BOARD_LABEL).setOrigin(0.5, 1).setDepth(1);
    }
    this.drawBoard();
    this.fx = new FxLayer(this, {
      enemyPos: id => { const v = this.enemies.get(id); return v ? { x: v.x, y: v.y } : null; },
      unitPos: id => { const v = this.units.get(id); return v ? { x: v.x, y: v.y } : null; },
      pointAt: d => laneToCanvas(this.lane.pointAt(d)),
      width: CENTER_W,
      height: this.canvasHeight,
      toast: (text, color) => {
        if (!this.onToast) return false;
        this.onToast(text, color);
        return true;
      },
    });
    this.fx.setReduced(this.reduceFx);
    this.setNoticeSpan(this.noticeNarrow);
    this.driver.onEvents(events => this.handleEvents(events));
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      if (p.rightButtonDown()) this.emitSelect(null, 'cancel');
      else if (!hit.length) this.emitSelect(canvasToCell(this.lane, p.x, p.y), 'tap');
    });
  }

  reset(): void {
    this.clearViews();
    this.fires.clear();
    this.cameras.main.resetFX();
    this.setDesaturated(false);
    this.wasRound = false;
    document.getElementById('error')!.hidden = true;
    this.openKey = '';
  }

  /** Drops every unit and enemy view, running effect and the selection. */
  private clearViews(): void {
    for (const v of this.units.values()) v.destroy();
    for (const v of this.enemies.values()) v.destroy();
    this.tweens.killAll();
    this.effects.clear(true, true);
    if (this.dragging) this.endBoardDrag();
    this.hoveredId = null;
    this.selectedId = null;
    this.overlay.clear();
    for (const tag of this.tags) tag.setVisible(false);
    this.coverage.clear();
    this.units.clear();
    this.enemies.clear();
    this.fx?.clear();
    this.lastD.clear();
    this.auraKey = '';
    this.buffed.clear();
    this.liveAuraKey = '';
    this.liveAura.clear();
    this.dropPrize();
    this.yeoksinIn = false;
    this.freshLane = true;
  }

  /**
   * Online: a new snapshot or another lane on screen starts drawing from scratch (spec 7). Ids
   * restart per lane, so a view kept by id would show the old lane's unit or enemy.
   */
  private syncLane(): void {
    if (this.driver.laneSeat === undefined) return;
    const key = `${this.driver.laneSeat}:${this.driver.laneEpoch ?? 0}`;
    if (key === this.laneKey) return;
    const prevSeat = this.laneKey.split(':')[0];
    const first = this.laneKey === '';
    this.laneKey = key;
    if (first) return;
    // a resync of the same lane keeps the selection: its unit ids still name the same units
    const kept = prevSeat === String(this.driver.laneSeat) ? this.selectedId : null;
    const dropped = this.selectedId !== null && kept === null;
    this.clearViews();
    this.selectedId = kept;
    if (dropped) this.emitSelect(null);
  }

  /** The storage column is drawn (by the page) for the own living lane only, and takes drops while no window covers it. */
  private storageOpen(): boolean {
    return !this.storageCovered && !this.driver.readOnly && this.state.phase !== 'ended';
  }

  /** A dragged unit's view went away (sold, combined, another lane): the drag ends without a drop. */
  private endBoardDrag(): void {
    this.dragging = null;
    this.dropCell = null;
    this.setStorageHover(null);
    this.onBoardDrag?.(false);
  }

  private setStorageHover(hover: 'ok' | 'no' | null): void {
    if (hover === this.storageHover) return;
    this.storageHover = hover;
    this.onStorageHover?.(hover);
  }

  private emitSelect(slot: number | null, how?: SelectHow): void {
    for (const cb of this.selectListeners) cb(slot, how);
  }

  private drawBoard(): void {
    const g = this.board;
    g.clear();
    const lane = this.lane;
    g.lineStyle(CELL * 0.8, 0x1c1626, 1);
    g.beginPath();
    for (let d = 0; d <= lane.perimeter; d += 0.25) {
      const p = laneToCanvas(lane.pointAt(d));
      if (d === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    }
    g.strokePath();
    const size = cellPx(lane);
    for (const c of lane.cells) {
      const p = cellCorner(lane, c.index);
      const open = this.state.open[c.index];
      g.fillStyle(!open ? 0x141018 : c.isEdge ? 0x2a2438 : 0x221d30, 1);
      g.fillRect(p.x + 1, p.y + 1, size - 2, size - 2);
      if (!open) { g.lineStyle(1, 0x2a2232, 1); g.lineBetween(p.x + 4, p.y + 4, p.x + size - 4, p.y + size - 4); }
    }
    if (this.driver.online) {
      const gate = laneToCanvas(lane.pointAt(0));
      g.lineStyle(2, 0xffe08a, 0.9);
      g.strokeRect(gate.x - 8, gate.y - 8, 16, 16);
    }
    this.openKey = this.state.open.map(o => (o ? 1 : 0)).join('');
  }

  private drawCoverage(slot: number, range: number, alpha: number): void {
    const g = this.coverage;
    g.lineStyle(5, 0xffe08a, alpha);
    for (const [a, b] of this.lane.coverage(slot, range)) {
      g.beginPath();
      const start = laneToCanvas(this.lane.pointAt(a));
      g.moveTo(start.x, start.y);
      for (let d = Math.floor(a) + 1; d < b; d++) {
        const p = laneToCanvas(this.lane.pointAt(d));
        g.lineTo(p.x, p.y);
      }
      const end = laneToCanvas(this.lane.pointAt(b));
      g.lineTo(end.x, end.y);
      g.strokePath();
    }
  }

  private drawSelection(): void {
    this.overlay.clear();
    // brackets first: a bracket's top-left arm runs under the grade shape, which keeps its black edge on top
    this.drawPairs();
    for (const view of this.units.values()) {
      if (view.visible) this.drawGradeShape(view);
      this.placeItemTag(view);
    }
    this.drawTriangles();
    this.drawMoveCells();
    this.coverage.clear();
    const draw = (id: number | null, alpha: number) => {
      const slot = selectedSlot(this.state, id);
      if (slot === null) return;
      const unit = this.state.slots[slot]!;
      const view = this.units.get(unit.id);
      if (!view) return;
      const cell = view === this.dragging ? canvasToCell(this.lane, view.x, view.y) : slot;
      if (cell !== null && this.state.open[cell]) {
        const range = unitRange(this.state, slot);
        if (id === this.selectedId) {
          const center = laneToCanvas(this.lane.cells[cell]!);
          this.coverage.lineStyle(1, 0xffe08a, 0.32).strokeCircle(center.x, center.y, range * CELL);
        }
        this.drawCoverage(cell, range, alpha);
      }
      if (id === this.selectedId) {
        const half = cellPx(this.lane) / 2 - 1;
        this.overlay.lineStyle(2, 0xffe08a).strokeRect(view.x - half, view.y - half, half * 2, half * 2);
      }
    };
    if (this.hoveredId !== this.selectedId) draw(this.hoveredId, 0.22);
    draw(this.selectedId, 0.65);
  }

  /**
   * ⑭ while dragging: a cream frame on the cell under the pointer (red dashes when it is closed, nothing on the own cell) and
   * ⇄ on the unit a drop would swap with. ⑯ while moving: cream dashes on every empty open cell.
   */
  private drawMoveCells(): void {
    const g = this.overlay;
    const size = cellPx(this.lane);
    if (this.moving && !this.dragging) {
      g.lineStyle(1, MARK_CREAM, 0.8);
      this.state.slots.forEach((u, slot) => {
        if (!u && this.state.open[slot]) this.dashedFrame(slot);
      });
      return;
    }
    const cell = this.dropCell;
    const from = this.dragging ? selectedSlot(this.state, this.dragging.unitId) : null;
    if (cell === null || from === null || cell === from) return;
    if (!this.state.open[cell]) {
      g.lineStyle(1, MARK_DANGER, 1);
      this.dashedFrame(cell);
      return;
    }
    const p = cellCorner(this.lane, cell);
    g.lineStyle(2, MARK_CREAM, 1);
    g.strokeRect(p.x + 1, p.y + 1, size - 2, size - 2);
    if (this.swapPartner()) this.drawSwapArrow(cell, from);
  }

  /** Dashes along a cell's frame, inset like the solid frame; the line style is the caller's. */
  private dashedFrame(slot: number): void {
    const g = this.overlay;
    const p = cellCorner(this.lane, slot);
    const x0 = p.x + 1.5;
    const y0 = p.y + 1.5;
    const len = cellPx(this.lane) - 3;
    for (let d = 0; d < len; d += DASH + DASH_GAP) {
      const e = Math.min(len, d + DASH);
      g.lineBetween(x0 + d, y0, x0 + e, y0);
      g.lineBetween(x0 + d, y0 + len, x0 + e, y0 + len);
      g.lineBetween(x0, y0 + d, x0, y0 + e);
      g.lineBetween(x0 + len, y0 + d, x0 + len, y0 + e);
    }
  }

  /** ⇄ in the partner's cell, lying along the line to the dragged unit's own cell. */
  private drawSwapArrow(cell: number, from: number): void {
    const g = this.overlay;
    const c = laneToCanvas(this.lane.cells[cell]!);
    const o = laneToCanvas(this.lane.cells[from]!);
    const dist = Math.hypot(o.x - c.x, o.y - c.y) || 1;
    const ux = (o.x - c.x) / dist;
    const uy = (o.y - c.y) / dist;
    const half = 5;
    const gap = 2;
    const head = 3;
    g.lineStyle(2, MARK_CREAM, 1);
    for (const side of [1, -1]) {
      // the upper shaft points at the own cell, the lower one back
      const sx = c.x - uy * gap * side;
      const sy = c.y + ux * gap * side;
      const tipX = sx + ux * half * side;
      const tipY = sy + uy * half * side;
      g.lineBetween(sx - ux * half * side, sy - uy * half * side, tipX, tipY);
      g.lineBetween(tipX, tipY, tipX - (ux + uy) * head * side, tipY - (uy - ux) * head * side);
      g.lineBetween(tipX, tipY, tipX - (ux - uy) * head * side, tipY - (uy + ux) * head * side);
    }
  }

  private drawGradeShape(view: UnitView): void {
    const g = this.overlay;
    const corner = 12 * this.lane.pitch * view.scaleY;
    const x = view.x - corner;
    const y = view.y - corner;
    const r = GRADE_RADIUS * view.scaleY;
    g.fillStyle(view.gradeColor, view.alpha);
    g.lineStyle(1, 0x000000, view.alpha);
    const shape = gradeShape(view.grade);
    if (shape === 'c') {
      g.fillCircle(x, y, r);
      g.strokeCircle(x, y, r);
    } else if (shape === 's') {
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.strokeRect(x - r, y - r, r * 2, r * 2);
    } else {
      const d = DIAMOND_REACH * view.scaleY;
      const points = [{ x, y: y - d }, { x: x + d, y }, { x, y: y + d }, { x: x - d, y }];
      g.fillPoints(points, true);
      g.strokePoints(points, true);
    }
  }

  /** ▲ at the top right of the result slots of the next list's top three (nothing selected). */
  private drawTriangles(): void {
    const g = this.overlay;
    this.boardMarks.triangles.forEach((slot, i) => {
      const unit = this.state.slots[slot];
      const view = unit && this.units.get(unit.id);
      if (!view?.visible) return;
      const k = this.lane.pitch * view.scaleY;
      const cx = view.x + 11 * k;
      const cy = view.y - 11 * k;
      const w = 3.5 * view.scaleY;
      const h = 3 * view.scaleY;
      const alpha = (i === 0 ? triangleAlpha(this.time?.now ?? 0, this.reduceFx, this.pulseHeld) : 0.7) * view.alpha;
      g.fillStyle(MARK_CREAM, alpha);
      g.fillTriangle(cx, cy - h, cx - w, cy + h, cx + w, cy + h);
      g.lineStyle(1, 0x000000, alpha);
      g.strokeTriangle(cx, cy - h, cx - w, cy + h, cx + w, cy + h);
    });
  }

  /**
   * Corner brackets on the selected unit's partner cells (each with the first key that takes it) and on the hovered
   * row's cells; while a row is hovered, brackets outside it drop to 0.3.
   */
  private drawPairs(): void {
    const { pairs, focus } = this.boardMarks;
    const keyOf = new Map(pairs.map(p => [p.slot, p.key]));
    const cells = [...new Set([...pairs.map(p => p.slot), ...(focus ?? [])])];
    const size = cellPx(this.lane);
    const arm = Math.min(BRACKET_ARM, size / 3);
    const g = this.overlay;
    let used = 0;
    for (const slot of cells) {
      const alpha = focus && !focus.includes(slot) ? 0.3 : 1;
      const p = cellCorner(this.lane, slot);
      const x0 = p.x + 1;
      const y0 = p.y + 1;
      const x1 = p.x + size - 1;
      const y1 = p.y + size - 1;
      g.lineStyle(2, MARK_CREAM, alpha);
      g.lineBetween(x0, y0, x0 + arm, y0);
      g.lineBetween(x0, y0, x0, y0 + arm);
      g.lineBetween(x1, y0, x1 - arm, y0);
      g.lineBetween(x1, y0, x1, y0 + arm);
      g.lineBetween(x0, y1, x0 + arm, y1);
      g.lineBetween(x0, y1, x0, y1 - arm);
      g.lineBetween(x1, y1, x1 - arm, y1);
      g.lineBetween(x1, y1, x1, y1 - arm);
      const key = keyOf.get(slot);
      if (!key) continue;
      // bottom right: the grade shape holds the top left and the ▲ the top right
      const tx = x1 - TAG_PX;
      const ty = y1 - TAG_PX;
      g.fillStyle(MARK_CREAM, alpha);
      g.fillRect(tx, ty, TAG_PX, TAG_PX);
      const tag = this.tags[used] ?? (this.tags[used] = this.add.text(0, 0, '', {
        fontFamily: 'sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#17121f',
      }).setOrigin(0.5).setDepth(FX_DEPTH.unitOverlay + 0.1));
      tag.setText(key).setPosition(tx + TAG_PX / 2, ty + TAG_PX / 2).setAlpha(alpha).setVisible(true);
      used++;
    }
    for (let i = used; i < this.tags.length; i++) this.tags[i]!.setVisible(false);
  }

  private makeUnitView(unitId: number, defId: string): UnitView {
    const def = unitDefFast(this.state.data, defId);
    const view = this.add.container(0, 0) as UnitView;
    view.unitId = unitId;
    view.defId = defId;
    view.grade = def.grade;
    view.gradeColor = hex(GRADE_COLOR[def.grade] ?? '#ffffff');
    const k = this.lane.pitch;
    if (this.hasTexture(defId)) {
      view.add(this.add.image(0, 0, defId));
    } else {
      view.add(this.add.circle(0, 0, 11 * k, view.gradeColor).setStrokeStyle(1, 0x000000));
      view.add(this.add.text(0, 0, def.name.slice(0, 1), { fontSize: '11px', color: '#10101a', fontFamily: 'sans-serif' }).setOrigin(0.5));
    }
    view.setSize(cellPx(this.lane), cellPx(this.lane)).setInteractive({ draggable: true, useHandCursor: true }).setDepth(3);
    view.on('pointerover', () => { this.hoveredId = unitId; });
    view.on('pointerout', () => { if (this.hoveredId === unitId) this.hoveredId = null; });
    view.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.notePress(unitId, pointer));
    view.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      this.notePress(unitId, pointer);
      if (pointer.rightButtonDown() || this.driver.readOnly || this.moving) return;
      const from = this.state.slots.findIndex(u => u?.id === unitId);
      if (from < 0) return;
      this.emitSelect(from, 'press');
      view.motion?.stop();
      this.dragging = view;
      this.dropCell = from;
      view.setDepth(10);
      this.onBoardDrag?.(true);
    });
    view.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => {
      if (this.dragging !== view) return;
      view.setPosition(x, y);
      this.dropCell = canvasToCell(this.lane, x, y);
      const over = this.storageOpen() && canvasInStorage(x, y);
      this.setStorageHover(over ? (unitDefFast(this.state.data, defId).grade <= STORAGE_MAX_GRADE ? 'ok' : 'no') : null);
    });
    view.on('dragend', () => {
      if (this.dragging !== view) return;
      this.dropCell = null;
      this.setStorageHover(null);
      this.onBoardDrag?.(false);
      const cell = canvasToCell(this.lane, view.x, view.y);
      const from = selectedSlot(this.state, unitId);
      const live = !this.driver.paused && !this.driver.readOnly;
      if (from !== null && live && this.storageOpen() && canvasInStorage(view.x, view.y)) {
        // a refused store (grade 3 and up) comes back as a notice and the unit slides home
        this.driver.queue({ type: 'store', slot: from });
        view.targetSlot = undefined;
      } else if (from !== null && cell !== null && this.state.open[cell] && cell !== from && live) {
        this.driver.queue({ type: 'move', from, to: cell });
      } else {
        view.targetSlot = undefined;
      }
      this.dragging = null;
      view.setDepth(3);
    });
    view.on('pointerup', (p: Phaser.Input.Pointer) => {
      const again = this.press?.at === p.downTime && this.press.selected;
      this.press = null;
      if (p.button === 0 && p.getDistance() < 4) {
        const slot = this.state.slots.findIndex(u => u?.id === unitId);
        this.emitSelect(slot, !this.moving && again ? 'again' : 'tap');
      }
    });
    return view;
  }

  private notePress(unitId: number, pointer: Phaser.Input.Pointer): void {
    if (!this.press || this.press.at !== pointer.downTime) this.press = { at: pointer.downTime, selected: this.selectedId === unitId };
  }

  /** The unit a dragged one would swap with if dropped now (on an open cell other than its own). */
  private swapPartner(): { slot: number; from: number } | null {
    const cell = this.dropCell;
    const from = this.dragging ? selectedSlot(this.state, this.dragging.unitId) : null;
    if (cell === null || from === null || cell === from || !this.state.open[cell] || !this.state.slots[cell]) return null;
    return { slot: cell, from };
  }

  private placeUnits(): void {
    const seen = new Set<number>();
    const dimmed = this.driver.dimmed;
    const partner = this.swapPartner()?.slot ?? null;
    this.state.slots.forEach((u, slot) => {
      if (!u) return;
      seen.add(u.id);
      let view = this.units.get(u.id);
      if (view && view.defId !== u.defId) {
        // the same id now names another unit (another lane): never reuse the old drawing
        if (this.dragging === view) this.endBoardDrag();
        view.motion?.stop();
        view.destroy();
        this.units.delete(u.id);
        view = undefined;
      }
      if (!view) {
        view = this.makeUnitView(u.id, u.defId);
        this.units.set(u.id, view);
      }
      this.syncItemTag(view, itemShort(this.state, slot));
      // a combine or sell waiting for the server fades its slot; the unit a drop would swap with fades less
      const alpha = dimmed.has(slot) ? 0.4 : slot === partner ? 0.5 : 1;
      if (view.alpha !== alpha) view.alpha = alpha;
      if (this.dragging === view) return;
      if (view.targetSlot === slot) return;
      view.motion?.stop();
      const fresh = view.targetSlot === undefined;
      view.targetSlot = slot;
      const c = this.lane.cells[slot]!;
      const p = laneToCanvas({ x: c.x, y: c.y });
      if (fresh) view.setPosition(p.x, p.y);
      else view.motion = this.tweens.add({ targets: view, x: p.x, y: p.y, duration: 80 });
    });
    for (const [id, view] of this.units) {
      if (seen.has(id)) continue;
      if (this.dragging === view) this.endBoardDrag();
      view.motion?.stop();
      view.destroy();
      this.units.delete(id);
    }
    const auraKey = this.state.slots.map(u => u?.defId ?? '').join(',');
    if (auraKey !== this.auraKey) {
      this.auraKey = auraKey;
      this.buffed = auraBuffedSlots(this.state);
    }
  }

  /**
   * The item letter takes the bottom-left corner (the grade shape holds the top left, the ▲ the top right, the Z/X/C tag
   * the bottom right). It is drawn above the overlay so a pair cell's cream bracket does not cover it.
   */
  private syncItemTag(view: UnitView, short: string | null): void {
    if ((view.itemShort ?? null) === short) return;
    view.itemShort = short;
    view.itemTag?.destroy();
    view.itemTag = undefined;
    if (!short) return;
    const tag = this.add.text(0, 0, short, {
      fontSize: '10px', color: '#0d0a14', backgroundColor: '#7fd6a8', fontFamily: 'sans-serif', fontStyle: 'bold', padding: { x: 1, y: 0 },
    }).setOrigin(0.5).setDepth(FX_DEPTH.unitOverlay + 0.1);
    view.itemTag = tag;
    view.once('destroy', () => tag.destroy());
    this.placeItemTag(view);
  }

  private placeItemTag(view: UnitView): void {
    const tag = view.itemTag;
    if (!tag) return;
    const corner = 11 * this.lane.pitch * view.scaleY;
    tag.setPosition(view.x - corner, view.y + corner).setAlpha(view.alpha).setVisible(view.visible);
  }

  private makeEnemy(id: number, defId: string, boss: boolean): EnemyContainer {
    const def = this.state.data.enemies.find(d => d.id === defId);
    if (def?.shared) return this.makeSharedEnemy(id, defId);
    const spawn = laneToCanvas(this.lane.pointAt(0));
    const view: EnemyContainer = this.add.container(spawn.x, spawn.y).setDepth(2);
    view.defId = defId;
    const radius = boss ? 14 : 6;
    const key = spriteKey(defId, SPRITE_IDS, this.artAlias) ?? defId;
    // bosses and 격파 targets stand at full size; ordinary enemies use their 24px lane art, or the 32px art at 0.75
    const full = boss || !!def?.event;
    const small = !full && SMALL_IDS.has(key) && this.textures.exists(smallKey(key));
    const body = small ? this.add.image(0, 0, smallKey(key))
      : this.hasTexture(key) ? this.add.image(0, 0, key).setScale(full ? 1 : 0.75)
      : this.add.circle(0, 0, radius, ENEMY_COLOR[defId] ?? 0x7a6a9a).setStrokeStyle(1, 0xb8a8e8);
    view.add(body);
    const barY = boss ? -28 : body instanceof Phaser.GameObjects.Image ? -Math.round(body.displayHeight / 2) - 3 : -15;
    this.attachBar(view, boss ? 44 : full ? 24 : 18, barY, boss ? 0xff715c : 0x83d5a3);
    this.enemies.set(id, view);
    return view;
  }

  /** Stage point just under an enemy's health bar (where the T button goes), or null when it is not drawn. */
  enemyBarAnchor(enemyId: number): { x: number; y: number } | null {
    const view = this.enemies.get(enemyId);
    if (!view?.bar?.visible || !view.hp) return null;
    return { x: view.bar.x + CENTER_X, y: view.bar.y + view.hp.y + 3 + CENTER_Y };
  }

  /** The HP bar lives in its own container above every effect (effects stay under the bars). */
  private attachBar(view: EnemyContainer, width: number, y: number, color: number): void {
    const bar = this.add.container(view.x, view.y).setDepth(FX_DEPTH.hp);
    const fill = this.add.rectangle(-width / 2, y, width, 2, color).setOrigin(0, 0.5);
    bar.add([this.add.rectangle(0, y, width + 2, 4, 0x100e14), fill]);
    view.bar = bar;
    view.hp = fill;
    view.once('destroy', () => bar.destroy());
  }

  /** A shared enemy (the yeoksin): its stage's mask, a little smaller than a boss, with its own bar. Without art, a disc marked '탈'. */
  private makeSharedEnemy(id: number, defId: string): EnemyContainer {
    const spawn = laneToCanvas(this.lane.pointAt(0));
    const view: EnemyContainer = this.add.container(spawn.x, spawn.y).setDepth(2);
    view.defId = defId;
    view.shared = true;
    const key = spriteKey(defId, SPRITE_IDS, this.artAlias);
    if (key && this.hasTexture(key)) {
      const body = this.add.image(0, 0, key);
      view.add(body);
      this.attachBar(view, 36, -Math.round(body.displayHeight / 2) - 3, 0xffb347);
    } else {
      view.add([
        this.add.circle(0, 0, 12, 0xc89a52).setStrokeStyle(2, 0x4a1a12),
        this.add.text(0, 0, '탈', { fontSize: '11px', color: '#2a0e08', fontFamily: 'sans-serif' }).setOrigin(0.5),
      ]);
      this.attachBar(view, 36, -20, 0xffb347);
    }
    if (!this.freshLane) { view.enterAt = this.time.now; view.enterSide = -1; }
    this.enemies.set(id, view);
    return view;
  }

  private placeEnemies(): void {
    if (this.driver.online) {
      // a resync or a lane switch drops enemies without a kill event
      const present = new Map(this.state.enemies.map(e => [e.id, e.defId]));
      for (const [id, view] of this.enemies) {
        if (present.get(id) === view.defId) continue;
        view.destroy();
        this.enemies.delete(id);
      }
    }
    const now = this.time.now;
    const marked = this.fx ? auraMarkedEnemies(this.state) : new Set<number>();
    const statuses: StatusView[] = [];
    const sharedDefs = new Set(this.state.data.enemies.filter(d => d.shared).map(d => d.id));
    let yeoksin: { x: number; y: number } | null = null;
    this.lastD.clear();
    for (const enemy of this.state.enemies) {
      const view = this.enemies.get(enemy.id) ?? this.makeEnemy(enemy.id, enemy.defId, enemy.boss);
      const d = this.driver.enemyDistance(enemy.id, enemy.d);
      this.lastD.set(enemy.id, d);
      const p = laneToCanvas(this.lane.pointAt(d));
      if (view.enterAt !== undefined && now - view.enterAt < ENTER_MS) {
        // the yeoksin walks in from the side of the lane
        const t = (now - view.enterAt) / ENTER_MS;
        const k = 1 - (1 - t) * (1 - t);
        const from = (view.enterSide ?? -1) < 0 ? -24 : CENTER_W + 24;
        view.setPosition(from + (p.x - from) * k, p.y);
      } else view.setPosition(p.x, p.y);
      view.bar?.setPosition(view.x, view.y);
      const shared = sharedDefs.has(enemy.defId);
      if (shared) yeoksin = { x: view.x, y: view.y };
      const status = enemyStatus(enemy, marked.has(enemy.id), shared);
      this.clearFlash(view);
      this.tintSlow(view, slowLook(status.slowed, this.fx?.flags ?? FX_FLAGS(false)).tint);
      if (status.stunned || status.slowed || status.marked) {
        const body = view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
        const scale = body instanceof Phaser.GameObjects.Image ? body.scaleY : 0.75;
        // status sheets are drawn per sprite (the 24px lane art for ordinary enemies), so a repeated boss uses its
        // base boss's sheet; the sheet's anchor is the bottom of the sprite as drawn
        statuses.push({ id: enemy.id, defId: spriteKey(enemy.defId, SPRITE_IDS, this.artAlias) ?? enemy.defId, x: view.x, y: view.y, feet: view.y + body.displayHeight / 2, scale, r: body.displayHeight / 2, status });
      }
      view.hp?.setScale(Math.max(0, enemy.hp / enemy.maxHp), 1);
    }
    if (this.fx) {
      if (yeoksin) this.fx.setMist(yeoksin, -1, now);
      else if (this.yeoksinIn) this.fx.setMist(null, 1, now, this.yeoksinKilled);
      this.yeoksinIn = yeoksin !== null;
      this.yeoksinKilled = false;
      const sel = selectedSlot(this.state, this.selectedId);
      const liveKey = `${this.auraKey}|${sel ?? ''}`;
      if (liveKey !== this.liveAuraKey) {
        this.liveAuraKey = liveKey;
        this.liveAura = sel === null ? new Set() : auraBuffedBy(this.state, sel);
      }
      const auras: AuraView[] = [];
      for (const slot of this.buffed) {
        const u = this.state.slots[slot];
        const v = u && this.units.get(u.id);
        // a 48px unit (a tamed boss or its grade 6 result) stands lower than the 32px ones
        const body = v?.first;
        if (v && v.visible) auras.push({ id: u.id, x: v.x, feet: v.y + (body instanceof Phaser.GameObjects.Image ? body.displayHeight / 2 : 16), live: this.liveAura.has(slot) });
      }
      this.fx.update(now, statuses, auras);
    }
    this.freshLane = false;
  }

  private tintSlow(view: EnemyContainer, slowed: boolean): void {
    if (!!view.getData('slowTint') === slowed) return;
    view.setData('slowTint', slowed);
    const body = view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    if (body instanceof Phaser.GameObjects.Image) {
      if (slowed) body.setTint(SLOW_TINT); else body.clearTint();
    } else {
      if (body.getData('color') === undefined) body.setData('color', body.fillColor);
      body.setFillStyle(slowed ? 0x4f86c0 : body.getData('color'));
    }
  }

  private showHit(event: Extract<GameEvent, { type: 'damage' }>): void {
    const view = this.enemies.get(event.enemyId);
    if (!view) return;
    const now = this.time.now;
    if (event.effect) this.fx?.number(view.x, view.y - 12, String(event.amount), now);
    if (this.reduceFx || now < (view.getData('nextFlashAt') ?? 0)) return;
    const body = view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    body.setAlpha(0.76);
    view.setData('flashUntil', now + 45);
    view.setData('nextFlashAt', now + 120);
  }

  private clearFlash(view: Phaser.GameObjects.Container): void {
    const until = view.getData('flashUntil');
    if (!until || (!this.reduceFx && this.time.now < until)) return;
    (view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc).setAlpha(1);
    view.setData('flashUntil', 0);
  }

  private drawFires(): void {
    const g = this.fires;
    g.clear();
    g.lineStyle(10, 0xff7a2a, 0.35);
    const per = this.lane.perimeter;
    for (const f of this.state.fires) {
      g.beginPath();
      for (let d = f.from; d <= f.to + 1e-6; d += 0.1) {
        const p = laneToCanvas(this.lane.pointAt(loopPos(Math.min(d, f.to), per)));
        if (d === f.from) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.strokePath();
    }
  }

  private handleEvents(events: GameEvent[]): void {
    const fx = this.fx;
    const now = fx ? this.time.now : 0;
    // planned before the loop below drops killed enemies, so a blast can start where one died
    const cmds = fx ? planEvents(events, planFromState(this.state, this.lastD, this.lastD)) : [];
    const later: FxCmd[] = [];
    for (const c of cmds) {
      if (c.kind === 'bigUnit' || c.kind === 'boss') later.push(c);
      else fx!.run(c, now);
    }
    for (const e of events) {
      if (e.type === 'spawn' && !this.enemies.has(e.enemyId)) {
        const boss = this.state.data.enemies.find(def => def.id === e.defId)?.boss ?? false;
        this.makeEnemy(e.enemyId, e.defId, boss);
      }
      if (e.type === 'damage') this.showHit(e);
      if (e.type === 'kill') {
        const view = this.enemies.get(e.enemyId);
        if (view) {
          this.enemies.delete(e.enemyId);
          this.effects.add(view);
          if (view.shared) this.yeoksinKilled = true;
          view.bar?.setVisible(false);
          this.tweens.add({ targets: view, scale: 1.3, alpha: 0, duration: 145, onComplete: () => view.destroy() });
        }
      }
      // stage 3 event enemies run off at their time limit or the round end, and a tamed one leaves to join the board:
      // both fade without a kill (online the per-tick sweep in placeEnemies would drop them too)
      if (e.type === 'flee' || e.type === 'tame') {
        const view = this.enemies.get(e.enemyId);
        if (view) {
          this.enemies.delete(e.enemyId);
          this.effects.add(view);
          view.bar?.setVisible(false);
          this.tweens.add({ targets: view, alpha: 0, duration: 300, onComplete: () => view.destroy() });
        }
      }
      if (e.type === 'attack') this.swing(e.unitId);
      if (e.type === 'summon' || e.type === 'combine') {
        this.placeUnits();
        const view = this.units.get(e.unitId);
        if (view && e.type === 'summon') this.revealSummon(view, e.grade);
        if (view && e.type === 'combine') this.tweens.add({ targets: view, scaleX: 1.3, scaleY: 0.7, duration: 90, yoyo: true, ease: 'Quad.Out' });
      }
    }
    for (const c of later) fx!.run(c, now);
    for (const cb of this.eventListeners) cb(events);
  }

  showBirth(b: BirthBanner): void {
    this.fx?.birth(b, this.hasTexture(b.defId) ? b.defId : null);
  }

  hideBirth(): void {
    this.fx?.clearBirths();
  }

  showGambleNotice(text: string): void {
    this.fx?.toast(text, 0xffd28a, this.time.now);
  }

  showGambleResult(tier: 'lose' | 'small' | 'big', text: string, unitId?: number): void {
    if (tier === 'big') this.fx?.gambleHit(text, unitId, this.time.now);
    const unit = unitId === undefined ? undefined : this.units.get(unitId);
    if (unit && !this.reduceFx) {
      this.tweens.add({ targets: unit, scale: { from: 0.8, to: 1 }, duration: 220, ease: 'Back.Out' });
    }
    const look = unit ? prizeLook(unitDefFast(this.state.data, unit.defId)) : null;
    if (!unit || !look) return;
    this.dropPrize();
    const css = `#${look.color.toString(16).padStart(6, '0')}`;
    // under the grade marks and ▲ (unitOverlay) so the ring never hides them
    const ring = this.add.circle(unit.x, unit.y, PRIZE_RING_R).setStrokeStyle(2, look.color).setDepth(FX_DEPTH.unitOverlay - 0.05);
    const label = this.add.text(unit.x, unit.y, look.text, { ...BOARD_LABEL, fontStyle: 'bold', color: css })
      .setOrigin(0.5, 1).setDepth(FX_DEPTH.text);
    this.prize = { unitId: unit.unitId, start: this.time.now, ring, label };
    this.drawPrize();
  }

  private dropPrize(): void {
    if (!this.prize) return;
    this.prize.ring.destroy();
    this.prize.label.destroy();
    this.prize = null;
  }

  /** Follows the prize unit each frame (it can be dragged), blinking the ring and lifting then fading the word. */
  private drawPrize(): void {
    const p = this.prize;
    if (!p) return;
    const t = this.time.now - p.start;
    const view = this.units.get(p.unitId);
    if (t >= PRIZE_MS || !view) { this.dropPrize(); return; }
    p.ring.setPosition(view.x, view.y).setVisible(ringOn(t, this.reduceFx));
    const enter = this.reduceFx ? 1 : Math.min(1, t / PRIZE_RISE_MS);
    const rise = 1 - (1 - enter) ** 3;
    const out = Math.max(0, (t - (PRIZE_MS - PRIZE_FADE_MS)) / PRIZE_FADE_MS);
    const bottom = view.y - PRIZE_RING_R - 1 - PRIZE_RISE_PX * rise;
    // a top-row cell would push the word off the canvas
    p.label.setPosition(view.x, Math.max(p.label.height, bottom)).setAlpha(Math.min(enter, 1 - out * out));
  }

  private revealSummon(view: UnitView, grade: number): void {
    view.setVisible(false);
    const flame = this.add.circle(view.x, view.y, 6, hex(GRADE_COLOR[grade] ?? '#ffffff'), 0.9).setDepth(7);
    this.effects.add(flame);
    this.tweens.add({ targets: flame, radius: 14, alpha: 0.4, duration: 300, onComplete: () => {
      flame.destroy();
      if (!view.active) return;
      view.setVisible(true).setScale(0.5);
      this.tweens.add({ targets: view, scale: 1, duration: 260, ease: 'Back.Out' });
    } });
    if (grade >= 3 && !this.reduceFx) this.cameras.main.shake(200, 0.01);
  }

  /** A physical unit rocks as it strikes; the shot, swipe or orb itself is drawn by the effect layer. */
  private swing(unitId: number): void {
    const from = this.units.get(unitId);
    const u = this.state.slots.find(s => s?.id === unitId);
    if (!from || !u || unitDefFast(this.state.data, u.defId).damageType === 'magical') return;
    this.tweens.add({ targets: from, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, onComplete: () => from.setAngle(0) });
  }

  /** My lane fell (online: its seat is a spirit; 1 player: defeat): the lane goes grey. */
  private setDesaturated(on: boolean): void {
    if (on === this.desaturated) return;
    this.desaturated = on;
    const cam = this.cameras.main;
    if (on) {
      if (this.renderer?.type === Phaser.WEBGL && cam.postFX) {
        this.desatFx = cam.postFX.addColorMatrix();
        this.desatFx.grayscale(1);
        this.desatFx.brightness(0.75, true);
      } else {
        this.desatOverlay = this.add.rectangle(0, 0, CENTER_W, this.canvasHeight, 0x30303a, 0.55).setOrigin(0).setDepth(FX_DEPTH.top - 0.1);
      }
      if (!this.reduceFx) cam.flash(220, 40, 20, 24);
    } else {
      if (this.desatFx) cam.postFX?.clear();
      this.desatFx = null;
      this.desatOverlay?.destroy();
      this.desatOverlay = null;
    }
  }

  update(_time: number, delta: number): void {
    if (this.driver.failed) return;
    try {
      this.driver.update(delta);
      this.renderBoard();
      this.onFrame?.();
    } catch (error) {
      this.driver.failed = true;
      console.error(error);
      const banner = document.getElementById('error')!;
      document.getElementById('error-message')!.textContent = `게임 오류 · ${error instanceof Error ? error.message : String(error)}`;
      banner.hidden = false;
      document.getElementById('error-restart')!.focus();
    }
  }

  onFrame?: () => void;

  private renderBoard(): void {
    this.syncLane();
    const key = this.state.open.map(o => (o ? 1 : 0)).join('');
    if (key !== this.openKey) this.drawBoard();
    this.placeUnits();
    this.placeEnemies();
    this.drawFires();
    this.drawSelection();
    this.drawPrize();
    if (this.fx) {
      const round = this.state.phase === 'round';
      if (this.wasRound && this.state.phase === 'prep') this.fx.roundClear(this.time.now);
      this.wasRound = round;
      this.setDesaturated(this.driver.laneEliminated?.() ?? this.state.result?.outcome === 'defeat');
    }
    const { level } = limitLevel(this.state.data, countNormalEnemies(this.state), this.state.round);
    const look = jangseungLook(level, this.time.now, this.shakeJangseung && !this.reduceFx);
    this.jangseung.setFillStyle(look.fill);
    this.jangseung.setAngle(look.angle);
  }
}

export const LANE_CANVAS = { width: CENTER_W, height: CENTER_H };
