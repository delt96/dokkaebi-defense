import Phaser from 'phaser';
import { createGame, isDifficulty, loadGameData } from '@dorandi/logic';
import { bindBattleAudio } from './audio/battle';
import { GameDriver } from './driver';
import { LaneScene, LANE_CANVAS } from './LaneScene';
import { applyLayout } from './fit';
import { screenLayout } from './layout';
import { sendSoloLog, soloLogBody } from './soloLog';
import { soloStage } from './online/entry';
import { mountUi } from './ui/mount';
import './ui/style.css';

export function startSolo(): void {
  const rules = soloStage(location.search);
  const data = rules === 'stage1' ? loadGameData() : loadGameData(rules);
  const pick = new URLSearchParams(location.search).get('difficulty');
  const difficulty = isDifficulty(pick) ? pick : undefined;
  const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let seed = newSeed();
  const driver = new GameDriver(createGame(data, seed, difficulty));
  driver.onFinished(state => {
    // runs inside the tick loop: a log we cannot build must not break the game screen
    try { void sendSoloLog(soloLogBody(state, seed, difficulty, rules, driver.record)); } catch { /* dropped */ }
  });
  const resetAudio = bindBattleAudio(driver);
  const scene = new LaneScene(driver);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    audio: { noAudio: true },
    parent: 'lane',
    width: LANE_CANVAS.width,
    height: LANE_CANVAS.height,
    pixelArt: true,
    backgroundColor: '#0d0a14',
    scale: { mode: Phaser.Scale.NONE },
    scene,
  });

  const stage = document.getElementById('stage')!;
  function fit(): void {
    applyLayout(screenLayout(window.innerWidth, window.innerHeight), stage);
    game.scale.refresh();
  }
  window.addEventListener('resize', fit);
  fit();

  function restart(): void {
    seed = newSeed();
    driver.reset(createGame(data, seed, difficulty));
    resetAudio();
    scene.reset();
    ui.resetUi();
  }

  const ui = mountUi(driver, scene, { onRestart: restart, onHome: () => location.assign('/') });

  if (import.meta.env.DEV) Object.assign(window, { __driver: driver, __scene: scene });
}
