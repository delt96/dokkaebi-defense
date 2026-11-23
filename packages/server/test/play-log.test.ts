import { describe, expect, test, vi } from 'vitest';
import { RoomCore } from '../src/core/RoomCore';
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
