// 戰鬥資料型別：隊伍成員與怪物共用 Unit，投射物 / 範圍 / 飄字為短暫物件。
import type { BuffStat, ClassId, ZoneStyle } from '../../data/classes'
import type { Species } from '../../data/enemies'
import type { Item } from '../../data/items'
import type { Vec2 } from '../../data/world'
import type { SkillMods } from '../progress'
import type { DemoSkillId } from '../../skills/demoSkills'

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
  /** 範圍重擊（或種族特技）的倒數計時 */
  special: number
  /** 第二個特技的倒數（靈鹿的治療） */
  special2: number
  enraged: boolean
  /** 畫面用：要播放的特技動作片段名稱；actionSeq 每次加 1 代表重新播放 */
  actionClip: string
  actionSeq: number
  /** 衝刺 / 撲擊：剩餘秒數與終點 */
  dashT: number
  dashX: number
  dashZ: number
  /** 撲擊落地時對目標造成的傷害倍率（0 = 衝刺本身不造成傷害） */
  dashPower: number
  /** 原地動作中（蓄力衝撞、詠唱治療）：剩餘秒數，期間站著不動；結束時依 castKind 生效 */
  castT: number
  castKind: '' | 'hold' | 'heal'

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
  /** 中毒：剩餘秒數、每次（每秒）扣的血、下一次扣血倒數、下毒的人 */
  poisonTime: number
  poisonDmg: number
  poisonTick: number
  /** 上一次被怪物毒霧傷到的時間（combat.time）：多團毒霧重疊時，同一個人每 0.7 秒最多吃一次 */
  cloudHit?: number
  poisonBy: Unit | null

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
  /** 由技能特效系統畫拖尾與命中反應（demoSkills.ts 的技能 id） */
  vfx?: DemoSkillId
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

/** 藥師的毒孢子：地上長出的大蘑菇，time 到 delay 時爆炸 */
export interface Spore {
  owner: Unit
  x: number
  z: number
  time: number
  delay: number
  radius: number
  power: number
  /** 爆炸後的中毒（每秒傷害倍率、秒數） */
  dps: number
  duration: number
}

/** 延後執行的技能段落（二連擊的第二下、藥瓶落地、瞬閃落地）；施放者倒下或被暈眩就取消 */
export interface Later {
  owner: Unit
  time: number
  run: () => void
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
  /** 毒霧：生效後繼續留在地上 linger 秒，每 tick 秒傷害一次 */
  linger?: number
  tick?: number
  tickTimer?: number
  /** 警示圈顏色（預設紅色） */
  color?: string
  /** 衝撞：生效前一刻怪物衝到圈中心 */
  dash?: boolean
  /** 衝撞時畫面播放的動作片段（預設 Charge） */
  dashClip?: string
}

export interface Drop {
  /** 穩定 id：拾取時依 id 移除，同一個掉落物不會被領兩次 */
  id: string
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
