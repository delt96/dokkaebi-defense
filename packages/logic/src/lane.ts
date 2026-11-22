import type { GridDef } from './types';
export interface Vec2 { x: number; y: number }
export interface Cell { index: number; col: number; row: number; x: number; y: number; isEdge: boolean }
export interface Lane {
  cols: number;
  rows: number;
  /** The board area the enemy path runs around, in path units; a board with more cells than this draws them smaller. */
  frame: { cols: number; rows: number };
  /** Cell size in path units (1 when the board fills its frame cell for cell). */
  pitch: number;
  cells: Cell[];
  perimeter: number;
  pointAt(d: number): Vec2;
  coverage(cellIndex: number, range: number): [number, number][];
  coverageLength(cellIndex: number, range: number): number;
}

interface Segment { start: number; length: number; from: Vec2; dir: Vec2 }

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function loopPos(d: number, perimeter: number): number {
  const m = d % perimeter;
  return m < 0 ? m + perimeter : m;
}

/**
 * `frame` fixes the path: it runs half a unit outside a frame.cols x frame.rows area whatever the board's size, so a
 * bigger board keeps the lap. The cells are square, as large as fit the frame, and centred in it.
 */
export function createLane(cols: number, rows: number, frame: { cols: number; rows: number } = { cols, rows }): Lane {
  const w = frame.cols + 1;
  const h = frame.rows + 1;
  const perimeter = 2 * (w + h);
  const pitch = Math.min(frame.cols / cols, frame.rows / rows);
  const ox = (frame.cols - cols * pitch) / 2;
  const oy = (frame.rows - rows * pitch) / 2;
  const corners: Vec2[] = [
    { x: -0.5, y: -0.5 },
    { x: frame.cols + 0.5, y: -0.5 },
    { x: frame.cols + 0.5, y: frame.rows + 0.5 },
    { x: -0.5, y: frame.rows + 0.5 },
  ];
  const dirs: Vec2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const lengths = [w, h, w, h];
  const segments: Segment[] = [];
  let start = 0;
  for (let i = 0; i < 4; i++) {
    segments.push({ start, length: lengths[i]!, from: corners[i]!, dir: dirs[i]! });
    start += lengths[i]!;
  }

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        index: row * cols + col, col, row, x: ox + (col + 0.5) * pitch, y: oy + (row + 0.5) * pitch,
        isEdge: row === 0 || row === rows - 1 || col === 0 || col === cols - 1,
      });
    }
  }

  const pointAt = (d: number): Vec2 => {
    const p = loopPos(d, perimeter);
    for (const s of segments) {
      if (p <= s.start + s.length) {
        const t = p - s.start;
        return { x: s.from.x + s.dir.x * t, y: s.from.y + s.dir.y * t };
      }
    }
    return { ...corners[0]! };
  };

  const coverage = (cellIndex: number, range: number): [number, number][] => {
    const c = cells[cellIndex]!;
    const raw: [number, number][] = [];
    for (const s of segments) {
      const wx = s.from.x - c.x;
      const wy = s.from.y - c.y;
      const b = s.dir.x * wx + s.dir.y * wy;
      const disc = b * b - (wx * wx + wy * wy - range * range);
      if (disc <= 0) continue;
      const root = Math.sqrt(disc);
      const t0 = Math.max(0, -b - root);
      const t1 = Math.min(s.length, -b + root);
      if (t1 > t0) raw.push([s.start + t0, s.start + t1]);
    }
    const merged: [number, number][] = [];
    for (const iv of raw) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last[1] - iv[0]) < 1e-9) last[1] = iv[1];
      else merged.push([iv[0], iv[1]]);
    }
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (merged.length > 1 && first && last && first[0] < 1e-9 && Math.abs(last[1] - perimeter) < 1e-9) {
      last[1] = perimeter + first[1];
      merged.shift();
    }
    return merged;
  };

  const coverageLength = (cellIndex: number, range: number): number =>
    coverage(cellIndex, range).reduce((sum, [a, b]) => sum + (b - a), 0);

  return { cols, rows, frame: { ...frame }, pitch, cells, perimeter, pointAt, coverage, coverageLength };
}

export type Zone = 0 | 1 | 2 | 3;

/**
 * The quadrant of the board a path point falls in, split at the frame's centre: 0 top-left, 1 top-right,
 * 2 bottom-right, 3 bottom-left. Each holds one corner of the loop and half of each side next to it; a point exactly
 * on a centre line counts as right (x) or bottom (y).
 */
export function zoneOf(lane: Lane, d: number): Zone {
  const p = lane.pointAt(d);
  const right = p.x >= lane.frame.cols / 2;
  const bottom = p.y >= lane.frame.rows / 2;
  return (bottom ? (right ? 2 : 3) : right ? 1 : 0) as Zone;
}

/** Distance between two cells in cells (unit to unit rules such as auras count cells, not path units). */
export function cellDistance(lane: Lane, a: number, b: number): number {
  return dist(lane.cells[a]!, lane.cells[b]!) / lane.pitch;
}

const laneCache = new WeakMap<object, Lane>();
export function laneOf(state: { data: { balance: { grid: GridDef } } }): Lane {
  let lane = laneCache.get(state.data);
  if (!lane) {
    const g = state.data.balance.grid;
    lane = createLane(g.cols, g.rows, g.frame);
    laneCache.set(state.data, lane);
  }
  return lane;
}
