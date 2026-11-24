// 裝備資料：部位、品質與固定效果（不做隨機詞綴）。
import type { ClassId } from './classes'

export type Slot = 'weapon' | 'armor' | 'accessory'
export const SLOTS: Slot[] = ['weapon', 'armor', 'accessory']
export const SLOT_NAME: Record<Slot, string> = { weapon: '武器', armor: '防具', accessory: '飾品' }

export const QUALITIES = [
  { name: '普通', color: '#aab2bd', mul: 1 },
  { name: '優良', color: '#5fc46a', mul: 1.3 },
  { name: '稀有', color: '#4a9cf5', mul: 1.7 },
  { name: '史詩', color: '#a96bf0', mul: 2.2 },
  { name: '傳說', color: '#f59a2f', mul: 3 },
] as const
export type Quality = 0 | 1 | 2 | 3 | 4

export interface ItemStats {
  atk?: number
  def?: number
  hp?: number
  mp?: number
  /** 暴擊率（0–1） */
  crit?: number
}

export interface Item {
  uid: string
  slot: Slot
  /** 武器限定職業；防具與飾品全職業通用 */
  classId?: ClassId
  name: string
  quality: Quality
  level: number
  stats: ItemStats
  /** 武器店買的武器：武器包的模型 id（data/weaponModels.ts）；掉落的武器沒有，依等級挑模型 */
  model?: string
}

const WEAPON_NAMES: Record<ClassId, string[]> = {
  archer: ['獵人短弓', '白樺長弓', '疾風之弓', '星辰神弓'],
  mage: ['學徒法杖', '紅玉法杖', '秘銀法杖', '星願之杖'],
  knight: ['鐵製長劍', '騎士闊劍', '蒼藍之刃', '星輝聖劍'],
  cleric: ['祈禱短杖', '聖光權杖', '祝福之杖', '晨曦聖杖'],
}
const ARMOR_NAMES = ['旅人布衣', '皮革護甲', '鍛鐵胸甲', '星紋戰衣']
const ACCESSORIES: { name: string; stat: keyof ItemStats }[] = [
  { name: '力量戒指', stat: 'atk' },
  { name: '守護護符', stat: 'def' },
  { name: '生命墜飾', stat: 'hp' },
  { name: '銳眼耳環', stat: 'crit' },
  { name: '智慧吊墜', stat: 'mp' },
]

/** 依等級挑名稱：每 12 級換下一階 */
const tier = (level: number, names: string[]) => names[Math.min(names.length - 1, Math.floor((level - 1) / 12))]
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

let uidSeq = 0
const newUid = () => `i${Date.now().toString(36)}${(uidSeq++).toString(36)}`

export function makeItem(slot: Slot, level: number, quality: Quality, classId?: ClassId): Item {
  const mul = QUALITIES[quality].mul
  const prefix = QUALITIES[quality].name
  if (slot === 'weapon') {
    const c = classId ?? 'archer'
    return {
      uid: newUid(),
      slot,
      classId: c,
      name: `${prefix}的${tier(level, WEAPON_NAMES[c])}`,
      quality,
      level,
      stats: { atk: Math.round((3 + level * 1.2) * mul) },
    }
  }
  if (slot === 'armor') {
    return {
      uid: newUid(),
      slot,
      name: `${prefix}的${tier(level, ARMOR_NAMES)}`,
      quality,
      level,
      stats: { def: Math.round((2 + level * 0.8) * mul), hp: Math.round((12 + level * 5) * mul) },
    }
  }
  const a = pick(ACCESSORIES)
  const value =
    a.stat === 'crit'
      ? 0.02 + quality * 0.012
      : a.stat === 'hp'
        ? Math.round((15 + level * 6) * mul)
        : a.stat === 'mp'
          ? Math.round((10 + level * 3) * mul)
          : Math.round((1.5 + level * 0.5) * mul)
  return { uid: newUid(), slot, name: `${prefix}的${a.name}`, quality, level, stats: { [a.stat]: value } }
}

/** 品質機率：普通 55%、優良 28%、稀有 12%、史詩 4%、傳說 1% */
export function rollQuality(): Quality {
  const r = Math.random()
  return r < 0.55 ? 0 : r < 0.83 ? 1 : r < 0.95 ? 2 : r < 0.99 ? 3 : 4
}

/** 怪物掉落的裝備：部位隨機，武器只會掉隊伍中職業可用的 */
export function rollItem(level: number, partyClasses: ClassId[]): Item {
  const slot = pick<Slot>(['weapon', 'weapon', 'armor', 'armor', 'accessory'])
  return makeItem(slot, level, rollQuality(), slot === 'weapon' ? pick(partyClasses) : undefined)
}

export function describeStats(s: ItemStats) {
  const out: string[] = []
  if (s.atk) out.push(`攻擊 +${s.atk}`)
  if (s.def) out.push(`防禦 +${s.def}`)
  if (s.hp) out.push(`生命 +${s.hp}`)
  if (s.mp) out.push(`魔力 +${s.mp}`)
  if (s.crit) out.push(`暴擊 +${Math.round(s.crit * 100)}%`)
  return out.join('　')
}

/** 粗略戰力分數，用來排序與比較 */
export const itemScore = (i: Item) =>
  (i.stats.atk ?? 0) * 3 + (i.stats.def ?? 0) * 2 + (i.stats.hp ?? 0) * 0.3 + (i.stats.mp ?? 0) * 0.2 + (i.stats.crit ?? 0) * 200
