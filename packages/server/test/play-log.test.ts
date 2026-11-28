import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, test, vi } from 'vitest';
import { RoomCore } from '../src/core/RoomCore';
import { parseSoloLog, playLogLines, readPlayLog, soloLogRouter } from '../src/playLog';
import { fakeDeps, FakeLink, send, started, ticks } from './helpers';

describe('play log lines for the host dashboard', () => {
  test('a new room, a start and a result each leave one line with no player names', () => {
    const log = vi.fn();
    new RoomCore('room-0', fakeDeps({ log }), { stage: 'stage3', difficulty: 'hard' });
    expect(log).toHaveBeenLastCalledWith('[방] 새 방');
    const deps = fakeDeps({ log });
    const core = new RoomCore('room-1', deps, { stage: 'stage3', difficulty: 'hard' });
    ['하나', '두리'].forEach((name, i) => core.join(new FakeLink('ab'[i]!), { name }));
    for (const id of ['a', 'b']) core.message(id, 'ready', { ready: true, stage: 'stage3', difficulty: 'hard' });
    core.message('a', 'start', {});
    const r = { core, deps };
    expect(log).toHaveBeenLastCalledWith('[게임 시작] 2명 · 70라운드 어려움');
    send(r.core, 'a', 1, 'forfeit');
    send(r.core, 'b', 1, 'forfeit');
    ticks(r, 3);
    const end = log.mock.calls.map(c => c[0] as string).find(l => l.startsWith('[게임 끝]'));
    expect(end).toMatch(/^\[게임 끝\] 2명 · 70라운드 어려움 · 전멸 · \d+라운드 · \d+분$/);
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/하나|두리/);
  });

  test('a 20-round room says so, and a room without a log still works', () => {
    const log = vi.fn();
    started(['하나'], { log });
    expect(log).toHaveBeenLastCalledWith('[게임 시작] 1명 · 20라운드');
    expect(() => started(['하나'])).not.toThrow();
  });
});

describe('replayable play records', () => {
  const ended = async (opts = {}) => {
    const log = vi.fn();
    const r = started(['하나', '두리'], { log }, { stage: 'stage3', ...opts });
    send(r.core, 'a', 1, 'forfeit'); send(r.core, 'b', 1, 'forfeit');
    ticks(r, 3);
    await new Promise(resolve => setTimeout(resolve, 50));
    return log.mock.calls.map(c => c[0] as string);
  };

  test('records round-trip through their log lines, split into short lines', async () => {
    const big = { log: Array.from({ length: 4000 }, (_, i) => ({ tick: i, n: Math.random().toString(36) })) };
    const lines = await playLogLines('id-1', { mode: 'x' }, big);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every(l => l.length <= 8200)).toBe(true);
    expect(readPlayLog(['noise', ...lines.reverse()])).toEqual([{ id: 'id-1', summary: { mode: 'x' }, record: big }]);
    expect(readPlayLog(lines.slice(0, -1).filter(l => !l.includes('데이터 1/')))).toEqual([]);
  });

  test('a finished online match logs its summary and a record that replays from the recording', async () => {
    const lines = await ended();
    const [rec] = readPlayLog(lines);
    expect(rec!.summary).toMatchObject({ mode: 'online', stage: 'stage3', players: 2, outcome: 'wipe' });
    const seats = (rec!.summary as { seats: { seat: number; board: string[] }[] }).seats;
    expect(seats.map(s => s.seat)).toEqual([1, 2]);
    expect(seats.every(s => Array.isArray(s.board))).toBe(true);
    expect(rec!.record).toMatchObject({ stage: 'stage3', seats: [1, 2] });
    expect(lines.join(' ')).not.toMatch(/하나|두리/);
  });

  test('a dev practice room that skipped rounds leaves no record', async () => {
    expect((await ended({ devJumpTick: 40 })).filter(l => l.startsWith('[판 기록'))).toEqual([]);
  });

  test('parseSoloLog rejects bodies that are not a solo record', () => {
    const summary = { outcome: 'clear', reason: null, round: 70, minutes: 44, board: ['meok'], storage: [] };
    const ok = { stage: 'stage3', seed: 5, difficulty: 'hard', dataVersion: '0a1b2c3d', log: [{ tick: 3, commands: [{ type: 'summon' }] }], summary };
    expect(parseSoloLog(JSON.stringify(ok))).toEqual(ok);
    // only the known summary fields reach the log, so a client cannot write arbitrary text there
    expect(parseSoloLog(JSON.stringify({ ...ok, summary: { ...summary, name: '하나' } }))?.summary).toEqual(summary);
    for (const bad of ['not json', '[]', JSON.stringify({ ...ok, stage: 'stage2' }), JSON.stringify({ ...ok, seed: 1.5 }),
      JSON.stringify({ ...ok, difficulty: 'nightmare' }), JSON.stringify({ ...ok, log: [{ tick: 'x', commands: [] }] }), JSON.stringify({ ...ok, summary: null }),
      JSON.stringify({ ...ok, dataVersion: 'x'.repeat(500) }), JSON.stringify({ ...ok, summary: { ...summary, board: ['x'.repeat(900_000)] } }),
      JSON.stringify({ ...ok, summary: { ...summary, round: 'seventy' } }), JSON.stringify({ ...ok, summary: { ...summary, outcome: 'x'.repeat(100) } })]) {
      expect(parseSoloLog(bad)).toBeNull();
    }
  });

  test('parseSoloLog keeps the cleanup and list-combine counts and refuses bad ones', () => {
    const summary = { outcome: 'clear', reason: null, round: 70, minutes: 44, board: ['meok'], storage: [], bossKillEnemies: 24, helperCombines: 37 };
    const ok = { stage: 'stage3', seed: 5, difficulty: 'hard', dataVersion: '0a1b2c3d', log: [], summary };
    expect(parseSoloLog(JSON.stringify(ok))?.summary).toEqual(summary);
    const { bossKillEnemies: _, ...noCleanup } = summary;
    expect(parseSoloLog(JSON.stringify({ ...ok, summary: noCleanup }))?.summary).toEqual(noCleanup);
    for (const bad of [{ bossKillEnemies: -1 }, { helperCombines: 'many' }, { helperCombines: 1.5 }]) {
      expect(parseSoloLog(JSON.stringify({ ...ok, summary: { ...summary, ...bad } }))).toBeNull();
    }
  });

  test('POST /api/solo-log logs a good body (204), rejects a broken one (400) and an oversized one (413)', async () => {
    const log = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express().use(soloLogRouter(log, 'f'.repeat(40)));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/solo-log`;
    const post = (body: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body }).then(r => r.status);
    try {
      const body = { stage: 'stage3', seed: 5, dataVersion: '0a1b2c3d', log: [], summary: { outcome: 'defeat', reason: 'limit', round: 12, minutes: 9, board: [], storage: [] } };
      expect(await post(JSON.stringify(body))).toBe(204);
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      const [rec] = readPlayLog(log.mock.calls.map(c => c[0] as string));
      expect(rec!.summary).toMatchObject({ mode: 'solo', stage: 'stage3', outcome: 'defeat', round: 12, rulesRevision: 'f'.repeat(40) });
      expect(rec!.record).toMatchObject({ seed: 5, log: [] });
      expect(await post('{oops')).toBe(400);
      const big = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x'.repeat(1_100_000) });
      expect(big.status).toBe(413);
      expect(await big.text()).not.toMatch(/PayloadTooLarge|\s+at /);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      server.close();
      errors.mockRestore();
    }
  });

  test('POST /api/solo-log turns away bursts beyond its rate (429) without logging them', async () => {
    const log = vi.fn();
    let now = 0;
    const app = express().use(soloLogRouter(log, 'f'.repeat(40), { perMinute: 2, now: () => now }));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/solo-log`;
    const body = JSON.stringify({ stage: 'stage1', seed: 1, dataVersion: '0a1b2c3d', log: [], summary: { outcome: null, reason: null, round: 1, minutes: 0, board: [], storage: [] } });
    const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body }).then(r => r.status);
    try {
      expect([await post(), await post(), await post()]).toEqual([204, 204, 429]);
      now = 61_000;
      expect(await post()).toBe(204);
      await vi.waitFor(() => expect(log.mock.calls.filter(c => String(c[0]).startsWith('[판 기록] ')).length).toBe(3));
    } finally {
      server.close();
    }
  });
});
