export interface Vec2 { x: number; y: number }
export interface Cell { index: number; col: number; row: number; x: number; y: number; isEdge: boolean }
export interface Lane {
  cols: number;
  rows: number;
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

export function createLane(cols: number, rows: number): Lane {
  const w = cols + 1;
  const h = rows + 1;
  const perimeter = 2 * (w + h);
  const corners: Vec2[] = [
    { x: -0.5, y: -0.5 },
    { x: cols + 0.5, y: -0.5 },
    { x: cols + 0.5, y: rows + 0.5 },
    { x: -0.5, y: rows + 0.5 },
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
        index: row * cols + col, col, row, x: col + 0.5, y: row + 0.5,
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
    return merged;
  };

  const coverageLength = (cellIndex: number, range: number): number =>
    coverage(cellIndex, range).reduce((sum, [a, b]) => sum + (b - a), 0);

  return { cols, rows, cells, perimeter, pointAt, coverage, coverageLength };
}
