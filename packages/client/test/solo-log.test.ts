import { describe, expect, test, vi } from 'vitest';
import { createGame, loadGameData } from '@dorandi/logic';
import { makeData, placeUnitForTest } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';
import { sendSoloLog, soloLogBody } from '../src/soloLog';

describe('solo play log', () => {
  test('a finished game becomes a body with seed, record, data version and a nameless summary', () => {
    const quick = makeData(d => { d.balance.limit = 1; d.balance.limitSeconds = 0.05; }, 'stage3');
    const driver = new GameDriver(createGame(quick, 9, 'easy'));
    placeUnitForTest(driver.state, 'meok', 0);
    driver.queue({ type: 'summon' });
    for (let i = 0; i < 2000 && driver.state.phase !== 'ended'; i++) driver.update(50);
    const body = soloLogBody(driver.state, 9, 'easy', 'stage3', driver.record);
    expect(body).toMatchObject({ stage: 'stage3', seed: 9, difficulty: 'easy', log: driver.record });
    expect(body.dataVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(body.summary).toMatchObject({ outcome: 'defeat', round: driver.state.round });
    expect(body.summary.board).toContain('meok');
    expect(Array.isArray(body.summary.storage)).toBe(true);
    expect(typeof body.summary.minutes).toBe('number');
  });

  test('the same data gives the same data version as an online match', async () => {
    const { createMatch } = await import('@dorandi/logic');
    const d3 = loadGameData('stage3');
    expect(soloLogBody(createGame(d3, 1), 1, undefined, 'stage3', []).dataVersion).toBe(createMatch(d3, 1, [1]).dataVersion);
  });

  test('sendSoloLog posts text/plain to the server and never throws', async () => {
    const post = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const body = soloLogBody(createGame(loadGameData('stage3'), 1), 1, undefined, 'stage3', []);
    await sendSoloLog(body, post);
    const [url, init] = post.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/solo-log$/);
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'text/plain' } });
    expect(JSON.parse(init.body)).toEqual(body);
    await expect(sendSoloLog(body, vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeUndefined();
  });
});
