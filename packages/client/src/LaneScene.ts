import Phaser from 'phaser';
import { availableRecipes, countNormalEnemies, laneOf, loopPos, unitDefFast, type GameEvent, type GameState, type Lane } from '@dorandi/logic';
import { selectedSlot } from './ui/models';
import type { GameDriver } from './driver';
import { CELL, CENTER_H, CENTER_W, GRADE_COLOR, canvasToCell, laneToCanvas } from './layout';

const ENEMY_COLOR: Record<string, number> = { geuseundae: 0x5a4a7a, dueoksini: 0x6a4a3a, jinegaksi: 0x8a2a3a, gangcheori: 0x4a5a6a };
const hex = (c: string) => Number.parseInt(c.slice(1), 16);

type UnitView = Phaser.GameObjects.Container & { targetSlot?: number; motion?: Phaser.Tweens.Tween; unitId: number; combineMarker: Phaser.GameObjects.Arc };

export class LaneScene extends Phaser.Scene {
  private driver: GameDriver;
  private units = new Map<number, UnitView>();
  private enemies = new Map<number, Phaser.GameObjects.Container>();
  private board!: Phaser.GameObjects.Graphics;
  private coverage!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fires!: Phaser.GameObjects.Graphics;
  private jangseung!: Phaser.GameObjects.Rectangle;
  private dragging: { view: UnitView; from: number } | null = null;
  private selectListeners: ((slot: number | null) => void)[] = [];
  private eventListeners: ((events: GameEvent[]) => void)[] = [];
  selectedId: number | null = null;
  private hoveredId: number | null = null;
  private effects!: Phaser.GameObjects.Group;
  private failed = false;
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
    const data = this.driver.state.data;
    for (const def of [...data.units, ...data.enemies]) this.load.image(def.id, `sprites/${def.id}.png`);
  }

  private warned = new Set<string>();
  private hasTexture(id: string): boolean {
    if (this.textures.exists(id)) return true;
    if (!this.warned.has(id)) { this.warned.add(id); console.warn(`missing sprite texture: ${id}`); }
    return false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0a14');
    this.board = this.add.graphics();
    this.effects = this.add.group();
    this.fires = this.add.graphics();
    this.coverage = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(5);
    const post = laneToCanvas({ x: this.lane.cols + 0.9, y: this.lane.rows + 0.4 });
    this.jangseung = this.add.rectangle(post.x, post.y, 8, 22, 0x8a6a4a).setStrokeStyle(1, 0x2a1a0e);
    this.drawBoard();
    this.driver.onEvents(events => this.handleEvents(events));
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      if (p.rightButtonDown()) this.emitSelect(null);
      else if (!hit.length) this.emitSelect(canvasToCell(p.x, p.y));
    });
  }

  reset(): void {
    for (const v of this.units.values()) v.destroy();
    for (const v of this.enemies.values()) v.destroy();
    this.tweens.killAll();
    this.effects.clear(true, true);
    this.dragging = null;
    this.hoveredId = null;
    this.selectedId = null;
    this.overlay.clear();
    this.coverage.clear();
    this.fires.clear();
    this.cameras.main.resetFX();
    this.failed = false;
    document.getElementById('error')!.hidden = true;
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
    this.coverage.clear();
    const draw = (id: number | null, alpha: number) => {
      const slot = selectedSlot(this.state, id);
      if (slot === null) return;
      const unit = this.state.slots[slot]!;
      const view = this.units.get(unit.id);
      if (!view) return;
      const cell = view === this.dragging?.view ? canvasToCell(view.x, view.y) : slot;
      if (cell !== null && this.state.open[cell]) {
        this.drawCoverage(cell, unitDefFast(this.state.data, unit.defId).range, alpha);
      }
      if (id === this.selectedId) {
        this.overlay.lineStyle(2, 0xffe08a).strokeRect(view.x - 15, view.y - 15, 30, 30);
      }
    };
    if (this.hoveredId !== this.selectedId) draw(this.hoveredId, 0.22);
    draw(this.selectedId, 0.65);
  }

  private makeUnitView(unitId: number, defId: string): UnitView {
    const def = unitDefFast(this.state.data, defId);
    const view = this.add.container(0, 0) as UnitView;
    view.unitId = unitId;
    if (this.hasTexture(defId)) {
      view.add(this.add.image(0, 0, defId));
    } else {
      view.add(this.add.circle(0, 0, 11, hex(GRADE_COLOR[def.grade] ?? '#ffffff')).setStrokeStyle(1, 0x000000));
      view.add(this.add.text(0, 0, def.name.slice(0, 1), { fontSize: '11px', color: '#10101a', fontFamily: 'sans-serif' }).setOrigin(0.5));
    }
    view.add(this.add.circle(0, -14, 2, hex(GRADE_COLOR[def.grade] ?? '#ffffff')));
    view.combineMarker = this.add.circle(12, -12, 3, 0xffd65c);
    view.add(view.combineMarker);
    view.setSize(CELL, CELL).setInteractive({ draggable: true, useHandCursor: true }).setDepth(3);
    view.on('pointerover', () => { this.hoveredId = unitId; });
    view.on('pointerout', () => { if (this.hoveredId === unitId) this.hoveredId = null; });
    view.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const from = this.state.slots.findIndex(u => u?.id === unitId);
      if (from < 0) return;
      this.emitSelect(from);
      view.motion?.stop();
      this.dragging = { view, from };
      view.setDepth(10);
    });
    view.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => {
      if (this.dragging?.view === view) view.setPosition(x, y);
    });
    view.on('dragend', () => {
      if (this.dragging?.view !== view) return;
      const cell = canvasToCell(view.x, view.y);
      if (cell !== null && this.state.open[cell] && cell !== this.dragging.from && !this.driver.paused) {
        this.driver.queue({ type: 'move', from: this.dragging.from, to: cell });
      } else {
        view.targetSlot = undefined;
      }
      this.dragging = null;
      view.setDepth(3);
    });
    view.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0 && p.getDistance() < 4) {
        const slot = this.state.slots.findIndex(u => u?.id === unitId);
        this.emitSelect(slot);
      }
    });
    return view;
  }

  private placeUnits(): void {
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
      if (this.dragging?.view === view) this.dragging = null;
      view.motion?.stop();
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

  private makeEnemy(id: number, defId: string, boss: boolean): Phaser.GameObjects.Container {
    const spawn = laneToCanvas(this.lane.pointAt(0));
    const view = this.add.container(spawn.x, spawn.y).setDepth(2);
    const radius = boss ? 14 : 6;
    const body = this.hasTexture(defId)
      ? this.add.image(0, 0, defId).setScale(boss ? 1 : 0.75)
      : this.add.circle(0, 0, radius, ENEMY_COLOR[defId] ?? 0x7a6a9a).setStrokeStyle(1, 0xb8a8e8);
    const width = boss ? 44 : 18;
    const y = boss ? -28 : -15;
    view.add([body, this.add.rectangle(0, y, width + 2, 4, 0x100e14),
      this.add.rectangle(-width / 2, y, width, 2, boss ? 0xff715c : 0x83d5a3).setOrigin(0, 0.5).setName('hp')]);
    this.enemies.set(id, view);
    return view;
  }

  private placeEnemies(): void {
    for (const enemy of this.state.enemies) {
      const view = this.enemies.get(enemy.id) ?? this.makeEnemy(enemy.id, enemy.defId, enemy.boss);
      const p = laneToCanvas(this.lane.pointAt(this.driver.enemyDistance(enemy.id, enemy.d)));
      view.setPosition(p.x, p.y);
      this.clearFlash(view);
      (view.getByName('hp') as Phaser.GameObjects.Rectangle).setScale(Math.max(0, enemy.hp / enemy.maxHp), 1);
    }
  }

  private showHit(event: Extract<GameEvent, { type: 'damage' }>): void {
    const view = this.enemies.get(event.enemyId);
    if (!view) return;
    const body = view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    if (body instanceof Phaser.GameObjects.Image) body.setTintFill(0xffffff);
    else {
      if (body.getData('color') === undefined) body.setData('color', body.fillColor);
      body.setFillStyle(0xffffff);
    }
    view.setData('flashUntil', this.time.now + 85);
    if (event.effect) {
      const label = this.add.text(view.x, view.y - 12, String(event.amount), {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#ffe08a', stroke: '#241522', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(8);
      this.effects.add(label);
      this.tweens.add({ targets: label, y: label.y - 15, alpha: 0, duration: 450, onComplete: () => label.destroy() });
    }
  }

  private clearFlash(view: Phaser.GameObjects.Container): void {
    if (!view.getData('flashUntil') || this.time.now < view.getData('flashUntil')) return;
    const body = view.first as Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    if (body instanceof Phaser.GameObjects.Image) body.clearTint();
    else body.setFillStyle(body.getData('color'));
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
    for (const e of events) {
      if (e.type === 'spawn') {
        const boss = this.state.data.enemies.find(def => def.id === e.defId)!.boss;
        this.makeEnemy(e.enemyId, e.defId, boss);
      }
      if (e.type === 'damage') this.showHit(e);
      if (e.type === 'kill') {
        const view = this.enemies.get(e.enemyId);
        if (view) {
          this.enemies.delete(e.enemyId);
          this.effects.add(view);
          (view.getByName('hp') as Phaser.GameObjects.Rectangle).setVisible(false);
          this.tweens.add({ targets: view, scale: 1.3, alpha: 0, duration: 145, onComplete: () => view.destroy() });
        }
      }
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
    this.effects.add(flame);
    this.tweens.add({ targets: flame, radius: 14, alpha: 0.4, duration: 300, onComplete: () => {
      flame.destroy();
      if (!view.active) return;
      view.setVisible(true).setScale(0.5);
      this.tweens.add({ targets: view, scale: 1, duration: 260, ease: 'Back.Out' });
    } });
    if (grade >= 3) this.cameras.main.shake(200, 0.01);
  }

  private projectile(unitId: number, enemyId: number): void {
    const from = this.units.get(unitId);
    const to = this.enemies.get(enemyId);
    const u = this.state.slots.find(s => s?.id === unitId);
    if (!from || !to || !u) return;
    const target = { x: to.x, y: to.y };
    const magical = unitDefFast(this.state.data, u.defId).damageType === 'magical';
    if (magical) {
      const dot = this.add.circle(from.x, from.y - 6, 2, 0x7fd0ff).setDepth(6);
      this.effects.add(dot);
      this.tweens.add({ targets: dot, x: target.x, y: target.y, duration: 150, onComplete: () => dot.destroy() });
    } else {
      this.tweens.add({ targets: from, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, onComplete: () => from.setAngle(0) });
    }
  }

  update(_time: number, delta: number): void {
    if (this.failed) return;
    try {
      this.driver.update(delta);
      this.renderBoard();
      this.onFrame?.();
    } catch (error) {
      this.failed = true;
      console.error(error);
      const banner = document.getElementById('error')!;
      banner.textContent = `게임 오류 · ${error instanceof Error ? error.message : String(error)}`;
      banner.hidden = false;
    }
  }

  onFrame?: () => void;

  private renderBoard(): void {
    const key = this.state.open.map(o => (o ? 1 : 0)).join('');
    if (key !== this.openKey) this.drawBoard();
    this.placeUnits();
    this.placeEnemies();
    this.drawFires();
    this.drawSelection();
    const danger = Math.min(1, countNormalEnemies(this.state) / this.state.data.balance.limit);
    this.jangseung.setFillStyle(danger > 1 - 1e-9 ? 0xc04a3a : danger > 0.66 ? 0xa0704a : 0x8a6a4a);
    this.jangseung.setAngle(this.state.overLimitTicks > 0 ? Math.sin(this.time.now / 40) * 8 : 0);
  }
}

export const LANE_CANVAS = { width: CENTER_W, height: CENTER_H };
