import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, test } from 'vitest';
import { roundStartTick, loadGameData } from '@dorandi/logic';
import { RoomCore } from '../src/core/RoomCore';
import { liveRouter, liveStatus } from '../src/live';
import { fakeDeps, FakeLink, started, tickOnce } from './helpers';

function lobby(names: string[]): RoomCore {
  const core = new RoomCore('room-l', fakeDeps(), { stage: 'stage2' });
  names.forEach((name, i) => core.join(new FakeLink(String.fromCharCode(97 + i)), { name }));
  return core;
}

describe('liveStatus', () => {
  test('no rooms reads as zero', () => {
    expect(liveStatus([])).toEqual({ rooms: 0, players: 0, list: [] });
  });

  test('a lobby and a match in play, counting only connected players', () => {
    const waiting = lobby(['가', '나']);
    const d3 = loadGameData('stage3');
    const playing = started(['다', '라', '마'], { dev: true }, { stage: 'stage3', devJumpTick: roundStartTick(d3, 41) + 1 });
    tickOnce(playing.core, playing.deps);
    playing.core.leave('c', false);
    expect(liveStatus([waiting, playing.core])).toEqual({
      rooms: 2,
      players: 4,
      list: [
        { phase: 'lobby', stage: 'stage2', round: 0, players: 2 },
        { phase: 'playing', stage: 'stage3', round: 41, players: 2 },
      ],
    });
  });
});

describe('GET /api/live', () => {
  test('answers fresh JSON with no room ids or names', async () => {
    const cores = [lobby(['비밀이름'])];
    const app = express().use(liveRouter(() => cores));
    const server = app.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/live`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ rooms: 1, players: 1, list: [{ phase: 'lobby', stage: 'stage2', round: 0, players: 1 }] });
      expect(text).not.toMatch(/room-l|비밀이름/);
    } finally {
      server.close();
    }
  });
});
