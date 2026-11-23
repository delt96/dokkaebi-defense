import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import express, { type Router } from 'express';
import { isDifficulty, type Difficulty, type SoloLogEntry } from '@dorandi/logic';

const CHUNK = 8000;
const HEAD = '[판 기록] ';
const DATA = /^\[판 기록 데이터 (\d+)\/(\d+)\] (\S+) (\S+)$/;

/** One summary line, then the gzipped base64 record split into lines of at most CHUNK characters. */
export function playLogLines(id: string, summary: object, record: unknown): string[] {
  const packed = gzipSync(JSON.stringify(record)).toString('base64');
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

export interface SoloLogBody {
  stage: 'stage1' | 'stage3'; seed: number; difficulty?: Difficulty; dataVersion: string;
  log: SoloLogEntry[]; summary: Record<string, unknown>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseSoloLog(body: string): SoloLogBody | null {
  let v: unknown;
  try { v = JSON.parse(body); } catch { return null; }
  if (!isObject(v)) return null;
  const { stage, seed, difficulty, dataVersion, log, summary } = v;
  if (stage !== 'stage1' && stage !== 'stage3') return null;
  if (!Number.isSafeInteger(seed) || typeof dataVersion !== 'string' || !isObject(summary)) return null;
  if (difficulty !== undefined && !isDifficulty(difficulty)) return null;
  if (!Array.isArray(log) || !log.every(e => isObject(e) && Number.isSafeInteger(e.tick) && Array.isArray(e.commands))) return null;
  return { stage, seed: seed as number, difficulty: difficulty as Difficulty | undefined, dataVersion, log: log as SoloLogEntry[], summary };
}

/** POST /api/solo-log: a finished solo game, sent as text/plain JSON so a dev client on another port needs no preflight. */
export function soloLogRouter(log: (line: string) => void, rulesRevision: string): Router {
  const router = express.Router();
  router.post('/api/solo-log', express.text({ limit: '1mb', type: () => true }), (req, res) => {
    const body = typeof req.body === 'string' ? parseSoloLog(req.body) : null;
    if (!body) { res.sendStatus(400); return; }
    const { log: entries, summary, ...rest } = body;
    const lines = playLogLines(randomUUID(), { ...summary, mode: 'solo', stage: rest.stage, difficulty: rest.difficulty, dataVersion: rest.dataVersion, rulesRevision },
      { rulesRevision, ...rest, log: entries });
    for (const line of lines) log(line);
    res.sendStatus(204);
  });
  return router;
}
