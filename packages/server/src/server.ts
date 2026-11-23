import { extname, resolve } from 'node:path';
import express from 'express';
import { defineRoom, defineServer, type Server } from 'colyseus';
import { rulesRevision } from './core/RoomCore';
import { MatchRoom } from './MatchRoom';
import { soloLogRouter } from './playLog';

/** One process serves the client build and Colyseus from the same origin. */
export function createGameServer(opts: { clientDist?: string } = {}): Server {
  const { clientDist } = opts;
  return defineServer({
    rooms: { match: defineRoom(MatchRoom) },
    express: app => {
      app.use(soloLogRouter(line => console.log(line), rulesRevision));
      if (!clientDist) return;
      app.use(express.static(clientDist));
      // Unknown extensionless GET paths (e.g. /room/{id}, /solo) fall back to the SPA entry.
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/matchmake') || extname(req.path) !== '') return next();
        // With root set, only the part under root is checked for dot folders, so a build under .worktrees/ still serves.
        res.sendFile('index.html', { root: resolve(clientDist) });
      });
    },
  });
}
