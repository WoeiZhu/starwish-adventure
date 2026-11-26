// 職業資料表（資料驅動）：能力值、普攻、技能效果都在這裡，戰鬥系統只負責執行。
// 前四個職業可以當主角；暗殺者、藥師是第二章才加入的夥伴（不能當主角）。
export type ClassId = 'archer' | 'mage' | 'knight' | 'cleric' | 'assassin' | 'apothecary'
export type WeaponKind = 'bow' | 'staff' | 'sword' | 'wand' | 'none'
export type ZoneStyle = 'rain' | 'meteor' | 'frost' | 'holy'
/** crit 為暴擊率絕對值（0.2 = +20%）；moveSpeed 為移動速度比例 */
export type BuffStat = 'atkSpeed' | 'atk' | 'def' | 'maxHp' | 'guard' | 'crit' | 'moveSpeed'

/** 技能效果：一個技能可以由多個效果組成 */
export type SkillEffect =
  /** 朝目標發射投射物；pierce = 直線穿透，splash = 命中後的擴散半徑 */
  | { type: 'projectile'; count: number; power: number; interval?: number; pierce?: boolean; splash?: number }
  | { type: 'melee'; power: number; stun?: number }
  /** 連擊：對目標連續近戰 hits 次，每下間隔 interval 秒 */
  | { type: 'combo'; hits: number; power: number; interval: number }
  /** 迴旋：以自己為中心，打中半徑內所有敵人一次 */
  | { type: 'spin'; radius: number; power: number }
  /** 中毒：delay 秒後（藥瓶飛到）讓目標周圍 radius 內的敵人中毒；dps = 每秒傷害（攻擊力倍率） */
  | { type: 'poison'; radius: number; dps: number; duration: number; delay: number }
  /** 瞬閃：躍起後落在目標身邊，對落點周圍造成傷害並暈眩 */
  | { type: 'blink'; power: number; radius: number; stun: number }
  /** 毒孢子：在目標位置長出一顆大蘑菇，delay 秒後爆炸（傷害＋中毒） */
  | { type: 'spore'; delay: number; radius: number; power: number; dps: number; duration: number }
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
  /** 自帶動作片段的模型（第二章夥伴）：file 相對 public/models；hide = 要隱藏的模型節點 */
  clipModel?: { file: string; hide?: string[] }
  /** 治療技能播放的動作片段（模型有 Heal 動作時） */
  healClip?: string
}

const BUFF_TIME = 8
const BUFF_CD = 25
const ULT_CD = 35

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
        cooldown: 4,
        mp: 8,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'projectile', count: 3, power: 0.8, interval: 0.12 }],
      },
      {
        id: 'pierce_arrow',
        name: '穿透箭',
        cooldown: 7,
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
        effects: [{ type: 'zone', at: 'target', radius: 3.2, duration: 3, tick: 0.3, power: 0.7, color: '#f4d35e', style: 'rain' }],
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
        cooldown: 3,
        mp: 10,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'projectile', count: 1, power: 2.2, splash: 2.2 }],
      },
      {
        id: 'frost_blast',
        name: '冰霜衝擊',
        cooldown: 7,
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
        effects: [{ type: 'zone', at: 'target', radius: 3.6, duration: 3, tick: 0.6, power: 2.2, color: '#ff7a3c', style: 'meteor' }],
      },
    ],
    base: { hp: 85, mp: 90, atk: 16, def: 4 },
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
        cooldown: 5,
        mp: 5,
        needsTarget: true,
        range: 2,
        effects: [{ type: 'melee', power: 1.8, stun: 1.5 }],
      },
      {
        id: 'taunt',
        name: '挑釁',
        cooldown: 7,
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
          { type: 'taunt', radius: 8, duration: 6 },
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
        cooldown: 4,
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
          { type: 'zone', at: 'self', radius: 4.5, duration: 6, tick: 0.5, power: 0.8, heal: 0.05, color: '#fff1a8', style: 'holy' },
        ],
      },
    ],
    base: { hp: 100, mp: 80, atk: 10, def: 6 },
    attack: { range: 7.5, interval: 1.4, ranged: true, crit: 0.05, color: '#fff3a3' },
    colors: { primary: '#fff4e2', secondary: '#8fc7f2', accent: '#f2c14e' },
    weapon: 'wand',
  },
  assassin: {
    id: 'assassin',
    name: '暗殺者',
    en: 'ASSASSIN',
    companion: '索恩',
    role: '近距離爆發',
    desc: '高暴擊、連擊、瞬間切入',
    buff: { name: '影葉之心', desc: '全隊暴擊率 +20%' },
    skills: [
      {
        id: 'double_strike',
        name: '二連擊',
        cooldown: 4,
        mp: 8,
        needsTarget: true,
        range: 2.2,
        effects: [{ type: 'combo', hits: 2, power: 1.15, interval: 0.22 }],
      },
      {
        id: 'blade_spin',
        name: '旋刃',
        cooldown: 7,
        mp: 12,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'spin', radius: 2.6, power: 1.5 }],
      },
      {
        id: 'shadow_heart',
        name: '影葉之心',
        cooldown: BUFF_CD,
        mp: 10,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'crit', amount: 0.2, duration: BUFF_TIME, party: true }],
      },
      {
        id: 'shadow_blink',
        name: '瞬閃',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 25,
        needsTarget: true,
        range: 11,
        effects: [{ type: 'blink', power: 3.4, radius: 2.4, stun: 1.2 }],
      },
    ],
    base: { hp: 95, mp: 45, atk: 15, def: 6 },
    attack: { range: 1.5, interval: 0.75, ranged: false, crit: 0.25, color: '#c9f27a' },
    colors: { primary: '#3f6b4f', secondary: '#5a3d2b', accent: '#c9f27a' },
    weapon: 'none',
    clipModel: { file: 'starwish-characters-20261126-v002/A02/character-game.web.glb' },
  },
  apothecary: {
    id: 'apothecary',
    name: '藥師',
    en: 'APOTHECARY',
    companion: '莉拉',
    role: '毒素與輔助',
    desc: '持續中毒、範圍爆發、補血加速',
    buff: { name: '疾行藥劑', desc: '全隊移動速度 +35%' },
    skills: [
      {
        id: 'toxic_spread',
        name: '毒性擴散',
        cooldown: 4,
        mp: 10,
        needsTarget: true,
        range: 9,
        effects: [{ type: 'poison', radius: 2.4, dps: 0.45, duration: 6, delay: 0.45 }],
      },
      {
        id: 'healing_potion',
        name: '治療藥水',
        cooldown: 7,
        mp: 12,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'heal', ratio: 0.28 }],
      },
      {
        id: 'swift_draught',
        name: '疾行藥劑',
        cooldown: BUFF_CD,
        mp: 12,
        needsTarget: false,
        range: 0,
        effects: [{ type: 'buff', stat: 'moveSpeed', amount: 0.35, duration: BUFF_TIME, party: true }],
      },
      {
        id: 'spore_bomb',
        name: '毒孢子',
        ultimate: true,
        cooldown: ULT_CD,
        mp: 30,
        needsTarget: true,
        range: 10,
        effects: [{ type: 'spore', delay: 1.2, radius: 3.4, power: 3, dps: 0.5, duration: 5 }],
      },
    ],
    base: { hp: 90, mp: 85, atk: 12, def: 5 },
    attack: { range: 8, interval: 1.3, ranged: true, crit: 0.05, color: '#a6e05a' },
    colors: { primary: '#7a9a5c', secondary: '#6b3d5e', accent: '#a6e05a' },
    weapon: 'none',
    // 模型的丟藥瓶動作自帶飛行藥瓶：改由遊戲的投射物表現，避免畫兩次
    clipModel: { file: 'starwish-characters-20261126-v002/A04/character-game.web.glb', hide: ['AttackProjectile', 'AnimatedProjectile'] },
    healClip: 'Heal',
  },
}

/** 可以當主角的職業（標題畫面、第一章的三位夥伴） */
export const HERO_CLASSES: ClassId[] = ['archer', 'mage', 'knight', 'cleric']
/** 全部職業（成長資料、存檔、背包篩選） */
export const CLASS_ORDER: ClassId[] = [...HERO_CLASSES, 'assassin', 'apothecary']
/** 出戰人數上限（主角以外） */
export const MAX_ACTIVE = 3
export const MAX_LEVEL = 50
