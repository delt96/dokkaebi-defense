import Phaser from 'phaser';
import { availableRecipes, countNormalEnemies, laneOf, loopPos, unitDefFast, type GameEvent, type GameState, type Lane } from '@dorandi/logic';
import type { GameDriver } from './driver';
import { CELL, CENTER_H, CENTER_W, GRADE_COLOR, canvasToCell, laneToCanvas } from './layout';

const SPRITES = ['sotlid', 'bitjaru', 'japgwi'];
const ENEMY_COLOR: Record<string, number> = { geuseundae: 0x5a4a7a, dueoksini: 0x6a4a3a, jinegaksi: 0x8a2a3a, gangcheori: 0x4a5a6a };
const hex = (c: string) => Number.parseInt(c.slice(1), 16);

type UnitView = Phaser.GameObjects.Container & { unitId: number; combineMarker: Phaser.GameObjects.Arc };

export class LaneScene extends Phaser.Scene {
  private driver: GameDriver;
  private units = new Map<number, UnitView>();
  private enemies = new Map<number, Phaser.GameObjects.Container>();
  private board!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fires!: Phaser.GameObjects.Graphics;
  private jangseung!: Phaser.GameObjects.Rectangle;
  private dragging: { view: UnitView; from: number } | null = null;
  private selectListeners: ((slot: number | null) => void)[] = [];
  private eventListeners: ((events: GameEvent[]) => void)[] = [];
  private openKey = '';

  constructor(driver: GameDriver) {
    super('lane');
    this.driver = driver;
  }

  onSelect(cb: (slot: number | null) => void): void { this.selectListeners.push(cb); }
  onEvents(cb: (events: GameEvent[]) => void): void { this.eventListeners.push(cb); }

  get state(): GameState { return this.driver.state; }
  get lane(): Lane { return laneOf(this.state); }

  preload(): void {
    for (const id of SPRITES) this.load.image(id, `sprites/${id}.png`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0a14');
    this.board = this.add.graphics();
    this.fires = this.add.graphics();
    this.overlay = this.add.graphics().setDepth(5);
    const post = laneToCanvas({ x: this.lane.cols + 0.9, y: this.lane.rows + 0.4 });
    this.jangseung = this.add.rectangle(post.x, post.y, 8, 22, 0x8a6a4a).setStrokeStyle(1, 0x2a1a0e);
    this.drawBoard();
    this.driver.onEvents(events => this.handleEvents(events));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      if (!hit.length) this.emitSelect(canvasToCell(p.x, p.y));
    });
  }

  reset(): void {
    for (const v of this.units.values()) v.destroy();
    for (const v of this.enemies.values()) v.destroy();
    this.units.clear();
    this.enemies.clear();
    this.openKey = '';
  }

  private emitSelect(slot: number | null): void {
    for (const cb of this.selectListeners) cb(slot);
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
    for (const c of lane.cells) {
      const p = laneToCanvas({ x: c.col, y: c.row });
      const open = this.state.open[c.index];
      g.fillStyle(!open ? 0x141018 : c.isEdge ? 0x2a2438 : 0x221d30, 1);
      g.fillRect(p.x + 1, p.y + 1, CELL - 2, CELL - 2);
      if (!open) { g.lineStyle(1, 0x2a2232, 1); g.lineBetween(p.x + 4, p.y + 4, p.x + CELL - 4, p.y + CELL - 4); }
    }
    this.openKey = this.state.open.map(o => (o ? 1 : 0)).join('');
  }

  private drawCoverage(slot: number, range: number): void {
    const g = this.overlay;
    g.clear();
    g.lineStyle(6, 0xffe08a, 0.45);
    for (const [a, b] of this.lane.coverage(slot, range)) {
      g.beginPath();
      for (let d = a; d <= b + 1e-6; d += 0.1) {
        const p = laneToCanvas(this.lane.pointAt(Math.min(d, b)));
        if (d === a) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.strokePath();
    }
  }

  private makeUnitView(unitId: number, defId: string): UnitView {
    const def = unitDefFast(this.state.data, defId);
    const view = this.add.container(0, 0) as UnitView;
    view.unitId = unitId;
    if (this.textures.exists(defId)) {
      view.add(this.add.image(0, 0, defId));
    } else {
      view.add(this.add.circle(0, 0, 11, hex(GRADE_COLOR[def.grade] ?? '#ffffff')).setStrokeStyle(1, 0x000000));
      view.add(this.add.text(0, 0, def.name.slice(0, 1), { fontSize: '11px', color: '#10101a', fontFamily: 'sans-serif' }).setOrigin(0.5));
    }
    view.add(this.add.circle(0, -14, 2, hex(GRADE_COLOR[def.grade] ?? '#ffffff')));
    view.combineMarker = this.add.circle(12, -12, 3, 0xffd65c);
    view.add(view.combineMarker);
    view.setSize(CELL, CELL).setInteractive({ draggable: true, useHandCursor: true }).setDepth(3);
    view.on('dragstart', () => {
      const from = this.state.slots.findIndex(u => u?.id === unitId);
      if (from < 0) return;
      this.dragging = { view, from };
      view.setDepth(10);
    });
    view.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => {
      view.setPosition(x, y);
      const cell = canvasToCell(x, y);
      if (cell !== null && this.state.open[cell]) this.drawCoverage(cell, def.range);
      else this.overlay.clear();
    });
    view.on('dragend', () => {
      if (!this.dragging) return;
      const cell = canvasToCell(view.x, view.y);
      if (cell !== null && cell !== this.dragging.from) this.driver.queue({ type: 'move', from: this.dragging.from, to: cell });
      this.dragging = null;
      view.setDepth(3);
      this.overlay.clear();
      this.placeUnits(true);
    });
    view.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 4) {
        const slot = this.state.slots.findIndex(u => u?.id === unitId);
        this.emitSelect(slot);
        this.drawCoverage(slot, def.range);
        this.time.delayedCall(900, () => { if (!this.dragging) this.overlay.clear(); });
      }
    });
    return view;
  }

  private placeUnits(snap = false): void {
    const seen = new Set<number>();
    let unitsChanged = false;
    this.state.slots.forEach((u, slot) => {
      if (!u) return;
      seen.add(u.id);
      let view = this.units.get(u.id);
      if (!view) {
        view = this.makeUnitView(u.id, u.defId);
        this.units.set(u.id, view);
        unitsChanged = true;
      }
      if (this.dragging?.view === view) return;
      const c = this.lane.cells[slot]!;
      const p = laneToCanvas({ x: c.x, y: c.y });
      if (snap || view.x === 0) view.setPosition(p.x, p.y);
      else if (view.x !== p.x || view.y !== p.y) this.tweens.add({ targets: view, x: p.x, y: p.y, duration: 80 });
    });
    for (const [id, view] of this.units) {
      if (seen.has(id)) continue;
      view.destroy();
      this.units.delete(id);
      unitsChanged = true;
    }
    if (unitsChanged) this.updateCombineMarkers();
  }

  private updateCombineMarkers(): void {
    const ready = new Set(availableRecipes(this.state));
    const materials = new Set(
      this.state.data.recipes.filter(recipe => ready.has(recipe.result)).flatMap(recipe => recipe.materials),
    );
    for (const unit of this.state.slots) {
      if (unit) this.units.get(unit.id)?.combineMarker.setVisible(materials.has(unit.defId));
    }
  }

  private placeEnemies(): void {
    const seen = new Set<number>();
    for (const e of this.state.enemies) {
      seen.add(e.id);
      let view = this.enemies.get(e.id);
      if (!view) {
        view = this.add.container(0, 0).setDepth(2);
        if (this.textures.exists(e.defId)) view.add(this.add.image(0, 0, e.defId).setScale(e.boss ? 1.6 : 0.6));
        else view.add(this.add.circle(0, 0, e.boss ? 14 : 6, ENEMY_COLOR[e.defId] ?? 0x7a6a9a).setStrokeStyle(1, 0xb8a8e8, 0.8));
        if (e.boss) {
          view.add(this.add.rectangle(0, -20, 30, 3, 0x2a0a0a).setName('hpBack'));
          view.add(this.add.rectangle(-15, -20, 30, 3, 0xff3b2f).setOrigin(0, 0.5).setName('hp'));
        }
        this.enemies.set(e.id, view);
      }
      const p = laneToCanvas(this.lane.pointAt(e.d));
      view.setPosition(p.x, p.y);
      const hp = view.getByName('hp') as Phaser.GameObjects.Rectangle | null;
      if (hp) hp.width = 30 * Math.max(0, e.hp / e.maxHp);
    }
    for (const [id, view] of this.enemies) if (!seen.has(id)) { view.destroy(); this.enemies.delete(id); }
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
    for (const e of events) {
      if (e.type === 'attack') this.projectile(e.unitId, e.enemyId);
      if (e.type === 'summon' || e.type === 'combine') {
        this.placeUnits();
        const view = this.units.get(e.unitId);
        if (view && e.type === 'summon') this.revealSummon(view, e.grade);
        if (view && e.type === 'combine') this.tweens.add({ targets: view, scaleX: 1.3, scaleY: 0.7, duration: 90, yoyo: true, ease: 'Quad.Out' });
      }
    }
    for (const cb of this.eventListeners) cb(events);
  }

  private revealSummon(view: UnitView, grade: number): void {
    view.setVisible(false);
    const flame = this.add.circle(view.x, view.y, 6, hex(GRADE_COLOR[grade] ?? '#ffffff'), 0.9).setDepth(7);
    this.tweens.add({ targets: flame, radius: 14, alpha: 0.4, duration: 300, onComplete: () => {
      flame.destroy();
      view.setVisible(true).setScale(0.5);
      this.tweens.add({ targets: view, scale: 1, duration: 260, ease: 'Back.Out' });
    } });
    if (grade >= 3) this.cameras.main.shake(200, 0.01);
  }

  private projectile(unitId: number, enemyId: number): void {
    const from = this.units.get(unitId);
    const to = this.state.enemies.find(x => x.id === enemyId);
    const u = this.state.slots.find(s => s?.id === unitId);
    if (!from || !to || !u) return;
    const target = laneToCanvas(this.lane.pointAt(to.d));
    const magical = unitDefFast(this.state.data, u.defId).damageType === 'magical';
    if (magical) {
      const dot = this.add.circle(from.x, from.y - 6, 2, 0x7fd0ff).setDepth(6);
      this.tweens.add({ targets: dot, x: target.x, y: target.y, duration: 150, onComplete: () => dot.destroy() });
    } else {
      this.tweens.add({ targets: from, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, onComplete: () => from.setAngle(0) });
    }
  }

  update(_time: number, delta: number): void {
    this.driver.update(delta);
    const key = this.state.open.map(o => (o ? 1 : 0)).join('');
    if (key !== this.openKey) this.drawBoard();
    this.placeUnits();
    this.placeEnemies();
    this.drawFires();
    const danger = Math.min(1, countNormalEnemies(this.state) / this.state.data.balance.limit);
    this.jangseung.setFillStyle(danger > 1 - 1e-9 ? 0xc04a3a : danger > 0.66 ? 0xa0704a : 0x8a6a4a);
    this.jangseung.setAngle(this.state.overLimitTicks > 0 ? Math.sin(this.time.now / 40) * 8 : 0);
  }
}

export const LANE_CANVAS = { width: CENTER_W, height: CENTER_H };
