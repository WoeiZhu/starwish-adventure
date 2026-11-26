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

/** 怪物種族：決定外觀、能力傾向與攻擊方式（階級另外計算） */
export type Species = 'slime' | 'goblin' | 'wolf' | 'mushroom' | 'crystal' | 'stag' | 'boar' | 'bat' | 'lizard' | 'crab'
export interface SpeciesDef {
  hp: number
  atk: number
  speed: number
  /** 普攻間隔倍率 */
  interval: number
  /** 遠程：保持距離、發射光彈 */
  range?: number
  /** Boss 狂暴時召喚的手下 */
  summon?: { name: string; color: string; species: Species }
}
export const SPECIES: Record<Species, SpeciesDef> = {
  slime: { hp: 1, atk: 1, speed: 1, interval: 1, summon: { name: '史萊姆衛兵', color: '#d9a6ff', species: 'slime' } },
  // 哥布林：血少、攻高、跑得快
  goblin: { hp: 0.85, atk: 1.15, speed: 1.12, interval: 1 },
  // 月影幼狼：血少、跑最快、會撲擊
  wolf: { hp: 0.75, atk: 1, speed: 1.3, interval: 0.85 },
  // 孢子蘑菇：耐打、走得慢、會放毒霧
  mushroom: { hp: 1.15, atk: 0.8, speed: 0.75, interval: 1.15 },
  // 星晶魔靈：遠程射擊，靠太近會後退
  crystal: { hp: 0.8, atk: 1.05, speed: 0.95, interval: 1.25, range: 6.5 },
  // 苔蘚靈鹿：Boss，會衝撞、治療自己與手下
  stag: { hp: 1.1, atk: 1, speed: 1.05, interval: 1, summon: { name: '月影幼狼', color: '#8fa6d8', species: 'wolf' } },
  // 鐵牙野豬：耐打，隔一段距離蓄力衝撞（先出紅圈，閃避有用）
  boar: { hp: 1.3, atk: 1.1, speed: 1, interval: 1.1 },
  // 月翼蝠：血最少、飛得快，俯衝撲向目標
  bat: { hp: 0.6, atk: 0.95, speed: 1.35, interval: 0.8 },
  // 砂鱗蜥兵：遠程投矛，保持距離
  lizard: { hp: 0.85, atk: 1.1, speed: 0.95, interval: 1.3, range: 6 },
  // 裂岩甲蟹：很硬、很慢、攻擊重
  crab: { hp: 1.6, atk: 1.15, speed: 0.7, interval: 1.2 },
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
