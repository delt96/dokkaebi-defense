import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzipSync, gzip } from 'node:zlib';
import express, { type ErrorRequestHandler, type Router } from 'express';
import { isDifficulty, type Difficulty, type SoloLogEntry } from '@dorandi/logic';

const CHUNK = 8000;
const HEAD = '[판 기록] ';
const DATA = /^\[판 기록 데이터 (\d+)\/(\d+)\] (\S+) (\S+)$/;

const gzipAsync = promisify(gzip);

/** One summary line, then the gzipped base64 record split into lines of at most CHUNK characters. Compresses off the event loop so rooms keep ticking. */
export async function playLogLines(id: string, summary: object, record: unknown): Promise<string[]> {
  const packed = (await gzipAsync(JSON.stringify(record))).toString('base64');
  const parts: string[] = [];
  for (let i = 0; i < packed.length; i += CHUNK) parts.push(packed.slice(i, i + CHUNK));
  return [`${HEAD}${id} ${JSON.stringify(summary)}`, ...parts.map((p, i) => `[판 기록 데이터 ${i + 1}/${parts.length}] ${id} ${p}`)];
}

/** Rebuilds the records from log lines; a record missing any data line is skipped. */
export function readPlayLog(lines: string[]): { id: string; summary: unknown; record: unknown }[] {
  const heads = new Map<string, unknown>();
  const data = new Map<string, { n: number; parts: string[] }>();
  for (const line of lines) {
    if (line.startsWith(HEAD)) {
      const rest = line.slice(HEAD.length);
      const space = rest.indexOf(' ');
      heads.set(rest.slice(0, space), JSON.parse(rest.slice(space + 1)));
      continue;
    }
    const m = DATA.exec(line);
    if (!m) continue;
    const entry = data.get(m[3]!) ?? { n: Number(m[2]), parts: [] };
    entry.parts[Number(m[1]) - 1] = m[4]!;
    data.set(m[3]!, entry);
  }
  const out: { id: string; summary: unknown; record: unknown }[] = [];
  for (const [id, summary] of heads) {
    const d = data.get(id);
    if (!d || d.parts.filter(Boolean).length !== d.n) continue;
    out.push({ id, summary, record: JSON.parse(gunzipSync(Buffer.from(d.parts.join(''), 'base64')).toString('utf8')) });
  }
  return out;
}

export interface SoloSummary {
  outcome: string | null; reason: string | null; round: number; minutes: number; board: string[]; storage: string[];
  bossKillEnemies?: number; helperCombines?: number;
}
export interface SoloLogBody {
  stage: 'stage1' | 'stage3'; seed: number; difficulty?: Difficulty; dataVersion: string;
  log: SoloLogEntry[]; summary: SoloSummary;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const shortText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const idList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && v.every(x => shortText(x, 40));
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 100_000;

/** Copies only the known fields: the summary is written to the host log as is, so nothing else a client sends may reach it. */
function soloSummary(v: unknown): SoloSummary | null {
  if (!isObject(v)) return null;
  const { outcome, reason, round, minutes, board, storage, bossKillEnemies, helperCombines } = v;
  if (!(outcome === null || shortText(outcome, 16)) || !(reason === null || shortText(reason, 16))) return null;
  if (!count(round) || !count(minutes) || !idList(board) || !idList(storage)) return null;
  if ((bossKillEnemies !== undefined && !count(bossKillEnemies)) || (helperCombines !== undefined && !count(helperCombines))) return null;
  return {
    outcome, reason, round, minutes, board, storage,
    ...(bossKillEnemies === undefined ? {} : { bossKillEnemies }), ...(helperCombines === undefined ? {} : { helperCombines }),
  };
}

export function parseSoloLog(body: string): SoloLogBody | null {
  let v: unknown;
  try { v = JSON.parse(body); } catch { return null; }
  if (!isObject(v)) return null;
  const { stage, seed, difficulty, dataVersion, log, summary } = v;
  if (stage !== 'stage1' && stage !== 'stage3') return null;
  const picked = soloSummary(summary);
  if (!Number.isSafeInteger(seed) || typeof dataVersion !== 'string' || !/^[0-9a-f]{8}$/.test(dataVersion) || !picked) return null;
  if (difficulty !== undefined && !isDifficulty(difficulty)) return null;
  if (!Array.isArray(log) || !log.every(e => isObject(e) && Number.isSafeInteger(e.tick) && Array.isArray(e.commands))) return null;
  return { stage, seed: seed as number, difficulty: difficulty as Difficulty | undefined, dataVersion, log: log as SoloLogEntry[], summary: picked };
}

/** POST /api/solo-log: a finished solo game, sent as text/plain JSON so a dev client on another port needs no preflight. */
export function soloLogRouter(log: (line: string) => void, rulesRevision: string, opts: { perMinute?: number; now?: () => number } = {}): Router {
  const { perMinute = 30, now = Date.now } = opts;
  // one budget for the whole server: an open endpoint must not let anyone flood the log or the event loop
  let windowStart = now();
  let used = 0;
  const router = express.Router();
  router.post('/api/solo-log', (_req, res, next) => {
    if (now() - windowStart >= 60_000) { windowStart = now(); used = 0; }
    if (++used > perMinute) { res.sendStatus(429); return; }
    next();
  }, express.text({ limit: '1mb', type: () => true }), (req, res) => {
    const body = typeof req.body === 'string' ? parseSoloLog(req.body) : null;
    if (!body) { res.sendStatus(400); return; }
    const { log: entries, summary, ...rest } = body;
    res.sendStatus(204);
    playLogLines(randomUUID(), { ...summary, mode: 'solo', stage: rest.stage, difficulty: rest.difficulty, dataVersion: rest.dataVersion, rulesRevision },
      { rulesRevision, ...rest, log: entries })
      .then(lines => { for (const line of lines) log(line); }, () => {});
  });
  const quiet: ErrorRequestHandler = (err: { status?: number }, _req, res, _next) => {
    res.sendStatus(err.status && err.status >= 400 && err.status < 500 ? err.status : 400);
  };
  router.use('/api/solo-log', quiet);
  return router;
}
