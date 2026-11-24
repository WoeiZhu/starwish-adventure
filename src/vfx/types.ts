// 技能特效系統的共用型別。src/vfx 只負責畫面：不知道傷害、怪物或存檔，遊戲和測試頁都可以用。
export type Vec3 = [number, number, number]

/** 技能特效參數：每個技能一份預設值，測試頁可以即時調整 */
export interface FxParams {
  /** 主色、副色（漸層、外圈、煙霧） */
  color: string
  color2: string
  /** 整體大小倍率 */
  size: number
  /** 主要特效的持續秒數（刀光、魔法陣、光柱） */
  duration: number
  /** 發射點：施放者本地座標（x 右、y 上、z 前），單位公尺 */
  offset: Vec3
  /** 攻擊距離：刀光半徑、射程 */
  range: number
  /** 作用半徑：爆炸、治療範圍 */
  radius: number
  /** 冷卻秒數 */
  cooldown: number
}

/** 特效要在哪裡播放 */
export interface CueCtx {
  x: number
  y: number
  z: number
  /** 施放者面向（弧度；0 = +Z） */
  facing: number
  p: FxParams
  shake?: (amount: number) => void
}
