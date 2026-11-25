import { baseData, canonicalJson, fnv1a, type Difficulty, type GameState, type SoloLogEntry } from '@dorandi/logic';
import { serverUrl } from './net/room';

export interface SoloLogBody {
  stage: 'stage1' | 'stage3'; seed: number; difficulty?: Difficulty; dataVersion: string; log: SoloLogEntry[];
  summary: { outcome: string | null; reason: string | null; round: number; minutes: number; board: string[]; storage: string[] };
}

export function soloLogBody(state: GameState, seed: number, difficulty: Difficulty | undefined, stage: 'stage1' | 'stage3', log: SoloLogEntry[]): SoloLogBody {
  const ids = (units: readonly ({ defId: string } | null)[] | undefined) => (units ?? []).flatMap(u => (u ? [u.defId] : []));
  return {
    stage, seed, difficulty, log,
    // same hash an online match records, so solo and online records group by the same rules
    dataVersion: fnv1a(canonicalJson(baseData(state.data), new Set())),
    summary: {
      outcome: state.result?.outcome ?? null, reason: state.result?.reason ?? null, round: state.round,
      minutes: Math.round(state.tick * state.data.balance.tickMs / 60_000),
      board: ids(state.slots), storage: ids(state.storage),
    },
  };
}

/** Fire and forget: a lost log line must never disturb the game screen. */
export async function sendSoloLog(body: SoloLogBody, post: typeof fetch = fetch): Promise<void> {
  try {
    await post(`${serverUrl()}/api/solo-log`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
  } catch {
    // offline or server asleep: drop it
  }
}
