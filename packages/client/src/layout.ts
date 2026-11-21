import type { Vec2 } from '@dorandi/logic';

export const STAGE_W = 640;
export const STAGE_H = 360;
export const TOP_H = 24;
export const BOTTOM_H = 28;
export const LEFT_W = 128;
export const RIGHT_W = 112;
export const CELL = 32;
export const GRID_LEFT = 232;
export const GRID_TOP = 114;
export const GRID_COLS = 6;
export const GRID_ROWS = 4;
export const CENTER_X = LEFT_W;
export const CENTER_Y = TOP_H;
export const CENTER_W = STAGE_W - LEFT_W - RIGHT_W;
export const CENTER_H = STAGE_H - TOP_H - BOTTOM_H;
/** Online battle (spec 7, layout A): a 44px card at the bottom leaves 292px for the middle row. */
export const ONLINE_BOTTOM_H = 44;
export const ONLINE_CENTER_H = STAGE_H - TOP_H - ONLINE_BOTTOM_H;
export const LANE_CANVAS_ONLINE = { width: CENTER_W, height: ONLINE_CENTER_H };

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

export function stageToCell(x: number, y: number): number | null {
  const col = Math.floor((x - GRID_LEFT) / CELL);
  const row = Math.floor((y - GRID_TOP) / CELL);
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
  return row * GRID_COLS + col;
}

export function canvasToCell(x: number, y: number): number | null {
  return stageToCell(x + CENTER_X, y + CENTER_Y);
}
