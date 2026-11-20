import Phaser from 'phaser';
import { createGame, loadGameData } from '@dorandi/logic';
import { GameDriver } from './driver';
import { LaneScene, LANE_CANVAS } from './LaneScene';
import { computeZoom } from './layout';
import './ui/style.css';

const data = loadGameData();
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
const driver = new GameDriver(createGame(data, newSeed()));
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
  const z = computeZoom(window.innerWidth, window.innerHeight);
  stage.style.transform = `scale(${z})`;
  game.scale.refresh();
}
window.addEventListener('resize', fit);
fit();

export function restart(): void {
  driver.reset(createGame(data, newSeed()));
  scene.reset();
}

export { driver, scene };

if (import.meta.env.DEV) Object.assign(window, { __driver: driver, __scene: scene });
