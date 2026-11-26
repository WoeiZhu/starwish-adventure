// 四個示範技能的資料：時間軸、命中方式、投射物外觀與特效參數。
// 射程、冷卻、爆炸半徑的預設值直接讀職業資料表（classes.ts），遊戲平衡只有一份來源。
// 新增技能：照這個格式加一筆，時間軸用 vfx/cues.ts 裡的特效片段名稱。
import { CLASSES, type ClassId } from '../data/classes'
import { ARROW_URL } from '../data/weaponModels'
import type { TimelineEvent } from '../vfx/timeline'
import type { FxParams } from '../vfx/types'

export type DemoSkillId = 'warrior_slash' | 'archer_shot' | 'mage_fireball' | 'cleric_heal'

/** 命中判定的形狀（判定本身在 skills/hitTest.ts，由遊戲或測試頁執行） */
export interface HitSpec {
  /** arc：前方扇形；single：單一目標；splash：命中點周圍；heal：治療一名隊友 */
  shape: 'arc' | 'single' | 'splash' | 'heal'
  /** 扇形角度（度） */
  arc?: number
  /** 最多命中幾個目標 */
  maxTargets?: number
  /** 傷害倍率（攻擊力 × power），治療時是最大 HP 比例 */
  power: number
}

/** GLB 模型插槽：Meshy / Blender 產生的模型放這裡；沒載入時用程序化外觀 */
export interface ModelSlot {
  key: string
  url: string
  scale: number
  /** GLB 裡的動畫名稱（可省略） */
  clip?: string
}

export interface DemoSkill {
  id: DemoSkillId
  name: string
  classId: ClassId
  desc: string
  /** 在遊戲裡對應哪個動作 */
  gameUse: string
  hit: HitSpec
  projectile?: {
    speed: number
    style: 'arrow' | 'fireball'
    model?: ModelSlot
  }
  params: FxParams
  /** 施放時間軸：動作、集氣、出手、命中（近戰 / 治療）或發射（投射物） */
  cast: TimelineEvent[]
  /** 命中後的反應（每個被打中的目標播一次）：只有特效與音效 */
  impact: TimelineEvent[]
}

const knight = CLASSES.knight
const archer = CLASSES.archer
const mage = CLASSES.mage
const cleric = CLASSES.cleric
const fireball = mage.skills[0]
const healing = cleric.skills[1]

export const DEMO_SKILLS: Record<DemoSkillId, DemoSkill> = {
  warrior_slash: {
    id: 'warrior_slash',
    name: '戰士斬擊',
    classId: 'knight',
    desc: '往前方橫劈一刀，刀光掃過時命中',
    gameUse: '戰士普通攻擊',
    hit: { shape: 'arc', arc: 160, maxTargets: 1, power: 1 },
    params: {
      color: '#a8d4ff',
      color2: '#2f6fe0',
      size: 1,
      duration: 0.24,
      offset: [0, 0.95, 0.1],
      // 刀光半徑：攻擊距離再加上怪物體型
      range: knight.attack.range + 0.7,
      radius: 0.6,
      cooldown: knight.attack.interval,
    },
    cast: [
      { t: 0, kind: 'anim', name: 'attack' },
      { t: 0.08, kind: 'sfx', name: 'slash' },
      { t: 0.1, kind: 'vfx', name: 'slash', where: 'caster' },
      // 揮劍動作在 0.2 秒到最前面：刀光掃到中段時命中
      { t: 0.17, kind: 'hit' },
    ],
    impact: [{ t: 0, kind: 'vfx', name: 'hitSpark', where: 'target' }],
  },
  archer_shot: {
    id: 'archer_shot',
    name: '弓箭射擊',
    classId: 'archer',
    desc: '拉弓集氣後放箭，箭帶著拖尾飛向目標',
    gameUse: '弓箭手普通攻擊（連射、穿透箭也套用拖尾與命中特效）',
    hit: { shape: 'single', power: 1 },
    projectile: { speed: 20, style: 'arrow', model: { key: 'arrow', url: ARROW_URL, scale: 1.35 } },
    params: {
      color: archer.attack.color,
      color2: '#fff2b0',
      size: 1,
      duration: 0.2,
      offset: [0.05, 1.0, 0.45],
      range: archer.attack.range,
      radius: 0.5,
      cooldown: archer.attack.interval,
    },
    cast: [
      { t: 0, kind: 'anim', name: 'attack' },
      { t: 0, kind: 'vfx', name: 'charge', where: 'caster' },
      { t: 0.12, kind: 'vfx', name: 'muzzle', where: 'caster' },
      { t: 0.12, kind: 'sfx', name: 'shoot' },
      { t: 0.12, kind: 'launch' },
    ],
    impact: [{ t: 0, kind: 'vfx', name: 'hitSpark', where: 'target' }],
  },
  mage_fireball: {
    id: 'mage_fireball',
    name: '法師火球',
    classId: 'mage',
    desc: '腳下展開魔法陣、法杖集氣，射出火球，命中後爆炸波及周圍',
    gameUse: '法師技能 1「火球」',
    hit: { shape: 'splash', power: 2.2 },
    projectile: { speed: 14, style: 'fireball' },
    params: {
      color: '#ff7a2f',
      color2: '#ffd36b',
      size: 1,
      duration: 0.6,
      offset: [0.3, 1.45, 0.4],
      range: fireball.range,
      radius: fireball.effects[0].type === 'projectile' ? (fireball.effects[0].splash ?? 2.2) : 2.2,
      cooldown: fireball.cooldown,
    },
    cast: [
      { t: 0, kind: 'anim', name: 'cast' },
      { t: 0, kind: 'vfx', name: 'castCircle', where: 'caster' },
      { t: 0.05, kind: 'vfx', name: 'charge', where: 'caster' },
      { t: 0.05, kind: 'sfx', name: 'cast' },
      { t: 0.4, kind: 'vfx', name: 'muzzle', where: 'caster' },
      { t: 0.4, kind: 'sfx', name: 'shootMagic' },
      { t: 0.4, kind: 'launch' },
    ],
    impact: [
      { t: 0, kind: 'vfx', name: 'explosion', where: 'target' },
      { t: 0, kind: 'sfx', name: 'explode' },
    ],
  },
  cleric_heal: {
    id: 'cleric_heal',
    name: '聖者治療',
    classId: 'cleric',
    desc: '在隊友腳下展開魔法陣，光柱升起後回復生命',
    gameUse: '聖者技能 2「治癒之光」',
    hit: { shape: 'heal', power: healing.effects[0].type === 'heal' ? healing.effects[0].ratio : 0.3 },
    params: {
      color: '#7df0a6',
      color2: '#fff3a3',
      size: 1,
      duration: 1,
      offset: [0, 1.2, 0.3],
      range: 9,
      radius: 1.3,
      cooldown: healing.cooldown,
    },
    cast: [
      { t: 0, kind: 'anim', name: 'cast' },
      { t: 0, kind: 'vfx', name: 'charge', where: 'caster' },
      { t: 0, kind: 'vfx', name: 'areaCircle', where: 'target' },
      { t: 0, kind: 'sfx', name: 'cast' },
      { t: 0.3, kind: 'vfx', name: 'healPillar', where: 'target' },
      { t: 0.45, kind: 'hit' },
      { t: 0.45, kind: 'sfx', name: 'heal' },
    ],
    impact: [{ t: 0, kind: 'vfx', name: 'healBurst', where: 'target' }],
  },
}

export const DEMO_ORDER: DemoSkillId[] = ['warrior_slash', 'archer_shot', 'mage_fireball', 'cleric_heal']

/** 每個職業在測試頁預設的技能（測試頁只有可當主角的四職業） */
export const SKILL_OF_CLASS: Partial<Record<ClassId, DemoSkillId>> = {
  knight: 'warrior_slash',
  archer: 'archer_shot',
  mage: 'mage_fireball',
  cleric: 'cleric_heal',
}

/** 投射物模型是不是由特效系統畫（箭在遊戲裡由 CombatLayer 畫武器包的箭） */
export const isDemoSkill = (id: string | undefined): id is DemoSkillId => !!id && id in DEMO_SKILLS
