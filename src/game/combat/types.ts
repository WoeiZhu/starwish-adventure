// 戰鬥資料型別：隊伍成員與怪物共用 Unit，投射物 / 範圍 / 飄字為短暫物件。
import type { BuffStat, ClassId, ZoneStyle } from '../../data/classes'
import type { Species } from '../../data/enemies'
import type { Item } from '../../data/items'
import type { Vec2 } from '../../data/world'
import type { SkillMods } from '../progress'

export type Team = 'party' | 'enemy'
export type UnitKind = 'hero' | 'ally' | 'slime'
export type EnemyTier = 'normal' | 'elite' | 'boss'

export interface Buff {
  stat: BuffStat
  amount: number
  time: number
  /** maxHp 增益實際加上的數值，結束時要扣回 */
  value: number
}

export interface Unit {
  id: string
  team: Team
  kind: UnitKind
  name: string
  classId?: ClassId
  color: string
  level: number
  /** 怪物的基礎等級（實際等級會隨主角成長提高） */
  baseLevel: number
  /** 怪物階級：精英與 Boss 有較高能力值與範圍重擊 */
  tier: EnemyTier
  /** 事件標記：用來判斷某個事件的怪物是否全滅 */
  tag: string | null
  /** 死亡後是否重生；事件怪物不重生，死後會被移除 */
  respawns: boolean
  /** 怪物種族（外觀與能力傾向） */
  species: Species
  /** 被擊敗後多少秒重生（只對 respawns 的怪物有意義；區域首領比較久） */
  respawnTime: number
  /** 區域首領的編號（data/world.ts 的 AREA_BOSSES）；一般怪物為 null */
  area: string | null
  /** 外觀縮放 */
  scale: number
  /** 範圍重擊的倒數計時 */
  special: number
  enraged: boolean

  x: number
  z: number
  facing: number
  radius: number
  homeX: number
  homeZ: number

  hp: number
  maxHp: number
  mp: number
  maxMp: number
  atk: number
  def: number
  range: number
  interval: number
  moveSpeed: number
  ranged: boolean
  crit: number
  /** 技能樹帶來的技能加成；怪物為 null */
  mods: SkillMods | null

  alive: boolean
  deadTime: number
  targetId: string | null
  atkTimer: number
  /** 四個技能的剩餘冷卻秒數 */
  cooldowns: number[]
  /** AI 連續施放技能的間隔 */
  gcd: number
  buffs: Buff[]
  stun: number
  slow: number
  invuln: number
  /** 破甲：vulnTime > 0 時受到的傷害提高 vuln（比例） */
  vuln: number
  vulnTime: number
  tauntBy: string | null
  tauntTime: number

  /** 畫面用：移動速度、攻擊動作（1→0）、受擊閃白（秒） */
  speed: number
  moved: number
  attackAnim: number
  hitFlash: number
  /** 受擊壓扁（1→0），讓怪物被打時有彈性反應 */
  squash: number

  ai: {
    path: Vec2[] | null
    repath: number
    blocked: number
    wander: number
    wx: number
    wz: number
    returning: boolean
  }
}

export interface Projectile {
  owner: Unit
  targetId: string | null
  x: number
  z: number
  dirX: number
  dirZ: number
  speed: number
  power: number
  delay: number
  pierce: boolean
  splash: number
  travelled: number
  hit: string[]
  color: string
  big: boolean
}

export interface Zone {
  owner: Unit
  x: number
  z: number
  radius: number
  time: number
  duration: number
  tick: number
  tickTimer: number
  power: number
  heal: number
  slow: number
  color: string
  style: ZoneStyle
}

export interface Floater {
  seq: number
  x: number
  y: number
  z: number
  text: string
  color: string
  life: number
  big: boolean
}

/** 怪物的範圍重擊：先顯示紅色警示圈，delay 秒後對圈內隊員造成傷害 */
export interface Hazard {
  owner: Unit
  x: number
  z: number
  radius: number
  delay: number
  total: number
  power: number
}

export interface Drop {
  x: number
  z: number
  kind: 'gold' | 'potion' | 'item'
  amount: number
  item?: Item
  age: number
  color: string
  warned?: number
}

export interface FeedLine {
  text: string
  color: string
  time: number
}

export type CastResult = 'ok' | 'cooldown' | 'mp' | 'target' | 'range' | 'unable'
