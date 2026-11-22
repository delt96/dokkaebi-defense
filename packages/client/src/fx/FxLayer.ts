import Phaser from 'phaser';
import { FX_KEYS, areaSheet, hitKey, pierceSheet, quarterTurn, statusKey, textureKey } from './atlas';
import { FX_SHEETS, type FxKey } from './manifest';
import { FROST_ALPHA, FX_FLAGS, FxBudget, PRIORITY, gradeHex, slowLook, type EnemyStatus, type FxCmd, type FxFlags, type Priority, type ShotStyle } from './plan';
import { Pool } from './pool';

type Pt = { x: number; y: number };

/** Depths: board and fire 0, ground effects under the units, enemies 2, units 3, HP bars 6, numbers 8. */
export const FX_DEPTH = { ground: 0.6, status: 2.5, air: 4, unitOverlay: 5, hp: 6, top: 9, text: 9.5 } as const;

/**
 * Transient effects. Most are pixelfx sheets (`sheet`); a few stay drawn with Phaser graphics because
 * pixelfx has nothing that fits: the shot in flight (any angle, a few px), the knockback streak, the
 * yeoksin walking out, the edge glow, the boss banner, damage numbers.
 */
type RecKind = 'sheet' | 'shot' | 'swing' | 'cast' | 'knock' | 'edge' | 'leave' | 'number';

interface Rec {
  kind: RecKind; t0: number; dur: number; budgeted: boolean;
  x: number; y: number; x2: number; y2: number; color: number;
  enemyId: number; unitId: number; style: ShotStyle | null; dir: number;
  sprite: Phaser.GameObjects.Sprite | null;
  /** The sheet sticks to this enemy or unit while it plays. */
  follow: 'enemy' | 'unit' | null; dx: number; dy: number;
}

export interface FxHost {
  enemyPos(id: number): Pt | null;
  unitPos(id: number): Pt | null;
  pointAt(d: number): Pt;
  width: number;
  height: number;
}

/** An enemy's status as drawn: `feet` is the bottom of its sprite, `scale` the sprite's scale. */
export interface StatusView { id: number; defId: string; x: number; y: number; feet: number; scale: number; r: number; status: EnemyStatus }
/** A unit standing in an ally aura (feet = bottom of its sprite). */
export interface AuraView { id: number; x: number; feet: number }

const ease = (p: number) => 1 - (1 - p) * (1 - p);
/** Shot flight times (ms): short, so a far target never leaves a dot hanging in the air. */
const SHOT_MS = { magical: 170, physical: 130 };
/** The sheet anchor sits this far below an enemy's centre (sparks fly at its body, debris lands at its feet). */
const HIT_DROP = 10;
/** pixelfx floats its halo over a 38 px character; ours are 32 px, so its feet go this much lower. */
const HALO_DROP = 12;

const sheetMs = (key: FxKey): number => (FX_SHEETS[key].frames / FX_SHEETS[key].fps) * 1000;

export class FxLayer {
  readonly budget = new FxBudget();
  flags: FxFlags = FX_FLAGS(false);
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.Graphics;
  private readonly air: Phaser.GameObjects.Graphics;
  private readonly top: Phaser.GameObjects.Graphics;
  private readonly toastText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private toastStart = 0;
  private bannerUntil = 0;
  private bannerStart = 0;
  private readonly recs: Rec[] = [];
  private readonly pool = new Pool<Rec>(
    () => ({ kind: 'shot', t0: 0, dur: 1, budgeted: false, x: 0, y: 0, x2: 0, y2: 0, color: 0, enemyId: 0, unitId: 0, style: null, dir: 1, sprite: null, follow: null, dx: 0, dy: 0 }),
    r => { r.style = null; r.budgeted = false; r.sprite = null; r.follow = null; r.dx = 0; r.dy = 0; },
  );
  private readonly sprites: Pool<Phaser.GameObjects.Sprite>;
  private readonly numberPool: Pool<Phaser.GameObjects.Text>;
  private readonly numberOf = new Map<Rec, Phaser.GameObjects.Text>();
  /** Sheets that loaded (a missing file only loses its effect). */
  private readonly ready = new Set<FxKey>();
  /** Looping overlays: stun stars and frost on enemies, halos on aura-buffed units. */
  private readonly stunOn = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly frostOn = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly haloOn = new Map<number, Phaser.GameObjects.Sprite>();
  /** Yeoksin mist: where it stands and since when. */
  private mist: { x: number; y: number; since: number } | null = null;
  /** Bumped by clear() so delayed fireworks from a dropped lane never start. */
  private epoch = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly host: FxHost) {
    this.ground = scene.add.graphics().setDepth(FX_DEPTH.ground);
    this.status = scene.add.graphics().setDepth(FX_DEPTH.status);
    this.air = scene.add.graphics().setDepth(FX_DEPTH.air);
    this.top = scene.add.graphics().setDepth(FX_DEPTH.top);
    const label = { fontFamily: 'sans-serif', fontStyle: 'bold', stroke: '#140c18', strokeThickness: 3, padding: { top: 2 } };
    this.toastText = scene.add.text(host.width / 2, 30, '', { ...label, fontSize: '13px', color: '#ffd28a' }).setOrigin(0.5).setDepth(FX_DEPTH.text).setVisible(false);
    this.bannerText = scene.add.text(host.width / 2, Math.round(host.height * 0.5), '', { ...label, fontSize: '13px', color: '#ffe0d6' }).setOrigin(0.5).setDepth(FX_DEPTH.text).setVisible(false);
    this.numberPool = new Pool<Phaser.GameObjects.Text>(
      () => scene.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '11px', color: '#ffe08a', stroke: '#241522', strokeThickness: 2, padding: { top: 2 } }).setOrigin(0.5, 1).setDepth(8),
      t => { t.setVisible(false); },
      { max: 48, dispose: t => t.destroy() },
    );
    this.sprites = new Pool<Phaser.GameObjects.Sprite>(
      () => scene.add.sprite(0, 0, '__DEFAULT').setVisible(false),
      s => { s.stop(); s.setVisible(false).setScale(1).setRotation(0).setAlpha(1).setFlipX(false).clearTint(); },
      { max: 160, dispose: s => s.destroy() },
    );
    for (const key of FX_KEYS) {
      const tk = textureKey(key);
      if (!scene.textures.exists(tk)) continue;
      const sheet = FX_SHEETS[key];
      if (!scene.anims.exists(tk)) {
        scene.anims.create({
          key: tk,
          frames: scene.anims.generateFrameNames(tk, { start: 0, end: sheet.frames - 1 }),
          frameRate: sheet.fps,
          repeat: sheet.loop ? -1 : 0,
        });
      }
      this.ready.add(key);
    }
  }

  setReduced(on: boolean): void {
    this.budget.reduced = on;
    this.flags = FX_FLAGS(on);
  }

  get activeCount(): number { return this.recs.length; }
  /** Sheets playing right now (transient and looping), for the performance check. */
  get spriteCount(): number { return this.recs.filter(r => r.sprite).length + this.stunOn.size + this.frostOn.size + this.haloOn.size; }

  private add(kind: RecKind, priority: Priority, dur: number, now: number): Rec | null {
    if (!this.budget.admit(priority)) return null;
    const r = this.pool.acquire();
    r.kind = kind; r.t0 = now; r.dur = dur; r.budgeted = true; r.dir = 1;
    this.recs.push(r);
    return r;
  }

  /** A pooled sprite playing `key` from its first frame, anchored where the effect was drawn from. */
  private sprite(key: FxKey, x: number, y: number, depth: number): Phaser.GameObjects.Sprite {
    const tk = textureKey(key), sheet = FX_SHEETS[key];
    const s = this.sprites.acquire();
    s.setTexture(tk, '0').setOrigin(sheet.px / sheet.w, sheet.py / sheet.h).setPosition(x, y).setDepth(depth).setVisible(true);
    s.play(tk);
    return s;
  }

  /** Play a one-shot sheet through the budget. */
  private sheet(key: FxKey | null, priority: Priority, x: number, y: number, depth: number, opts: { scale?: number; rotation?: number; flip?: boolean; tint?: number; follow?: 'enemy' | 'unit'; id?: number } = {}, now = this.scene.time.now): Rec | null {
    if (!key || !this.ready.has(key)) return null;
    const r = this.add('sheet', priority, sheetMs(key), now);
    if (!r) return null;
    const s = this.sprite(key, x, y, depth);
    if (opts.scale !== undefined && opts.scale !== 1) s.setScale(opts.scale);
    if (opts.rotation) s.setRotation(opts.rotation);
    if (opts.flip) s.setFlipX(true);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    r.sprite = s;
    if (opts.follow && opts.id !== undefined) {
      const at = opts.follow === 'enemy' ? this.host.enemyPos(opts.id) : this.host.unitPos(opts.id);
      r.follow = opts.follow;
      if (opts.follow === 'enemy') r.enemyId = opts.id; else r.unitId = opts.id;
      r.dx = at ? x - at.x : 0;
      r.dy = at ? y - at.y : 0;
    }
    return r;
  }

  /** A damage number (crit, execute, explosion) through the same budget. */
  number(x: number, y: number, text: string, now: number): void {
    const r = this.add('number', PRIORITY.mid, 450, now);
    if (!r) return;
    r.x = x; r.y = y;
    const t = this.numberPool.acquire().setText(text).setPosition(x, y).setAlpha(1).setVisible(true);
    this.numberOf.set(r, t);
  }

  private hitAt(enemyId: number, key: FxKey, priority: Priority, flip: boolean, now: number, scale = 1): void {
    const at = this.host.enemyPos(enemyId);
    if (at) this.sheet(key, priority, at.x, at.y + HIT_DROP, FX_DEPTH.air, { flip, scale, follow: 'enemy', id: enemyId }, now);
  }

  private shotHit(enemyId: number, style: ShotStyle, priority: Priority, flip: boolean, now: number): void {
    const scale = this.budget.reduced || style.grade < 5 ? 1 : style.grade === 6 ? 1.5 : 1.25;
    this.hitAt(enemyId, hitKey(style), priority, flip, now, scale);
  }

  run(cmd: FxCmd, now: number): void {
    const h = this.host;
    switch (cmd.kind) {
      case 'shot': {
        const from = h.unitPos(cmd.unitId);
        const to = h.enemyPos(cmd.enemyId);
        if (!from || !to) return;
        const s = cmd.style;
        if (s.melee) {
          this.shotHit(cmd.enemyId, s, cmd.priority, to.x < from.x, now);
          const swing = s.grade >= 5 && this.flags.trails ? this.add('swing', cmd.priority, 110, now) : null;
          if (swing) {
            swing.x = from.x; swing.y = from.y;
            swing.x2 = to.x; swing.y2 = to.y;
            swing.style = s;
          }
          return;
        }
        const r = this.add('shot', cmd.priority, s.magical ? SHOT_MS.magical : SHOT_MS.physical, now);
        if (!r) return;
        r.x = from.x; r.y = from.y - 6; r.x2 = to.x; r.y2 = to.y; r.enemyId = cmd.enemyId; r.style = s;
        r.dir = to.x < from.x ? -1 : 1;
        return;
      }
      case 'cast': {
        const at = h.unitPos(cmd.unitId);
        if (!at || !this.flags.trails || this.recs.some(r => r.kind === 'cast' && r.unitId === cmd.unitId)) return;
        const flash = this.add('cast', cmd.priority, 155, now);
        if (flash) { flash.x = at.x; flash.y = at.y; flash.color = cmd.color; flash.unitId = cmd.unitId; }
        return;
      }
      case 'splash': case 'frost': case 'explode': {
        const at = h.enemyPos(cmd.enemyId);
        if (!at) return;
        const area = areaSheet(cmd.kind === 'splash' ? 'ring' : cmd.kind === 'frost' ? 'frost' : 'blast', cmd.radius);
        if (!area) return;
        const depth = cmd.kind === 'explode' ? FX_DEPTH.air : FX_DEPTH.ground;
        this.sheet(area.key, cmd.priority, at.x, at.y, depth, { scale: area.scale, tint: cmd.kind === 'splash' ? lighten(cmd.color) : undefined }, now);
        return;
      }
      case 'pulse': {
        const at = h.unitPos(cmd.unitId);
        const area = areaSheet('ring', cmd.radius);
        if (!at || !area) return;
        this.sheet(area.key, cmd.priority, at.x, at.y, FX_DEPTH.ground, { scale: area.scale, tint: lighten(cmd.color), follow: 'unit', id: cmd.unitId }, now);
        return;
      }
      case 'stunHit':
        this.hitAt(cmd.enemyId, 'hit-heavy', cmd.priority, false, now);
        return;
      case 'crit':
        this.hitAt(cmd.enemyId, 'crit', cmd.priority, false, now);
        return;
      case 'slash':
        this.hitAt(cmd.enemyId, 'execute', cmd.priority, false, now);
        return;
      case 'pierce': {
        const pts = cmd.enemyIds.map(id => h.enemyPos(id)).filter((p): p is Pt => !!p);
        const sheet = pierceSheet(cmd.length);
        if (pts.length < 2 || !sheet) return;
        const a = pts[0]!, b = pts[pts.length - 1]!;
        // the thrust leaves from just in front of the target and runs through the ones behind it
        this.sheet(sheet.key, cmd.priority, a.x, a.y, FX_DEPTH.air, { scale: sheet.scale, rotation: quarterTurn(b.x - a.x, b.y - a.y) }, now);
        return;
      }
      case 'knock': {
        const a = h.pointAt(cmd.fromD);
        const b = h.pointAt(cmd.toD);
        const r = this.add('knock', cmd.priority, 280, now);
        if (r) { r.x = a.x; r.y = a.y; r.x2 = b.x; r.y2 = b.y; r.enemyId = cmd.enemyId; }
        this.sheet('knock', cmd.priority, b.x, b.y + 12, FX_DEPTH.ground, {}, now);
        return;
      }
      case 'bigUnit': {
        const at = h.unitPos(cmd.unitId);
        const color = gradeHex(cmd.grade);
        if (at) this.sheet('big', PRIORITY.high, at.x, at.y, FX_DEPTH.air, { follow: 'unit', id: cmd.unitId }, now);
        if (this.flags.edgeGlow) {
          const e = this.add('edge', PRIORITY.high, 750, now)!;
          e.color = color;
        }
        this.toast(`★ ${cmd.name}`, color, now);
        return;
      }
      case 'boss': {
        const at = h.enemyPos(cmd.enemyId) ?? h.pointAt(0);
        this.sheet('boss', PRIORITY.high, at.x, at.y + 14, FX_DEPTH.ground + 0.1, {}, now);
        if (this.flags.shake) this.scene.cameras.main.shake(150, 0.006);
        this.banner(`보스 출현 · ${cmd.name}`, now);
        return;
      }
    }
  }

  gambleHit(text: string, unitId: number | undefined, now: number): void {
    this.toast(text, 0xffd28a, now);
    const at = unitId === undefined ? null : this.host.unitPos(unitId);
    if (at && this.flags.rays) this.sheet('firework', PRIORITY.high, at.x, at.y, FX_DEPTH.air, {}, now);
    if (this.flags.shake) this.scene.cameras.main.shake(140, 0.003);
  }

  toast(text: string, color: number, now: number): void {
    this.toastText.setText(text).setColor(`#${color.toString(16).padStart(6, '0')}`).setVisible(true);
    this.toastStart = now;
    this.toastUntil = now + 1500;
  }

  banner(text: string, now: number): void {
    this.bannerText.setText(text).setVisible(true);
    this.bannerStart = now;
    this.bannerUntil = now + 1400;
  }

  /** Round cleared: fireworks over the middle of the lane (one with reduced effects). */
  roundClear(now: number): void {
    const w = this.host.width, hgt = this.host.height;
    const spots = this.flags.rays ? [{ x: w * 0.5, y: hgt * 0.42, at: 0 }, { x: w * 0.3, y: hgt * 0.5, at: 260 }, { x: w * 0.7, y: hgt * 0.48, at: 520 }] : [{ x: w * 0.5, y: hgt * 0.45, at: 0 }];
    const epoch = this.epoch;
    for (const s of spots) {
      if (s.at === 0) this.sheet('firework', PRIORITY.high, s.x, s.y, FX_DEPTH.air, {}, now);
      else this.scene.time.delayedCall(s.at, () => { if (epoch === this.epoch) this.sheet('firework', PRIORITY.high, s.x, s.y, FX_DEPTH.air); });
    }
  }

  /**
   * The yeoksin stands at `at` in this lane (mist around it; a red poof where it came in), or with null it
   * is gone: it walks out towards `side`, or, when `killed`, only the mist fades where it fell.
   */
  setMist(at: Pt | null, side: number, now: number, killed = false): void {
    if (at && !this.mist) {
      this.mist = { x: at.x, y: at.y, since: now };
      this.sheet('poof', PRIORITY.high, side < 0 ? 30 : this.host.width - 30, at.y, FX_DEPTH.air, {}, now);
    } else if (at && this.mist) { this.mist.x = at.x; this.mist.y = at.y; }
    else if (!at && this.mist) {
      const r = this.add('leave', PRIORITY.high, 700, now)!;
      r.x = this.mist.x; r.y = this.mist.y; r.dir = killed ? 0 : side;
      this.sheet('poof', PRIORITY.high, this.mist.x, this.mist.y, FX_DEPTH.air, {}, now);
      this.mist = null;
    }
  }

  clear(): void {
    for (const r of this.recs) { r.style = null; this.finish(r); }
    this.recs.length = 0;
    for (const m of [this.stunOn, this.frostOn, this.haloOn]) {
      for (const s of m.values()) this.sprites.release(s);
      m.clear();
    }
    this.epoch++;
    this.mist = null;
    this.toastUntil = 0;
    this.bannerUntil = 0;
    this.toastText.setVisible(false);
    this.bannerText.setVisible(false);
    for (const g of [this.ground, this.status, this.air, this.top]) g.clear();
  }

  private finish(r: Rec): void {
    if (r.budgeted) this.budget.release();
    const t = this.numberOf.get(r);
    if (t) { this.numberOf.delete(r); this.numberPool.release(t); }
    if (r.sprite) this.sprites.release(r.sprite);
    // a shot that lands throws its impact
    if (r.kind === 'shot' && r.style && r.t0 + r.dur <= this.scene.time.now) {
      const style = r.style, enemyId = r.enemyId, flip = r.dir < 0;
      this.pool.release(r);
      this.shotHit(enemyId, style, PRIORITY.low, flip, this.scene.time.now);
      return;
    }
    this.pool.release(r);
  }

  /** Redraws every running effect and the persistent marks; called once per frame. */
  update(now: number, statuses: StatusView[], auras: AuraView[]): void {
    const g = this.ground, a = this.air, s = this.status, t = this.top;
    g.clear(); a.clear(); s.clear(); t.clear();
    this.syncHalos(auras);
    this.drawMist(now);
    if (this.flags.statuses) this.syncStatuses(statuses);
    const live = this.recs.splice(0);
    for (const r of live) {
      const p = (now - r.t0) / r.dur;
      if (p >= 1) { this.finish(r); continue; }
      this.recs.push(r);
      this.draw(r, Math.max(0, p), now);
    }
    this.drawText(now);
  }

  /** One looping overlay per key in `map`, created, moved and dropped to match `want`. */
  private syncLoop(map: Map<number, Phaser.GameObjects.Sprite>, want: Map<number, { key: FxKey; x: number; y: number; scale: number; depth: number }>): void {
    for (const [id, spr] of map) {
      const w = want.get(id);
      if (!w || spr.texture.key !== textureKey(w.key)) { this.sprites.release(spr); map.delete(id); }
    }
    for (const [id, w] of want) {
      let spr = map.get(id);
      if (!spr) {
        if (!this.ready.has(w.key)) continue;
        spr = this.sprite(w.key, w.x, w.y, w.depth);
        // start loops at different frames so a crowd does not blink in step
        spr.anims.setProgress((id * 0.37) % 1);
        map.set(id, spr);
      }
      spr.setPosition(w.x, w.y).setScale(w.scale);
    }
  }

  private syncHalos(auras: AuraView[]): void {
    const want = new Map<number, { key: FxKey; x: number; y: number; scale: number; depth: number }>();
    for (const u of auras) want.set(u.id, { key: 'halo', x: u.x, y: u.feet + HALO_DROP, scale: 1, depth: FX_DEPTH.air - 0.1 });
    this.syncLoop(this.haloOn, want);
    // a quiet mark: a board full of buffed units should not glitter
    for (const s of this.haloOn.values()) {
      s.setAlpha(0.7);
      // reduced effects: the halo stays as a still mark
      if (this.flags.rays) { if (s.anims.isPaused) s.anims.resume(); } else if (!s.anims.isPaused) s.anims.pause();
    }
  }

  private syncStatuses(list: StatusView[]): void {
    const stun = new Map<number, { key: FxKey; x: number; y: number; scale: number; depth: number }>();
    const frost = new Map<number, { key: FxKey; x: number; y: number; scale: number; depth: number }>();
    for (const v of list) {
      const { stunned, slowed, marked } = v.status;
      if (stunned) {
        const key = statusKey('stun', v.defId);
        if (key) stun.set(v.id, { key, x: v.x, y: v.feet, scale: v.scale, depth: FX_DEPTH.status + 0.05 });
      }
      if (slowLook(slowed, this.flags).frost) {
        const key = statusKey('frozen', v.defId);
        if (key) frost.set(v.id, { key, x: v.x, y: v.feet, scale: v.scale, depth: FX_DEPTH.status });
      }
      if (marked) {
        // damage-taken mark: a small red arrowhead pointing down at the enemy's shoulder (pixelfx has no marker this small)
        const s = this.status;
        const x = v.x + v.r * 0.8;
        const y = v.y - v.r * 0.55;
        s.fillStyle(0xff4a6a, 1).fillTriangle(x - 3.5, y - 2, x + 3.5, y - 2, x, y + 3);
        s.lineStyle(1, 0x2a0612, 1).strokeTriangle(x - 3.5, y - 2, x + 3.5, y - 2, x, y + 3);
      }
    }
    this.syncLoop(this.stunOn, stun);
    this.syncLoop(this.frostOn, frost);
    // the sheet leaves the body clear (it shows tinted blue underneath); the frost around it stays faint
    for (const spr of this.frostOn.values()) spr.setAlpha(FROST_ALPHA);
  }

  private drawText(now: number): void {
    if (this.toastText.visible) {
      if (now >= this.toastUntil) this.toastText.setVisible(false);
      else {
        const p = (now - this.toastStart) / 1500;
        this.toastText.setAlpha(p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1).setY(30 - 6 * ease(Math.min(1, p * 4)));
      }
    }
    if (this.bannerText.visible) {
      if (now >= this.bannerUntil) this.bannerText.setVisible(false);
      else {
        const p = (now - this.bannerStart) / 1400;
        const alpha = p > 0.8 ? (1 - p) / 0.2 : 1;
        const slide = ease(Math.min(1, p * 8));
        const w = this.host.width;
        const y = this.bannerText.y;
        this.top.fillStyle(0x2a060c, 0.82 * alpha).fillRect(0, y - 12, w * slide, 24);
        this.top.lineStyle(1, 0xff5a4a, 0.9 * alpha).lineBetween(0, y - 12, w * slide, y - 12).lineBetween(0, y + 12, w * slide, y + 12);
        this.top.fillStyle(0xff5a4a, alpha);
        for (const cx of [18, w - 18]) this.top.fillTriangle(cx - 5, y + 5, cx + 5, y + 5, cx, y - 6);
        this.bannerText.setAlpha(alpha * slide);
      }
    }
  }

  private drawMist(now: number): void {
    const m = this.mist;
    if (!m) return;
    const g = this.ground;
    if (!this.flags.mist) {
      this.status.lineStyle(1.5, 0xd0303a, 0.7).strokeCircle(m.x, m.y, 17);
      return;
    }
    const fadeIn = Math.min(1, (now - m.since) / 500);
    for (let k = 0; k < 7; k++) {
      const ang = k * 0.9 + now / (1400 + k * 90);
      const rr = 12 + (k % 3) * 6;
      g.fillStyle(k % 2 ? 0x9a1822 : 0xc0303a, (0.09 + 0.03 * (k % 3)) * fadeIn);
      g.fillCircle(m.x + Math.cos(ang) * rr, m.y + Math.sin(ang) * rr * 0.6, 14 + (k % 4) * 4);
    }
  }

  private draw(r: Rec, p: number, now: number): void {
    const g = this.ground, a = this.air, h = this.host;
    switch (r.kind) {
      case 'sheet': {
        if (!r.follow || !r.sprite) return;
        const at = r.follow === 'enemy' ? h.enemyPos(r.enemyId) : h.unitPos(r.unitId);
        if (at) r.sprite.setPosition(at.x + r.dx, at.y + r.dy);
        return;
      }
      case 'shot': {
        const live = h.enemyPos(r.enemyId);
        if (live) { r.x2 = live.x; r.y2 = live.y; }
        const st = r.style!;
        const q = Math.min(1, p * 1.15);
        const x = r.x + (r.x2 - r.x) * q;
        const y = r.y + (r.y2 - r.y) * q;
        if (st.trail && this.flags.trails) {
          for (let k = 1; k <= 4; k++) {
            const qq = Math.max(0, q - k * 0.07);
            const tx = r.x + (r.x2 - r.x) * qq;
            const ty = r.y + (r.y2 - r.y) * qq;
            if (st.grade >= 5) a.fillStyle(st.color, 0.62 - k * 0.12).fillCircle(tx, ty, st.size * (1.25 - k * 0.2));
            else a.fillStyle(st.color, 0.5 - k * 0.1).fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
          }
        }
        if (st.magical) {
          a.fillStyle(st.color, 0.35).fillCircle(x, y, st.size * 2);
          a.fillStyle(st.rim, 1).fillCircle(x, y, st.size * 0.7);
          a.lineStyle(1, st.color, 1).strokeCircle(x, y, st.size);
        } else {
          // a thrown stone: a short streak along its flight, bright at the head
          const len = Math.hypot(r.x2 - r.x, r.y2 - r.y) || 1;
          const ux = (r.x2 - r.x) / len, uy = (r.y2 - r.y) / len;
          const tail = 4 + st.size * 2;
          a.lineStyle(st.size + 0.5, st.color, 0.9).lineBetween(x - ux * tail, y - uy * tail, x, y);
          a.fillStyle(st.rim, 1).fillCircle(x, y, st.size * 0.6);
        }
        return;
      }
      case 'swing': {
        if (!this.flags.trails) return;
        const style = r.style!;
        const x = r.x2 - (r.x2 - r.x) * (0.18 + p * 0.32);
        const y = r.y2 - (r.y2 - r.y) * (0.18 + p * 0.32);
        a.lineStyle(style.size * 2.5, style.color, 0.45 * (1 - p)).lineBetween(x, y, r.x2, r.y2);
        a.lineStyle(style.size, style.rim, 0.9 * (1 - p)).lineBetween(x, y, r.x2, r.y2);
        return;
      }
      case 'cast': {
        if (!this.flags.trails) return;
        const alpha = 1 - p;
        a.fillStyle(r.color, 0.36 * alpha).fillCircle(r.x, r.y, 10 + 12 * p);
        a.fillStyle(0xfff9df, 0.8 * alpha).fillCircle(r.x, r.y, 5 + 3 * p);
        a.lineStyle(2, r.color, 0.75 * alpha).strokeCircle(r.x, r.y, 8 + 13 * p);
        return;
      }
      case 'knock': {
        const al = 0.85 * (1 - p);
        const dx = r.x2 - r.x, dy = r.y2 - r.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        for (const off of [-4, 0, 4]) a.lineStyle(off === 0 ? 2 : 1, 0xf2ecff, al).lineBetween(r.x + nx * off, r.y + ny * off, r.x2 + nx * off, r.y2 + ny * off);
        return;
      }
      case 'edge': {
        const al = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
        const W = h.width, H = h.height;
        for (let i = 0; i < 4; i++) {
          this.top.lineStyle(3, r.color, 0.38 * al * (1 - i / 4));
          this.top.strokeRect(1.5 + i * 3, 1.5 + i * 3, W - 3 - i * 6, H - 3 - i * 6);
        }
        return;
      }
      case 'leave': {
        const e = ease(p);
        const x = r.x + r.dir * e * 140;
        if (this.flags.mist) {
          for (let k = 0; k < 5; k++) g.fillStyle(0xb0202a, 0.12 * (1 - p)).fillCircle(x - r.dir * k * 8, r.y + Math.sin(k + now / 200) * 4, 16 + k * 3);
        }
        if (r.dir !== 0) a.fillStyle(0xc89a52, 1 - p).fillCircle(x, r.y, 12);
        return;
      }
      case 'number': {
        const t = this.numberOf.get(r);
        t?.setY(r.y - 15 * p).setAlpha(1 - p);
        return;
      }
    }
  }
}

/** A neutral ring sheet tinted by a grade colour: lift the colour so the tint keeps the ring bright. */
function lighten(c: number): number {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * 0.75 + 255 * 0.25));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
