// 裝備外觀：已裝備武器的品質顏色，用來替角色手上的武器上色。
import type { ClassId } from '../data/classes'
import { QUALITIES } from '../data/items'
import { equippedItem } from './progress'

export function weaponTint(classId: ClassId) {
  const w = equippedItem(classId, 'weapon')
  return w ? QUALITIES[w.quality].color : undefined
}
