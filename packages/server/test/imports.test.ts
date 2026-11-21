import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sources(p) : e.name.endsWith('.ts') ? [p] : [];
  });

describe('server production code', () => {
  test('does not import the logic test helpers', () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(f => readFileSync(f, 'utf8').includes('@dorandi/logic/testing'))).toEqual([]);
  });
});
