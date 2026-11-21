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

/** 怪物種族：決定外觀與能力傾向（階級另外計算） */
export type Species = 'slime' | 'goblin'
export const SPECIES: Record<Species, { hp: number; atk: number; speed: number }> = {
  slime: { hp: 1, atk: 1, speed: 1 },
  // 哥布林：血少、攻高、跑得快
  goblin: { hp: 0.85, atk: 1.15, speed: 1.12 },
}

export const ENEMY = {
  /** 普通怪發現隊伍並開始追擊的距離（營地裡的怪靠這個一隻一隻拉） */
  aggro: 5,
  /** 離出生點超過此距離就放棄追擊回家 */
  leash: 20,
  /** 普通怪被擊敗後重生的秒數 */
  respawn: 20,
  maxLevel: 50,
}

/** 階級越高越警覺：精英與 Boss 比較遠就會發現隊伍 */
export const aggroRange = (tier: 'normal' | 'elite' | 'boss') => (tier === 'boss' ? 9 : tier === 'elite' ? 7 : ENEMY.aggro)

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
