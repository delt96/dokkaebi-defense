import type { Lane, Vec2 } from '@dorandi/logic';

export const STAGE_W = 640;
export const STAGE_H = 360;
export const TOP_H = 24;
export const BOTTOM_H = 28;
export const LEFT_W = 128;
export const RIGHT_W = 112;
/**
 * Pixels per path unit; a 6 x 4 board's cells are this size, a bigger board inside the same path draws them smaller.
 * 28 leaves room for the storage strip above the path while the ring's bottom edge stays at y 271, clear of the
 * quest chips (y >= 272). Unit art is drawn at 32px and scaled to the cell.
 */
export const CELL = 28;
export const ART_PX = 32;
export const GRID_LEFT = 244;
export const GRID_TOP = 133;
export const CENTER_X = LEFT_W;
export const CENTER_Y = TOP_H;
export const CENTER_W = STAGE_W - LEFT_W - RIGHT_W;
export const CENTER_H = STAGE_H - TOP_H - BOTTOM_H;
/** Online battle (spec 7, layout A): a 44px card at the bottom leaves 292px for the middle row. */
export const ONLINE_BOTTOM_H = 44;
export const ONLINE_CENTER_H = STAGE_H - TOP_H - ONLINE_BOTTOM_H;
export const LANE_CANVAS_ONLINE = { width: CENTER_W, height: ONLINE_CENTER_H };

/**
 * The storage strip (stage px): one row above the board's path, under the round banner and the two economy prompt
 * rows (y < 67) and over the bar of a boss walking the top of the path (y >= 89).
 */
export const STORAGE_BOX = { x: 132, y: 67, w: 392, h: 21 } as const;

/** Whether a point in lane-canvas pixels lies over the storage column. */
export function canvasInStorage(x: number, y: number): boolean {
  const sx = x + CENTER_X;
  const sy = y + CENTER_Y;
  return sx >= STORAGE_BOX.x && sx < STORAGE_BOX.x + STORAGE_BOX.w && sy >= STORAGE_BOX.y && sy < STORAGE_BOX.y + STORAGE_BOX.h;
}

export const GRADE_COLOR: Record<number, string> = {
  1: '#4f9dff', 2: '#4fd27a', 3: '#b07aff', 4: '#ffb347', 5: '#ff4a3a', 6: '#ffe35a',
};

export function computeZoom(w: number, h: number): number {
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
  const p = laneToCanvas({ x: c.x - lane.pitch / 2, y: c.y - lane.pitch / 2 });
  return { x: Math.round(p.x), y: Math.round(p.y) };
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
