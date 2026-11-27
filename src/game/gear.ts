// 裝備外觀：角色手上的武器模型、騎士的盾牌，以及武器品質顏色（模型載入失敗時的程序化武器用）。
import type { GearLook } from '../data/appearance'
import type { ClassId } from '../data/classes'
import { QUALITIES } from '../data/items'
import { shieldUrlFor, weaponModelFor } from '../data/weaponModels'
import { equippedItem } from './progress'

export function gearLook(classId: ClassId): GearLook {
  const w = equippedItem(classId, 'weapon')
  const model = weaponModelFor(classId, w)
  return {
    weaponTint: w ? QUALITIES[w.quality].color : undefined,
    weaponModel: model.url,
    weaponClip: model.clip,
    clipEquipment: model.equipment,
    shieldModel: classId === 'knight' ? shieldUrlFor(equippedItem(classId, 'armor')) : undefined,
  }
}
