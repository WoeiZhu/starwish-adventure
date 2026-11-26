// 角色模型介面：程序化 Q 版人物與未來的 GLB 模型都實作這份 props。
import type { RefObject } from 'react'
import type { Appearance } from '../../data/appearance'

export interface CharacterMotion {
  /** 目前水平移動速度（單位/秒），模型依此混合待機 / 行走 / 跑步 */
  speed: number
  /** 攻擊動作進度：出手時設為 1，之後遞減到 0 */
  attack?: number
  /** 以下只有自帶動作片段的模型（ClipCharacter）會用到 */
  /** 攻擊動作要在幾秒內播完（攻擊間隔短時加快）；沒有就照原速 */
  attackTime?: number
  /** 特殊動作（例如 Heal）：actionSeq 改變時播放 actionClip 一次 */
  actionClip?: string
  actionSeq?: number
  /** 倒下：播 Death 並停在最後一格 */
  dead?: boolean
}

export interface CharacterModelProps {
  appearance: Appearance
  motion?: RefObject<CharacterMotion>
}
