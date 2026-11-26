// 外觀設定：性別外觀與職業服裝分開，組合成角色模型的輸入。
import { CLASSES, type ClassId, type WeaponKind } from './classes'
import { CLASS_WEAPONS, SHIELD_URLS } from './weaponModels'

export type Gender = 'boy' | 'girl'
export type Headgear = 'none' | 'witchHat' | 'featherBand' | 'halo' | 'flower'

export interface Appearance {
  gender: Gender
  skin: string
  hair: string
  eye: string
  outfit: { primary: string; secondary: string; accent: string }
  shoes: string
  weapon: WeaponKind
  headgear: Headgear
  armor: boolean
  /** 有值時改用這個 GLB 骨架模型，載入前或失敗時退回程序化人物 */
  modelUrl?: string
  /** 內含 Idle / Walk / Run 動畫片段的 GLB；有值時優先於 modelUrl，直接播放模型自帶動作 */
  clipModelUrl?: string
  /** clipModelUrl 模型的顯示高度（公尺，預設 1.4）；帶長槍的衛兵比一般人高 */
  clipHeight?: number
  /** clipModelUrl 模型裡要隱藏的節點（例如動作自帶的飛行藥瓶） */
  clipHide?: string[]
  /** 已裝備武器的品質顏色；程序化武器（武器模型載入失敗時）的裝飾與發光改用此色 */
  weaponTint?: string
  /** 手上的武器模型（武器包 GLB）；沒有或載入失敗時用程序化武器 */
  weaponModel?: string
  /** 武器模型的動畫片段（弓的拉弦放箭），攻擊時播放 */
  weaponClip?: string
  /** 騎士左手的盾牌模型 */
  shieldModel?: string
}

/** 裝備帶來的外觀（game/gear.ts 依身上的裝備算出） */
export type GearLook = Pick<Appearance, 'weaponTint' | 'weaponModel' | 'weaponClip' | 'shieldModel'>

const GENDER_LOOK: Record<Gender, { hair: string; eye: string; skin: string }> = {
  boy: { hair: '#8a5630', eye: '#3f8fd6', skin: '#ffe0cc' },
  girl: { hair: '#f79ab2', eye: '#22a39a', skin: '#ffe4d2' },
}

/** public/models 裡的模型網址；加上部署的基底路徑，放在 GitHub Pages 子路徑下也找得到 */
export const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

/** 各職業的 GLB 模型（public/models），來源為 Character/ 資料夾；第二章夥伴改用 classes.ts 的 clipModel */
export const CLASS_MODELS: Partial<Record<ClassId, string>> = {
  archer: modelUrl('archer.web.glb'),
  mage: modelUrl('mage.web.glb'),
  knight: modelUrl('knight.web.glb'),
  cleric: modelUrl('cleric.web.glb'),
}

const CLASS_HEADGEAR: Record<ClassId, Headgear> = {
  archer: 'featherBand',
  mage: 'witchHat',
  knight: 'none',
  cleric: 'halo',
  assassin: 'none',
  apothecary: 'none',
}

/** 沒有裝備資料時（例如還沒加入的夥伴）：第 1 階武器、第 1 階盾牌 */
function defaultGear(classId: ClassId): GearLook {
  const w = CLASS_WEAPONS[classId][0]
  return { weaponModel: w.url, weaponClip: w.clip, shieldModel: classId === 'knight' ? SHIELD_URLS[0] : undefined }
}

export function buildAppearance(gender: Gender, classId: ClassId, gear?: GearLook): Appearance {
  const cls = CLASSES[classId]
  return {
    gender,
    ...GENDER_LOOK[gender],
    outfit: cls.colors,
    shoes: classId === 'knight' ? '#8d99ae' : '#7a5236',
    weapon: cls.weapon,
    headgear: CLASS_HEADGEAR[classId],
    armor: classId === 'knight',
    modelUrl: CLASS_MODELS[classId],
    // 第二章夥伴：模型自帶動作與武器（性別外觀不適用）
    clipModelUrl: cls.clipModel && modelUrl(cls.clipModel.file),
    clipHide: cls.clipModel?.hide,
    ...(gear ?? defaultGear(classId)),
  }
}

export const MERCHANT_APPEARANCE: Appearance = {
  gender: 'boy',
  skin: '#ffdcc2',
  hair: '#e0884a',
  eye: '#3d7a4f',
  outfit: { primary: '#f2c14e', secondary: '#7a5236', accent: '#e8735a' },
  shoes: '#5c4033',
  weapon: 'none',
  headgear: 'none',
  armor: false,
  clipModelUrl: modelUrl('merchant-npc.web.glb'),
}

export const NPC_ELDER_APPEARANCE: Appearance = {
  gender: 'girl',
  skin: '#ffe2cf',
  hair: '#b08ad9',
  eye: '#8a5a2b',
  outfit: { primary: '#ffb4a2', secondary: '#fff1e6', accent: '#6fcf97' },
  shoes: '#7a5236',
  weapon: 'none',
  headgear: 'flower',
  armor: false,
  clipModelUrl: modelUrl('guide-npc.web.glb'),
}
