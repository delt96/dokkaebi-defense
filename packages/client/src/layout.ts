import type { Lane, Vec2 } from '@dorandi/logic';

export const STAGE_W = 640;
export const STAGE_H = 360;
export const TOP_H = 24;
export const BOTTOM_H = 28;
export const LEFT_W = 128;
export const RIGHT_W = 112;
/** Pixels per path unit; a 6 x 4 board's cells are this size, a bigger board inside the same path draws them smaller. */
export const CELL = 32;
export const GRID_LEFT = 232;
export const GRID_TOP = 114;
export const CENTER_X = LEFT_W;
export const CENTER_Y = TOP_H;
export const CENTER_W = STAGE_W - LEFT_W - RIGHT_W;
export const CENTER_H = STAGE_H - TOP_H - BOTTOM_H;
/** Online battle (spec 7, layout A): a 44px card at the bottom leaves 292px for the middle row. */
export const ONLINE_BOTTOM_H = 44;
export const ONLINE_CENTER_H = STAGE_H - TOP_H - ONLINE_BOTTOM_H;
export const LANE_CANVAS_ONLINE = { width: CENTER_W, height: ONLINE_CENTER_H };

/**
 * The storage column (stage px): left of the board, clear of the lane path and a boss's bar on it (x >= 196) and of the
 * round banner above (y < 68). It runs down to 2px over the bottom panel (online: over the 44px card), beside the quest
 * chip row, which starts at x 200 for that (style.css #econ-bottom). The heights are repeated in style.css #storage.
 */
export const STORAGE_BOX = { x: 130, y: 70, w: 66, h: 260, onlineH: 244 } as const;

/** The notice zone (stage px) between the two board pillars while a pillar window is open. */
export const NOTICE_SPAN = { x: 200, w: 254 } as const;

/** Whether a point in lane-canvas pixels lies over the storage column. */
export function canvasInStorage(x: number, y: number, online = false): boolean {
  const sx = x + CENTER_X;
  const sy = y + CENTER_Y;
  const h = online ? STORAGE_BOX.onlineH : STORAGE_BOX.h;
  return sx >= STORAGE_BOX.x && sx < STORAGE_BOX.x + STORAGE_BOX.w && sy >= STORAGE_BOX.y && sy < STORAGE_BOX.y + h;
}

export const GRADE_COLOR: Record<number, string> = {
  1: '#4f9dff', 2: '#4fd27a', 3: '#b07aff', 4: '#ffb347', 5: '#ff4a3a', 6: '#ffe35a',
};

/** The grade dot's shape (circle, square, diamond) so grades that look alike to colour-blind eyes still differ. */
export const gradeShape = (grade: number): 'c' | 's' | 'd' => (grade <= 2 ? 'c' : grade <= 4 ? 's' : 'd');

export function computeZoom(w: number, h: number): number {
  // Integer from 2x up; the 1.5 step keeps 960-1279px windows off 1x.
  const m = Math.min(w / STAGE_W, h / STAGE_H);
  return m >= 2 ? Math.floor(m) : m >= 1.5 ? 1.5 : 1;
}

export function stagePlacement(w: number, h: number): { zoom: number; left: number; top: number } {
  const zoom = computeZoom(w, h);
  return {
    zoom,
    left: Math.max(0, Math.floor((w - STAGE_W * zoom) / 2)),
    top: Math.max(0, Math.floor((h - STAGE_H * zoom) / 2)),
  };
}

/** x, y: screen px of the box's top-left corner. w, h: window px, before the window zoom. */
export interface WinBox { x: number; y: number; w: number; h: number }
export type WinPlace = 'outside' | 'inside';
export interface ScreenLayout {
  zoom: number; left: number; top: number;
  wins: WinPlace; winZoom: number; winLeft: WinBox; winRight: WinBox;
  outerZoom: number;
}

export const WIN_MIN = 150;
export const WIN_GAP = 4;
export const WIN_MAX = 196;
export const PILLAR_LEFT = { x: 0, w: 196 } as const;
export const PILLAR_RIGHT = { x: 458, w: 182 } as const;
const PILLAR_H = STAGE_H - TOP_H - BOTTOM_H;
const ONLINE_PILLAR_H = STAGE_H - TOP_H - ONLINE_BOTTOM_H;

export function outerZoom(boardZoom: number): number {
  return Math.max(1, Math.floor((boardZoom * 0.75) / 0.25) * 0.25);
}

export function screenLayout(w: number, h: number, opts: { band?: number; online?: boolean } = {}): ScreenLayout {
  const band = opts.band ?? 0;
  const base = stagePlacement(w, h);
  const zoom = band > 0 ? Math.min(base.zoom, (h - band) / STAGE_H) : base.zoom;
  const left = Math.max(0, Math.floor((w - STAGE_W * zoom) / 2));
  const top = Math.floor(Math.max(0, h - band - STAGE_H * zoom) / 2);
  const y = top + TOP_H * zoom;
  const outer = outerZoom(base.zoom);

  const candidates = [zoom];
  for (let z = Math.ceil(zoom) - 1; z >= 2; z--) candidates.push(z);
  const winZoom = candidates.find((z) => left / z >= WIN_MIN + WIN_GAP);
  if (winZoom !== undefined) {
    const winW = Math.min(WIN_MAX, left / winZoom - WIN_GAP);
    const winH = (STAGE_H * zoom) / winZoom;
    return {
      zoom, left, top, wins: 'outside', winZoom, outerZoom: outer,
      winLeft: { x: left - (winW + WIN_GAP) * winZoom, y: top, w: winW, h: winH },
      winRight: { x: left + STAGE_W * zoom + WIN_GAP * winZoom, y: top, w: winW, h: winH },
    };
  }
  const pillarH = opts.online ? ONLINE_PILLAR_H : PILLAR_H;
  return {
    zoom, left, top, wins: 'inside', winZoom: zoom, outerZoom: outer,
    winLeft: { x: left + PILLAR_LEFT.x * zoom, y, w: PILLAR_LEFT.w, h: pillarH },
    winRight: { x: left + PILLAR_RIGHT.x * zoom, y, w: PILLAR_RIGHT.w, h: pillarH },
  };
}

export function laneToStage(p: Vec2): Vec2 {
  return { x: GRID_LEFT + p.x * CELL, y: GRID_TOP + p.y * CELL };
}

export function laneToCanvas(p: Vec2): Vec2 {
  const s = laneToStage(p);
  return { x: s.x - CENTER_X, y: s.y - CENTER_Y };
}

/** A cell's drawn size in stage pixels. */
export function cellPx(lane: Lane): number {
  return CELL * lane.pitch;
}

/** Top-left corner of a cell in lane-canvas pixels. */
export function cellCorner(lane: Lane, index: number): Vec2 {
  const c = lane.cells[index]!;
  return laneToCanvas({ x: c.x - lane.pitch / 2, y: c.y - lane.pitch / 2 });
}

export function stageToCell(lane: Lane, x: number, y: number): number | null {
  const first = lane.cells[0]!;
  const col = Math.floor(((x - GRID_LEFT) / CELL - (first.x - lane.pitch / 2)) / lane.pitch + 1e-9);
  const row = Math.floor(((y - GRID_TOP) / CELL - (first.y - lane.pitch / 2)) / lane.pitch + 1e-9);
  if (col < 0 || row < 0 || col >= lane.cols || row >= lane.rows) return null;
  return row * lane.cols + col;
}

export function canvasToCell(lane: Lane, x: number, y: number): number | null {
  return stageToCell(lane, x + CENTER_X, y + CENTER_Y);
}
