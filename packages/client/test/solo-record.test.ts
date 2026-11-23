import { describe, expect, test } from 'vitest';
import { createGame, loadGameData, replayGame, stateHash } from '@dorandi/logic';
import { makeData } from '@dorandi/logic/testing';
import { GameDriver } from '../src/driver';

const d3 = loadGameData('stage3');
const run = (driver: GameDriver, ticks: number) => { for (let i = 0; i < ticks; i++) driver.update(d3.balance.tickMs); };

describe('solo command record', () => {
  test('replaying the record rebuilds the same state, pauses included', () => {
    const driver = new GameDriver(createGame(d3, 7, 'hard'));
    driver.queue({ type: 'summon' }); driver.queue({ type: 'summon' });
    run(driver, 30);
    driver.paused = true;
    driver.queue({ type: 'summon' });
    run(driver, 50);
    const paused = driver.record.length;
    driver.paused = false;
    driver.queue({ type: 'summon' });
    run(driver, 400);
    driver.queue({ type: 'summon' }); driver.queue({ type: 'summon' });
    run(driver, 600);
    expect(paused).toBe(1);
    expect(driver.record.every(e => e.commands.length > 0)).toBe(true);
    expect(stateHash(replayGame(d3, 7, 'hard', driver.record, driver.state.tick))).toBe(stateHash(driver.state));
  });

  test('reset starts an empty record', () => {
    const driver = new GameDriver(createGame(d3, 1));
    driver.queue({ type: 'summon' });
    run(driver, 5);
    expect(driver.record.length).toBe(1);
    driver.reset(createGame(d3, 2));
    expect(driver.record).toEqual([]);
  });

  test('onFinished fires once, on the tick the game ends, and the replay ends the same way', () => {
    const quick = makeData(d => { d.balance.limit = 1; d.balance.limitSeconds = 0.05; }, 'stage3');
    const driver = new GameDriver(createGame(quick, 3));
    const ends: number[] = [];
    driver.onFinished(s => ends.push(s.tick));
    run(driver, 2000);
    expect(driver.state.phase).toBe('ended');
    expect(ends).toEqual([driver.state.tick]);
    const replayed = replayGame(quick, 3, undefined, driver.record);
    expect(replayed.result).toEqual(driver.state.result);
    expect(stateHash(replayed)).toBe(stateHash(driver.state));
  });
});
