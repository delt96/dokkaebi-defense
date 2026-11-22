import Phaser from 'phaser';
import { createGame, isDifficulty, loadGameData } from '@dorandi/logic';
import { GameDriver } from './driver';
import { LaneScene, LANE_CANVAS } from './LaneScene';
import { stagePlacement } from './layout';
import { soloStage } from './online/entry';
import { mountUi } from './ui/mount';
import './ui/style.css';

export function startSolo(): void {
  const rules = soloStage(location.search);
  const data = rules === 'stage1' ? loadGameData() : loadGameData(rules);
  const pick = new URLSearchParams(location.search).get('difficulty');
  const difficulty = isDifficulty(pick) ? pick : undefined;
  const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const driver = new GameDriver(createGame(data, newSeed(), difficulty));
  const scene = new LaneScene(driver);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
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
    const p = stagePlacement(window.innerWidth, window.innerHeight);
    stage.style.transform = `scale(${p.zoom})`;
    stage.style.left = `${p.left}px`;
    stage.style.top = `${p.top}px`;
    game.scale.refresh();
  }
  window.addEventListener('resize', fit);
  fit();

  function restart(): void {
    driver.reset(createGame(data, newSeed(), difficulty));
    scene.reset();
    ui.resetUi();
  }

  const ui = mountUi(driver, scene, { onRestart: restart });

  if (import.meta.env.DEV) Object.assign(window, { __driver: driver, __scene: scene });
}
