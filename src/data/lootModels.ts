// 掉落物與寶箱模型（public/models，對照表 loot-items-map-20261123.json）。
// 遊戲載入 tools/assets 壓縮過的 .web.glb；模型原點在底部中央，正面朝 +Z。
import { modelUrl } from './appearance'

export const LOOT_URLS = {
  coin: modelUrl('star-coin.web.glb'),
  potion: modelUrl('potion-bottle.web.glb'),
  potionBlue: modelUrl('potion-bottle-blue.web.glb'),
  potionGreen: modelUrl('potion-bottle-green.web.glb'),
  pouch: modelUrl('material-pouch.web.glb'),
  bundle: modelUrl('equipment-bundle.web.glb'),
  chest: modelUrl('wooden-chest.web.glb'),
} as const
export type LootModel = keyof typeof LOOT_URLS

/** 掉在地上的大小：原始模型是 14～28 cm 的實物比例，放大到遠景鏡頭也看得清楚 */
export const LOOT_SCALE: Partial<Record<LootModel, number>> = { coin: 2.4, potion: 1.5, pouch: 1.5, bundle: 1.4 }
