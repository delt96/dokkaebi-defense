import { vi } from 'vitest';
import type { ClientLink, RoomDeps } from '../src/core/RoomCore';

export class FakeLink implements ClientLink {
  sent: { type: string; msg: any }[] = [];
  closed: number | null = null;

  constructor(public id: string) {}

  send(type: string, msg: unknown): void {
    this.sent.push({ type, msg });
  }

  close(code?: number): void {
    this.closed = code ?? 0;
  }

  last(type: string): any {
    for (let i = this.sent.length - 1; i >= 0; i--) if (this.sent[i]!.type === type) return this.sent[i]!.msg;
    return undefined;
  }

  all(type: string): any[] {
    return this.sent.filter(s => s.type === type).map(s => s.msg);
  }
}

export type FakeDeps = RoomDeps & { clock: { t: number }; disposed: boolean; autoDispose: boolean };

export function fakeDeps(over: Partial<RoomDeps> = {}): FakeDeps {
  let keys = 0;
  const deps: FakeDeps = {
    clock: { t: 0 },
    disposed: false,
    autoDispose: true,
    now: () => deps.clock.t,
    random128: () => `key-${++keys}`,
    randomSeed: () => 42,
    createRematchRoom: vi.fn(async () => 'room-2'),
    setAutoDispose: (v: boolean) => { deps.autoDispose = v; },
    dispose: () => { deps.disposed = true; },
    dev: false,
    ...over,
  };
  return deps;
}
