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
  const ended = (opts = {}) => {
    const log = vi.fn();
    const r = started(['하나', '두리'], { log }, { stage: 'stage3', ...opts });
    send(r.core, 'a', 1, 'forfeit'); send(r.core, 'b', 1, 'forfeit');
    ticks(r, 3);
    return log.mock.calls.map(c => c[0] as string);
  };

  test('records round-trip through their log lines, split into short lines', () => {
    const big = { log: Array.from({ length: 4000 }, (_, i) => ({ tick: i, n: Math.random().toString(36) })) };
    const lines = playLogLines('id-1', { mode: 'x' }, big);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every(l => l.length <= 8200)).toBe(true);
    expect(readPlayLog(['noise', ...lines.reverse()])).toEqual([{ id: 'id-1', summary: { mode: 'x' }, record: big }]);
    expect(readPlayLog(lines.slice(0, -1).filter(l => !l.includes('데이터 1/')))).toEqual([]);
  });

  test('a finished online match logs its summary and a record that replays from the recording', () => {
    const lines = ended();
    const [rec] = readPlayLog(lines);
    expect(rec!.summary).toMatchObject({ mode: 'online', stage: 'stage3', players: 2, outcome: 'wipe' });
    const seats = (rec!.summary as { seats: { seat: number; board: string[] }[] }).seats;
    expect(seats.map(s => s.seat)).toEqual([1, 2]);
    expect(seats.every(s => Array.isArray(s.board))).toBe(true);
    expect(rec!.record).toMatchObject({ stage: 'stage3', seats: [1, 2] });
    expect(lines.join(' ')).not.toMatch(/하나|두리/);
  });

  test('a dev practice room that skipped rounds leaves no record', () => {
    expect(ended({ devJumpTick: 40 }).filter(l => l.startsWith('[판 기록'))).toEqual([]);
  });

  test('parseSoloLog rejects bodies that are not a solo record', () => {
    const ok = { stage: 'stage3', seed: 5, difficulty: 'hard', dataVersion: 'abc', log: [{ tick: 3, commands: [{ type: 'summon' }] }], summary: { outcome: 'clear' } };
    expect(parseSoloLog(JSON.stringify(ok))).toEqual(ok);
    for (const bad of ['not json', '[]', JSON.stringify({ ...ok, stage: 'stage2' }), JSON.stringify({ ...ok, seed: 1.5 }),
      JSON.stringify({ ...ok, difficulty: 'nightmare' }), JSON.stringify({ ...ok, log: [{ tick: 'x', commands: [] }] }), JSON.stringify({ ...ok, summary: null })]) {
      expect(parseSoloLog(bad)).toBeNull();
    }
  });

  test('POST /api/solo-log logs a good body (204), rejects a broken one (400) and an oversized one (413)', async () => {
    const log = vi.fn();
    const app = express().use(soloLogRouter(log, 'f'.repeat(40)));
    const server = app.listen(0);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/solo-log`;
    const post = (body: string) => fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body }).then(r => r.status);
    try {
      const body = { stage: 'stage3', seed: 5, dataVersion: 'abc', log: [], summary: { outcome: 'defeat', round: 12 } };
      expect(await post(JSON.stringify(body))).toBe(204);
      const [rec] = readPlayLog(log.mock.calls.map(c => c[0] as string));
      expect(rec!.summary).toMatchObject({ mode: 'solo', stage: 'stage3', outcome: 'defeat', round: 12, rulesRevision: 'f'.repeat(40) });
      expect(rec!.record).toMatchObject({ seed: 5, log: [] });
      expect(await post('{oops')).toBe(400);
      expect(await post('x'.repeat(1_100_000))).toBe(413);
    } finally {
      server.close();
    }
  });
});
