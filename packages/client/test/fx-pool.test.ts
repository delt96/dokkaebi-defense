import { expect, test } from 'vitest';
import { Pool } from '../src/fx/pool';

test('released objects are reused instead of made again', () => {
  let made = 0;
  const pool = new Pool(() => ({ n: ++made, used: false }), o => { o.used = false; });
  const a = pool.acquire();
  a.used = true;
  pool.release(a);
  const b = pool.acquire();
  expect(b).toBe(a);
  expect(b.used).toBe(false);
  expect(made).toBe(1);
});

test('the free list keeps at most `max` objects; extra releases are handed to dispose', () => {
  const disposed: number[] = [];
  let n = 0;
  const pool = new Pool(() => ({ n: n++ }), () => {}, { max: 2, dispose: o => disposed.push(o.n) });
  const all = [pool.acquire(), pool.acquire(), pool.acquire()];
  for (const o of all) pool.release(o);
  expect(pool.free).toBe(2);
  expect(disposed).toEqual([2]);
});

test('releasing the same object twice keeps one copy', () => {
  const pool = new Pool(() => ({}), () => {});
  const a = pool.acquire();
  pool.release(a);
  pool.release(a);
  expect(pool.free).toBe(1);
});
