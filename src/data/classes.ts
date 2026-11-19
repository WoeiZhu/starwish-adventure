// 四職業資料表（資料驅動）：能力值、普攻、技能效果都在這裡，戰鬥系統只負責執行。
export type ClassId = 'archer' | 'mage' | 'knight' | 'cleric'
export type WeaponKind = 'bow' | 'staff' | 'sword' | 'wand' | 'none'
export type ZoneStyle = 'rain' | 'meteor' | 'frost' | 'holy'
export type BuffStat = 'atkSpeed' | 'atk' | 'def' | 'maxHp' | 'guard'

/** 技能效果：一個技能可以由多個效果組成 */
export type SkillEffect =
  /** 朝目標發射投射物；pierce = 直線穿透，splash = 命中後的擴散半徑 */
  | { type: 'projectile'; count: number; power: number; interval?: number; pierce?: boolean; splash?: number }
  | { type: 'melee'; power: number; stun?: number }
  /** 強制範圍內敵人攻擊施放者 */
  | { type: 'taunt'; radius: number; duration: number }
  /** 治療：ratio 為最大 HP 比例；party = 全隊，否則治療血量比例最低的隊友 */
  | { type: 'heal'; ratio: number; party?: boolean }
  | { type: 'buff'; stat: BuffStat; amount: number; duration: number; party?: boolean }
  /** 持續範圍：每 tick 對範圍內敵人造成 power 倍傷害、治療隊友 heal 比例、附加緩速秒數 */
  | {
      type: 'zone'
      at: 'target' | 'self'
      radius: number
      duration: number
      tick: number
      power?: number
      heal?: number
      slow?: number
      color: string
      /** 視覺樣式：箭雨 / 隕石 / 冰霜 / 聖域 */
      style: ZoneStyle
    }

export interface SkillDef {
  id: string
  name: string
  ultimate?: boolean
  cooldown: number
  mp: number
  /** 是否需要鎖定敵人；需要時 range 為最大施放距離 */
  needsTarget: boolean
  range: number
  effects: SkillEffect[]
}

export interface ClassDef {
  id: ClassId
  name: string
  en: string
  /** 預設隊友名字（主角未選此職業時加入隊伍） */
  companion: string
  role: string
  desc: string
  buff: { name: string; desc: string }
  /** 順序固定：1、2 一般技能，3 職業強化，4 必殺技 */
  skills: [SkillDef, SkillDef, SkillDef, SkillDef]
  base: { hp: number; mp: number; atk: number; def: number }
  attack: { range: number; interval: number; ranged: boolean; crit: number; color: string }
  colors: { primary: string; secondary: string; accent: string }
  weapon: WeaponKind
}

const BUFF_TIME = 8
const BUFF_CD = 30
const ULT_CD = 45

export const CLASSES: Record<ClassId, ClassDef> = {
  archer: {
    id: 'archer',
    name: '弓箭手',
    en: 'ARCHER',
    companion: '艾琳',
    role: '遠距離物理輸出',
    desc: '高攻速、暴擊、靈活走位',
    buff: { name: '疾風之姿', desc: '攻擊速度 +40%' },
    skills: [
      {
        id: 'rapid_shot',
        name: '連射',
        cooldown: 5,
        mp: 8,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'projectile', count: 3, power: 0.8, interval: 0.12 }],
      },
      {
        id: 'pierce_arrow',
        name: '穿透箭',
        cooldown: 8,
        mp: 12,
        needsTarget: true,
        range: 11,
        effects: [{ type: 'projectile', count: 1, power: 2.1, pierce: true }],
      },
      {
        id: 'wind_stance',
        name: '疾風之姿',
        cooldown: BUFF_CD,
        mp: 10,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'atkSpeed', amount: 0.4, duration: BUFF_TIME }],
      },
      {
        id: 'arrow_rain',
        name: '箭雨',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 25,
        needsTarget: true,
        range: 11,
        effects: [{ type: 'zone', at: 'target', radius: 4, duration: 3, tick: 0.3, power: 0.7, color: '#f4d35e', style: 'rain' }],
      },
    ],
    base: { hp: 90, mp: 50, atk: 14, def: 5 },
    attack: { range: 9, interval: 0.8, ranged: true, crit: 0.2, color: '#f4d35e' },
    colors: { primary: '#5fb36a', secondary: '#8a5a3c', accent: '#f4d35e' },
    weapon: 'bow',
  },
  mage: {
    id: 'mage',
    name: '法師',
    en: 'MAGE',
    companion: '諾娃',
    role: '遠距離魔法輸出',
    desc: '高魔法傷害、範圍攻擊、控場',
    buff: { name: '魔力覺醒', desc: '攻擊力 +35%' },
    skills: [
      {
        id: 'fireball',
        name: '火球',
        cooldown: 4,
        mp: 10,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'projectile', count: 1, power: 2.2, splash: 2.2 }],
      },
      {
        id: 'frost_blast',
        name: '冰霜衝擊',
        cooldown: 9,
        mp: 15,
        needsTarget: true,
        range: 10,
        effects: [
          { type: 'zone', at: 'target', radius: 3.5, duration: 0.6, tick: 1, power: 1.5, slow: 4, color: '#8fd3ff', style: 'frost' },
        ],
      },
      {
        id: 'mana_awaken',
        name: '魔力覺醒',
        cooldown: BUFF_CD,
        mp: 10,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'atk', amount: 0.35, duration: BUFF_TIME }],
      },
      {
        id: 'meteor_storm',
        name: '隕石風暴',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 35,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'zone', at: 'target', radius: 4.5, duration: 3, tick: 0.6, power: 2.2, color: '#ff7a3c', style: 'meteor' }],
      },
    ],
    base: { hp: 75, mp: 90, atk: 16, def: 3 },
    attack: { range: 8.5, interval: 1.3, ranged: true, crit: 0.05, color: '#ff8a3c' },
    colors: { primary: '#7e5bd6', secondary: '#43337f', accent: '#ffd166' },
    weapon: 'staff',
  },
  knight: {
    id: 'knight',
    name: '戰士',
    en: 'KNIGHT',
    companion: '雷恩',
    role: '近距離坦克',
    desc: '高防禦、格擋、吸引仇恨',
    buff: { name: '鋼鐵意志', desc: '防禦力 +50%' },
    skills: [
      {
        id: 'shield_bash',
        name: '盾擊',
        cooldown: 6,
        mp: 5,
        needsTarget: true,
        range: 2,
        effects: [{ type: 'melee', power: 1.8, stun: 1.5 }],
      },
      {
        id: 'taunt',
        name: '挑釁',
        cooldown: 8,
        mp: 5,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'taunt', radius: 9, duration: 5 }],
      },
      {
        id: 'iron_will',
        name: '鋼鐵意志',
        cooldown: BUFF_CD,
        mp: 6,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'def', amount: 0.5, duration: BUFF_TIME }],
      },
      {
        id: 'guardian_wall',
        name: '守護壁壘',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 12,
        needsTarget: false,
        range: 0,
        effects: [
          { type: 'buff', stat: 'guard', amount: 0.6, duration: 6, party: true },
          { type: 'taunt', radius: 12, duration: 6 },
        ],
      },
    ],
    base: { hp: 140, mp: 30, atk: 10, def: 12 },
    attack: { range: 1.5, interval: 1, ranged: false, crit: 0.05, color: '#e8eef5' },
    colors: { primary: '#4f7fd9', secondary: '#c9d3e0', accent: '#e9b949' },
    weapon: 'sword',
  },
  cleric: {
    id: 'cleric',
    name: '聖者',
    en: 'CLERIC',
    companion: '米婭',
    role: '治療與隊伍支援',
    desc: '治療、護盾、解除不良狀態',
    buff: { name: '生命祝福', desc: '全隊最大 HP +25%' },
    skills: [
      {
        id: 'holy_light',
        name: '聖光術',
        cooldown: 5,
        mp: 8,
        needsTarget: true,
        range: 9,
        effects: [{ type: 'projectile', count: 1, power: 2.4 }],
      },
      {
        id: 'healing_light',
        name: '治癒之光',
        cooldown: 4,
        mp: 12,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'heal', ratio: 0.3 }],
      },
      {
        id: 'life_blessing',
        name: '生命祝福',
        cooldown: BUFF_CD,
        mp: 15,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'maxHp', amount: 0.25, duration: BUFF_TIME, party: true }],
      },
      {
        id: 'sacred_domain',
        name: '神聖領域',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 30,
        needsTarget: false,
        range: 0,
        effects: [
          { type: 'zone', at: 'self', radius: 6, duration: 6, tick: 0.5, power: 0.8, heal: 0.05, color: '#fff1a8', style: 'holy' },
        ],
      },
    ],
    base: { hp: 95, mp: 80, atk: 8, def: 6 },
    attack: { range: 7.5, interval: 1.4, ranged: true, crit: 0.05, color: '#fff3a3' },
    colors: { primary: '#fff4e2', secondary: '#8fc7f2', accent: '#f2c14e' },
    weapon: 'wand',
  },
}

export const CLASS_ORDER: ClassId[] = ['archer', 'mage', 'knight', 'cleric']
export const MAX_LEVEL = 50
