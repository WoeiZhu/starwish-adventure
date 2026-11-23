// 區域定義：名稱、範圍（判斷函式＋外框）、配色。之後新增區域只要在這裡加一筆，
// 地面配色、道路色調、HUD 區域名稱、分區尋路都會跟著使用。
import { RIDGE_Z, WALK, riverZ } from './terrain'

export type RegionId = 'village' | 'meadow' | 'forest' | 'ruins' | 'northwoods' | 'valley'

export interface RegionPalette {
  /** 地面主色與變化色（用雜訊混合） */
  ground: [string, string]
  /** 道路顏色與路肩（外框）顏色 */
  road: [string, string]
  /** 草的色相範圍（HSL 的 h），用來替草叢重新上色 */
  grassHue: [number, number]
  grassLight: [number, number]
}

export interface RegionDef {
  id: RegionId
  name: string
  /** 外框：分區尋路用的網格範圍（多留一點邊） */
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
  palette: RegionPalette
}

export const REGIONS: Record<RegionId, RegionDef> = {
  village: {
    id: 'village',
    name: '星光村',
    box: { minX: -17, maxX: 17, minZ: RIDGE_Z, maxZ: -2 },
    palette: { ground: ['#93d670', '#a3dc7c'], road: ['#efdcae', '#c9b88d'], grassHue: [0.25, 0.3], grassLight: [0.46, 0.58] },
  },
  meadow: {
    id: 'meadow',
    name: '翠綠草原',
    box: { minX: -17, maxX: WALK.maxX, minZ: -8, maxZ: WALK.maxZ },
    palette: { ground: ['#8fd36c', '#a2df7a'], road: ['#ecd9a8', '#cdb98a'], grassHue: [0.24, 0.3], grassLight: [0.44, 0.56] },
  },
  forest: {
    id: 'forest',
    name: '迷霧森林',
    box: { minX: WALK.minX, maxX: -17, minZ: -40, maxZ: WALK.maxZ },
    palette: { ground: ['#5e9e63', '#4f9060'], road: ['#b99f78', '#8d7a5c'], grassHue: [0.3, 0.38], grassLight: [0.3, 0.42] },
  },
  ruins: {
    id: 'ruins',
    name: '古代石環',
    box: { minX: 17, maxX: WALK.maxX, minZ: -40.5, maxZ: -4 },
    palette: { ground: ['#b5c983', '#c6c88e'], road: ['#d9d2bf', '#a8a08c'], grassHue: [0.14, 0.2], grassLight: [0.5, 0.6] },
  },
  northwoods: {
    id: 'northwoods',
    name: '北境林道',
    box: { minX: -17, maxX: 17, minZ: -40, maxZ: RIDGE_Z + 1 },
    palette: { ground: ['#79bd82', '#86c48c'], road: ['#d8cba4', '#ab9d7c'], grassHue: [0.3, 0.36], grassLight: [0.38, 0.5] },
  },
  valley: {
    id: 'valley',
    name: '月光山谷',
    box: { minX: WALK.minX, maxX: WALK.maxX, minZ: WALK.minZ, maxZ: -35.5 },
    palette: { ground: ['#5fa69a', '#4f8f95'], road: ['#d6e4e8', '#9fb3bd'], grassHue: [0.36, 0.46], grassLight: [0.38, 0.5] },
  },
}
export const REGION_IDS = Object.keys(REGIONS) as RegionId[]
export const REGION_NAME = Object.fromEntries(REGION_IDS.map((r) => [r, REGIONS[r].name])) as Record<RegionId, string>

/** 座標所在區域：河的北岸是月光山谷；西側森林；村子北邊山脊之後是北境林道 */
export function regionAt(x: number, z: number): RegionId {
  if (z < riverZ(x)) return 'valley'
  if (x < -17) return 'forest'
  if (x >= 17 && z < -4) return 'ruins'
  if (Math.abs(x) < 17 && z < -2) return z < RIDGE_Z ? 'northwoods' : 'village'
  return 'meadow'
}
