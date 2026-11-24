import express, { type Router } from 'express';
import type { RoomCore } from './core/RoomCore';

export interface LiveRoom { phase: RoomCore['phase']; stage: RoomCore['stage']; round: number; players: number }
export interface LiveStatus { rooms: number; players: number; list: LiveRoom[] }

/** Every room this process holds, from creation to dispose. */
export const liveRooms = new Set<RoomCore>();

export function liveStatus(cores: Iterable<RoomCore>): LiveStatus {
  const list = [...cores].map(core => ({
    phase: core.phase,
    stage: core.stage,
    round: core.match?.round ?? 0,
    players: core.links.size,
  }));
  return { rooms: list.length, players: list.reduce((n, r) => n + r.players, 0), list };
}

/** GET /api/live: anyone can open it, so it must never carry room ids (they let a stranger join) or names. */
export function liveRouter(cores: () => Iterable<RoomCore> = () => liveRooms): Router {
  const router = express.Router();
  router.get('/api/live', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(liveStatus(cores()));
  });
  return router;
}
