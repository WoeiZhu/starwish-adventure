// 武器包（public/models/starwish-weapons-20261123-v001/）：每個職業 3 階武器、3 面盾牌、共用箭矢。
// 遊戲載入 tools/assets 壓縮過的 .web.glb；模型原點是握把，+Y 指向武器前端，+Z 是正面。
import CATALOG from '../../public/models/starwish-weapons-20261123-v001/weapons-catalog.json'
import type { ClassId } from './classes'

/** 不從 appearance.ts 匯入 modelUrl，避免兩個檔案互相匯入 */
const web = (url: string) => `${import.meta.env.BASE_URL}${url.replace(/\.glb$/, '.web.glb')}`

export interface WeaponModel {
  id: string
  /** 型錄上的武器名稱（武器店的商品名稱） */
  label: string
  classId: ClassId
  tier: 1 | 2 | 3
  /** baked = 角色模型自帶武器（暗殺者的雙刀、藥師的藥瓶），沒有另外的武器模型 */
  family: 'sword' | 'bow' | 'staff' | 'wand' | 'baked'
  /** 空字串 = 沒有武器模型 */
  url: string
  /** 有動畫片段的武器（弓：拉弦放箭） */
  clip?: string
}

interface CatalogItem {
  id: string
  label?: string
  class?: string
  tier?: number | null
  family?: string
  url: string
  clips?: string[]
}
const ITEMS = CATALOG.items as CatalogItem[]

const CLASS_IDS: ClassId[] = ['archer', 'mage', 'knight', 'cleric']
const FAMILIES = ['sword', 'bow', 'staff', 'wand'] as const

export const WEAPON_MODELS: WeaponModel[] = ITEMS.flatMap((i) => {
  const family = FAMILIES.find((f) => f === i.family)
  const classId = CLASS_IDS.find((c) => c === i.class)
  if (!family || !classId || !i.tier || i.tier < 1 || i.tier > 3) return []
  return [{ id: i.id, label: i.label ?? i.id, classId, tier: i.tier as 1 | 2 | 3, family, url: web(i.url), clip: i.clips?.[0] }]
})

/** 模型自帶武器的職業：武器店照樣賣三階（只有數值與名稱，外觀不變） */
const BAKED: Partial<Record<ClassId, [string, string, string]>> = {
  assassin: ['影葉雙刀', '月刃雙刀', '星痕雙刃'],
  apothecary: ['翠綠藥典', '星露藥瓶', '月光藥典'],
}

/** 各職業的武器，依階級排序（索引 0 = 第 1 階） */
export const CLASS_WEAPONS = {
  ...Object.fromEntries(CLASS_IDS.map((c) => [c, WEAPON_MODELS.filter((w) => w.classId === c).sort((a, b) => a.tier - b.tier)])),
  ...Object.fromEntries(
    Object.entries(BAKED).map(([c, names]) => [
      c,
      names!.map((label, i): WeaponModel => ({ id: `${c}-${i + 1}`, label, classId: c as ClassId, tier: (i + 1) as 1 | 2 | 3, family: 'baked', url: '' })),
    ]),
  ),
} as Record<ClassId, WeaponModel[]>

const url = (id: string) => web(ITEMS.find((i) => i.id === id)!.url)
/** 騎士的盾牌：第 1～3 階 */
export const SHIELD_URLS = [url('shared-shield'), url('shield-silver-blue'), url('shield-ivory-gold')]
/** 弓箭手的箭：原點在箭尾，往 +Z 飛，長 0.745 m */
export const ARROW_URL = url('shared-arrow')
export const ARROW_LENGTH = 0.745

/** 裝備等級對應模型階級：和裝備名稱一樣每 12 級換一階（第 4 階以上沿用第 3 階模型） */
export const tierForLevel = (level: number): 1 | 2 | 3 => (level >= 24 ? 3 : level >= 12 ? 2 : 1)

/** 武器店的商品等級門檻（主角等級） */
export const TIER_MIN_LEVEL = [1, 12, 24] as const

/** 角色手上的武器模型：武器店買的照商品；掉落的武器照等級；沒裝備用第 1 階 */
export function weaponModelFor(classId: ClassId, item?: { model?: string; level: number }): WeaponModel {
  const list = CLASS_WEAPONS[classId]
  return list.find((w) => w.id === item?.model) ?? list[tierForLevel(item?.level ?? 1) - 1]
}

/** 騎士盾牌依身上防具的等級換階 */
export const shieldUrlFor = (armor?: { level: number }) => SHIELD_URLS[tierForLevel(armor?.level ?? 1) - 1]
