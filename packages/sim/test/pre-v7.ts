import { buildGameData, dataSources, type DataSources, type GameData } from '@dorandi/logic';
import v6Recipes from './recipes-stage3-v6.json';

export const V7_NEW_UNITS = ['dasikpan', 'seongjudanji', 'yeongdeunghalmang', 'cheonnyeondeungjan'];

/** Today's sources with stage 3 put back as it stood before v7, on the given stage 3 recipes (v6 by default). */
export function preV7Sources(recipes: DataSources['stage3']['recipes'] = v6Recipes): DataSources {
  const src = dataSources();
  src.stage3.recipes = recipes;
  src.stage3.units = src.stage3.units.filter(u => !V7_NEW_UNITS.includes(u.id));
  delete (src.stage3.onBasicHit as Record<string, unknown>)['seongjudanji'];
  const byeongpung = src.stage3.units.find(u => u.id === 'cheonnyeonbyeongpung')!;
  byeongpung.range = 2.5;
  byeongpung.interval = 0.9;
  return src;
}

export const v6Stage3 = (): GameData => buildGameData('stage3', preV7Sources());
