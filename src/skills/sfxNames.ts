// 時間軸上的音效名稱 → 合成音效（systems/sfx.ts）
import { sfx } from '../systems/sfx'

export function playSfx(name: string | undefined) {
  switch (name) {
    case 'slash':
      return sfx.slash()
    case 'shoot':
      return sfx.shoot(false)
    case 'shootMagic':
      return sfx.shoot(true)
    case 'cast':
      return sfx.cast()
    case 'explode':
      return sfx.explode()
    case 'heal':
      return sfx.heal()
  }
}
