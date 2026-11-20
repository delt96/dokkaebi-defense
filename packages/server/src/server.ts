import { extname, join } from 'node:path';
import express from 'express';
import { defineRoom, defineServer, type Server } from 'colyseus';
import { MatchRoom } from './MatchRoom';

/** One process serves the client build and Colyseus from the same origin. */
export function createGameServer(opts: { clientDist?: string } = {}): Server {
  const { clientDist } = opts;
  return defineServer({
    rooms: { match: defineRoom(MatchRoom) },
    express: app => {
      if (!clientDist) return;
      app.use(express.static(clientDist));
      // Unknown extensionless GET paths (e.g. /room/{id}, /solo) fall back to the SPA entry.
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/matchmake') || extname(req.path) !== '') return next();
        res.sendFile(join(clientDist, 'index.html'));
      });
    },
  });
}
