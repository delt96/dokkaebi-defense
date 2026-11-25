import { vi } from 'vitest';
import { RoomCore, type ClientLink, type RoomDeps, type RoomOptions } from '../src/core/RoomCore';

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

export interface Started { core: RoomCore; deps: FakeDeps; links: FakeLink[] }

/** Joins one link per name (ids 'a', 'b', ...), readies everyone and starts the match from the first seat. */
export function started(names: string[], depsOver: Partial<RoomDeps> = {}, options: RoomOptions = {}): Started {
  const deps = fakeDeps(depsOver);
  const core = new RoomCore('room-1', deps, options);
  const links = names.map((_, i) => new FakeLink(String.fromCharCode(97 + i)));
  links.forEach((l, i) => core.join(l, { name: names[i] }));
  for (const l of links) core.message(l.id, 'ready', { ready: true, stage: core.stage, ...(core.difficulty && { difficulty: core.difficulty }) });
  core.message(links[0]!.id, 'start', {});
  return { core, deps, links };
}

export function tickOnce(core: RoomCore, deps: FakeDeps): void {
  deps.clock.t += 50;
  core.advance();
}

export function ticks(r: { core: RoomCore; deps: FakeDeps }, k: number): void {
  for (let i = 0; i < k; i++) tickOnce(r.core, r.deps);
}

export function send(core: RoomCore, id: string, seq: number, type: string, args?: Record<string, unknown>): void {
  core.message(id, 'cmd', args === undefined ? { seq, type } : { seq, type, args });
}
