// 怪物數值：初版只有史萊姆，能力值隨等級以公式成長。
export interface EnemyStats {
  hp: number
  atk: number
  def: number
  moveSpeed: number
  interval: number
  /** 擊敗後每位存活隊員獲得的經驗值 */
  exp: number
  /** 掉落金幣的基準值 */
  gold: number
}

export const ENEMY = {
  /** 發現隊伍並開始追擊的距離 */
  aggro: 6.5,
  /** 離出生點超過此距離就放棄追擊回家 */
  leash: 20,
  respawn: 20,
  maxLevel: 50,
}

export function slimeStats(level: number): EnemyStats {
  const k = level - 1
  return {
    hp: Math.round(420 * Math.pow(1.17, k)),
    atk: Math.round(20 * Math.pow(1.105, k)),
    def: 2 + level,
    moveSpeed: Math.min(3.6, 2.4 + level * 0.06),
    interval: Math.max(1.1, 1.6 - level * 0.02),
    exp: 16 + level * 12,
    gold: 4 + level * 3,
  }
}

/** 重生時的等級：基礎等級隨主角成長提高，讓練功一直有意義 */
export const scaledEnemyLevel = (baseLevel: number, heroLevel: number) =>
  Math.min(ENEMY.maxLevel, baseLevel + Math.floor((heroLevel - 1) / 2))
