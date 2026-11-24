// 新版星光鎮的配置表與世界尺寸規範。
//   - 方案 B：城牆式奇幻城鎮（主城門、城牆、瞭望塔、主街、中央噴水池廣場、商業區）
//   - 方案 A：開放式奇幻村莊（自然道路、木柵欄、農田、花圃、不規則排列的商店），之後當村莊地圖的範本
// 兩個方案共用同一批 Meshy 單體模型（public/models/starwish-town-meshy-20261123-v001/*.web.glb）。
// 碰撞、尋路網格、門口、NPC、出入口都由配置表算出來，改配置不用另外改碰撞。
//
// 座標是「城鎮本地座標」：城門在南邊（+Z），城鎮往 -Z 延伸，進城後面向 -Z。
// 主線世界的城門外觀用同一份配置表，旋轉 180° 後放到南方街道盡頭（townToWorld），
// 所以從城外看到的城牆、塔、屋頂，和進城後看到的是同一個城鎮、方向一致。
import type { Collider } from './world'

// ── 世界尺寸規範（公尺） ──
// 以人物身高為基準：人物 1.23 m（原本 1.4 m × 0.88）
//   門高 ≈ 人物 2 倍（2.4～2.7 m）、一層樓 ≈ 3.5 m、商店 8.5～12 m 高、城牆 3.6 m、瞭望塔 11～12 m、
//   城門 10.8 m、樹 8 m、路燈 3.4 m、主街 6.5 m 寬、廣場直徑 24 m
export const WORLD_SCALE = {
  /** 人物（隊伍、NPC、守衛）：原本 1.4 m 的倍率 */
  char: 0.88,
  /** Meshy 建築（商店、公會、旅館） */
  building: 1.7,
  /** 城門 */
  gate: 1.8,
  /** 城牆模組（4 × 1.8 m → 9.6 × 4.3 m） */
  wall: 2.4,
  /** 樹 */
  tree: 1.6,
  /** 噴水池 */
  fountain: 1.8,
}
export const CHAR_HEIGHT_BASE = 1.4

export type TownVariant = 'classic' | 'A' | 'B'

/** 用哪一版城鎮：網址 ?town=b / ?town=a / ?town=classic（會記住）；預設是原版 */
function readVariant(): TownVariant {
  try {
    const q = new URLSearchParams(location.search).get('town')?.toLowerCase()
    const pick: TownVariant | null = q === 'b' || q === 'v2' ? 'B' : q === 'a' ? 'A' : q === 'classic' ? 'classic' : null
    if (pick) {
      localStorage.setItem('starwish.town', pick)
      return pick
    }
    const saved = localStorage.getItem('starwish.town')
    if (saved === 'A' || saved === 'B' || saved === 'classic') return saved
  } catch {
    /* 沒有 window / localStorage（測試環境） */
  }
  return 'classic'
}
export const TOWN_VARIANT: TownVariant = typeof window === 'undefined' ? 'classic' : readVariant()
export const NEW_TOWN = TOWN_VARIANT !== 'classic'
/** 人物縮放：新版城鎮才套用（原版維持原尺寸） */
export const CHAR_SCALE = NEW_TOWN ? WORLD_SCALE.char : 1

// ── 模組 ──
export type ModuleId =
  | 'weapon-shop'
  | 'general-store'
  | 'adventurers-guild'
  | 'town-inn'
  | 'star-fountain'
  | 'town-tree'
  | 'town-wall'
  | 'town-gate'
/** 原始尺寸 [寬 x, 高 y, 深 z]，模型原點在底部中心、正面朝 +Z（model-catalog.json） */
export const MODULE_DIMS: Record<ModuleId, [number, number, number]> = {
  'town-gate': [11, 6, 2.6],
  'weapon-shop': [7.2, 5.3, 5.5],
  'general-store': [6.6, 5, 5],
  'adventurers-guild': [7.5, 6.3, 5.8],
  'town-inn': [6.4, 7.2, 5.2],
  'star-fountain': [3.8, 2, 3.8],
  'town-tree': [4.2, 5, 4.2],
  'town-wall': [4, 1.8, 0.65],
}

export type TownBuildingId = 'weapon-shop' | 'general-store' | 'adventurers-guild' | 'town-inn'
export type TownNpcRole = 'quest-guide' | 'guild-placeholder' | 'weapon-vendor-placeholder' | 'general-vendor'

export interface Piece {
  asset: ModuleId
  x: number
  z: number
  /** 繞 Y 軸旋轉；正面方向是 (sin rot, cos rot)。建築只用 90° 的倍數，碰撞才能用軸對齊方塊 */
  rot: number
  s: number
}
export interface House {
  x: number
  z: number
  rot: number
  w: number
  d: number
  /** 牆高（屋頂另外加） */
  h: number
  wall: string
  roof: string
  /** 兩層樓的房子二樓外推一點 */
  floors: 1 | 2
}
export interface Tower {
  x: number
  z: number
  r: number
  h: number
}
export interface Road {
  pts: [number, number][]
  w: number
  kind: 'cobble' | 'dirt'
}
export interface Spot {
  x: number
  z: number
  rot: number
}
export interface WallSeg {
  x1: number
  z1: number
  x2: number
  z2: number
}
export interface Field {
  x: number
  z: number
  w: number
  d: number
  rot: number
  crop: 'wheat' | 'veg' | 'flower'
}
export interface Prop {
  kind: 'barrels' | 'crates' | 'cart' | 'well' | 'hedge'
  x: number
  z: number
  rot: number
  /** 樹籬長度 */
  len?: number
}
export interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface TownLayout {
  id: 'A' | 'B'
  name: string
  /** 可行走範圍 */
  bounds: Box
  /** 整個城鎮佔的範圍（含城牆、外圍道路）；主線世界在這裡面整平地面、清掉岩壁 */
  footprint: Box
  gate: Piece | null
  /** 方案 A 的木製入口拱門 */
  arch: Spot | null
  walls: WallSeg[]
  towers: Tower[]
  shops: { id: TownBuildingId; piece: Piece }[]
  fountain: Piece | null
  houses: House[]
  trees: Piece[]
  roads: Road[]
  plaza: { x: number; z: number; r: number } | null
  lamps: Spot[]
  flags: (Spot & { y: number; color: string })[]
  guards: (Spot & { outside: boolean })[]
  benches: Spot[]
  beds: (Spot & { w: number; d: number })[]
  stalls: (Spot & { color: string })[]
  fences: [number, number][][]
  fields: Field[]
  props: Prop[]
  /** 三角彩旗：[x1, z1, x2, z2, 高度] */
  bunting: [number, number, number, number, number][]
  /** 城鎮名稱看板（y 是離地高度） */
  signs: (Spot & { y: number })[]
  npcs: { role: TownNpcRole; model: 'guide' | 'merchant'; x: number; z: number; rot: number }[]
  spawn: { x: number; z: number; facing: number }
  /** 出城觸發區：走進這個方塊就回到主線世界 */
  exit: Box
}

const P = (asset: ModuleId, x: number, z: number, rot: number, s: number): Piece => ({ asset, x, z, rot, s })
const H = Math.PI / 2

// ── 方案 B：城牆式城鎮 ──
function layoutB(): TownLayout {
  const S = WORLD_SCALE
  const W = 30 // 左右城牆 x = ±30
  const FRONT = 20 // 城門所在的南牆
  const BACK = -46
  const gateHalf = (MODULE_DIMS['town-gate'][0] * S.gate) / 2 // 9.9
  const gateDepth = (MODULE_DIMS['town-gate'][2] * S.gate) / 2 // 2.34
  const plaza = { x: 0, z: -13, r: 12 }

  const towers: Tower[] = [
    { x: -W, z: FRONT, r: 2.8, h: 11.5 },
    { x: W, z: FRONT, r: 2.8, h: 11.5 },
    { x: -W, z: BACK, r: 2.8, h: 11.5 },
    { x: W, z: BACK, r: 2.8, h: 11.5 },
    { x: -W, z: -13, r: 2.4, h: 10 },
    { x: W, z: -13, r: 2.4, h: 10 },
    { x: -20, z: FRONT, r: 2.2, h: 9.5 },
    { x: 20, z: FRONT, r: 2.2, h: 9.5 },
    { x: 0, z: BACK, r: 2.4, h: 10 },
  ]
  const walls: WallSeg[] = [
    { x1: -W, z1: FRONT, x2: -gateHalf + 0.4, z2: FRONT },
    { x1: gateHalf - 0.4, z1: FRONT, x2: W, z2: FRONT },
    { x1: -W, z1: FRONT, x2: -W, z2: BACK },
    { x1: W, z1: FRONT, x2: W, z2: BACK },
    { x1: -W, z1: BACK, x2: W, z2: BACK },
  ]
  const lamps: Spot[] = []
  for (const z of [15.5, 8.5, 1.5]) for (const x of [-4.3, 4.3]) lamps.push({ x, z, rot: 0 })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    lamps.push({ x: plaza.x + Math.sin(a) * (plaza.r + 0.6), z: plaza.z + Math.cos(a) * (plaza.r + 0.6), rot: 0 })
  }
  for (const x of [-22, -16, 16, 22]) lamps.push({ x, z: -16.3, rot: 0 })
  lamps.push({ x: 2.8, z: -27.5, rot: 0 }, { x: -2.8, z: -27.5, rot: 0 })

  const stalls: (Spot & { color: string })[] = []
  const stallColors = ['#e8735a', '#5d8fe0', '#f2c14e', '#6fbf73']
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    stalls.push({ x: plaza.x + Math.sin(a) * 9.2, z: plaza.z + Math.cos(a) * 9.2, rot: a + Math.PI, color: stallColors[i] })
  }
  const beds: (Spot & { w: number; d: number })[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    beds.push({ x: plaza.x + Math.sin(a) * 5.4, z: plaza.z + Math.cos(a) * 5.4, rot: a, w: 2.6, d: 0.9 })
  }

  const trees: Piece[] = [
    // 沿城牆內側
    P('town-tree', -26.5, 16, 0.3, S.tree),
    P('town-tree', 26.5, 16.5, 1.2, S.tree),
    P('town-tree', -26.5, -21, 2.1, S.tree * 0.9),
    P('town-tree', 26.5, -21.5, 0.7, S.tree * 0.95),
    P('town-tree', -10, -42.5, 1.6, S.tree * 0.9),
    P('town-tree', 10, -42.5, 2.6, S.tree),
    P('town-tree', -26.5, -42.5, 0.2, S.tree),
    P('town-tree', 26.5, -42.5, 1.9, S.tree * 0.9),
    // 廣場四角外側
    P('town-tree', -9.5, -24.5, 0.9, S.tree * 0.85),
    P('town-tree', 9.5, -2.5, 2.4, S.tree * 0.85),
  ]

  const houses: House[] = [
    // 城門內兩側
    { x: -23.5, z: 9, rot: H, w: 7, d: 6.5, h: 4.2, wall: '#fff3dc', roof: '#e8735a', floors: 2 },
    { x: 23.5, z: 9, rot: -H, w: 7, d: 6.5, h: 4.2, wall: '#fdeccd', roof: '#5d8fe0', floors: 2 },
    { x: -23.5, z: -1, rot: H, w: 6, d: 6, h: 3.6, wall: '#f6e2c4', roof: '#6fae73', floors: 1 },
    { x: 23.5, z: -1.5, rot: -H, w: 6.5, d: 6, h: 3.8, wall: '#fff3dc', roof: '#c46a8f', floors: 1 },
    // 廣場西北、東北
    { x: -17, z: -31, rot: 0, w: 9, d: 7, h: 4.4, wall: '#fdeccd', roof: '#d9694f', floors: 2 },
    { x: -24.5, z: -38.5, rot: H, w: 6, d: 6.5, h: 3.8, wall: '#fff3dc', roof: '#5d8fe0', floors: 1 },
    { x: 25, z: -38.5, rot: -H, w: 6, d: 6, h: 3.6, wall: '#f6e2c4', roof: '#e8a33d', floors: 1 },
    // 十字街兩端
    { x: -22.5, z: -23.5, rot: 0, w: 7, d: 5.5, h: 3.8, wall: '#f6e2c4', roof: '#8a6fd1', floors: 1 },
    { x: 25.5, z: -22.5, rot: -H, w: 6, d: 5, h: 3.6, wall: '#fdeccd', roof: '#6fae73', floors: 1 },
    // 城門內側，貼著南牆的長屋
    { x: -15.5, z: 15.6, rot: Math.PI, w: 8, d: 4.6, h: 3.6, wall: '#f6e2c4', roof: '#c46a8f', floors: 1 },
    { x: 15.5, z: 15.6, rot: Math.PI, w: 8, d: 4.6, h: 3.6, wall: '#fff3dc', roof: '#e8a33d', floors: 1 },
    // 商店與廣場之間
    { x: -15.5, z: -6, rot: H, w: 6, d: 5, h: 3.6, wall: '#fff3dc', roof: '#5d8fe0', floors: 2 },
    { x: 15.5, z: -6, rot: -H, w: 6, d: 5, h: 3.6, wall: '#f6e2c4', roof: '#d9694f', floors: 2 },
    // 城後
    { x: -14, z: -41, rot: 0, w: 7, d: 5, h: 3.8, wall: '#fdeccd', roof: '#e8735a', floors: 1 },
    { x: 14, z: -41.2, rot: 0, w: 7, d: 4.6, h: 3.6, wall: '#fff3dc', roof: '#8a6fd1', floors: 1 },
  ]

  const roads: Road[] = [
    { pts: [[0, 60], [0, FRONT + gateDepth]], w: 5.5, kind: 'dirt' },
    { pts: [[0, FRONT + gateDepth + 0.6], [0, plaza.z + plaza.r - 1]], w: 6.5, kind: 'cobble' },
    { pts: [[-W + 1.6, plaza.z], [W - 1.6, plaza.z]], w: 5.5, kind: 'cobble' },
    { pts: [[0, plaza.z - plaza.r + 1], [0, -30.5]], w: 5, kind: 'cobble' },
    { pts: [[-2.8, 5], [-9.6, 5]], w: 3.2, kind: 'cobble' },
    { pts: [[2.8, 5], [9.6, 5]], w: 3.2, kind: 'cobble' },
    { pts: [[17, plaza.z - 2.6], [17, -25.2]], w: 3.2, kind: 'cobble' },
    { pts: [[-17, plaza.z - 2.6], [-17, -27]], w: 3, kind: 'cobble' },
    { pts: [[-2.8, 12.5], [-19.6, 12.5]], w: 2.6, kind: 'cobble' },
    { pts: [[2.8, 12.5], [19.6, 12.5]], w: 2.6, kind: 'cobble' },
  ]

  const flags = [
    { x: -gateHalf + 2.2, z: FRONT, y: 10.8 * 0.92, rot: 0, color: '#5d8fe0' },
    { x: gateHalf - 2.2, z: FRONT, y: 10.8 * 0.92, rot: 0, color: '#5d8fe0' },
    ...towers.slice(0, 4).map((t) => ({ x: t.x, z: t.z, y: t.h + t.r * 1.5, rot: 0, color: '#e8735a' })),
    { x: plaza.x - 3.6, z: plaza.z - plaza.r + 0.4, y: 0, rot: 0, color: '#f2c14e' },
    { x: plaza.x + 3.6, z: plaza.z - plaza.r + 0.4, y: 0, rot: 0, color: '#f2c14e' },
  ]

  return {
    id: 'B',
    name: '方案 B：城牆式城鎮',
    bounds: { minX: -W + 0.6, maxX: W - 0.6, minZ: BACK + 0.6, maxZ: FRONT + 2.2 },
    footprint: { minX: -W - 4, maxX: W + 4, minZ: BACK - 4, maxZ: FRONT + 3 },
    gate: P('town-gate', 0, FRONT, 0, S.gate),
    arch: null,
    walls,
    towers,
    shops: [
      { id: 'weapon-shop', piece: P('weapon-shop', -14.5, 5, H, S.building) },
      { id: 'general-store', piece: P('general-store', 14.5, 5, -H, S.building) },
      { id: 'adventurers-guild', piece: P('adventurers-guild', 0, -37, 0, S.building) },
      { id: 'town-inn', piece: P('town-inn', 17, -30, 0, S.building) },
    ],
    fountain: P('star-fountain', plaza.x, plaza.z, 0, S.fountain),
    houses,
    trees,
    roads,
    plaza,
    lamps,
    flags,
    guards: [
      { x: -3.9, z: FRONT + gateDepth + 1.4, rot: 0, outside: true },
      { x: 3.9, z: FRONT + gateDepth + 1.4, rot: 0, outside: true },
      { x: -3.9, z: FRONT - gateDepth - 1.4, rot: Math.PI, outside: false },
      { x: 3.9, z: FRONT - gateDepth - 1.4, rot: Math.PI, outside: false },
    ],
    benches: [
      { x: plaza.x - 7.2, z: plaza.z, rot: H },
      { x: plaza.x + 7.2, z: plaza.z, rot: -H },
    ],
    beds,
    stalls,
    fences: [],
    props: [
      { kind: 'barrels', x: -7.2, z: 16.8, rot: 0.3 },
      { kind: 'crates', x: 7, z: 16.6, rot: -0.4 },
      { kind: 'cart', x: -6.4, z: -2.2, rot: 0.6 },
      { kind: 'crates', x: 6.4, z: -1.6, rot: 0.2 },
      { kind: 'barrels', x: -8.6, z: 2.2, rot: 1.2 },
      { kind: 'well', x: -22.5, z: -14.5, rot: 0 },
      { kind: 'barrels', x: 12.2, z: -24, rot: 0.8 },
      { kind: 'crates', x: -9.6, z: -34, rot: 0.5 },
      { kind: 'hedge', x: -24, z: 4.6, rot: H, len: 4.2 },
      { kind: 'hedge', x: 24, z: 4.6, rot: H, len: 4.2 },
      { kind: 'hedge', x: -10.5, z: -28.6, rot: 0, len: 4 },
      { kind: 'hedge', x: 10.5, z: -28.6, rot: 0, len: 4 },
      { kind: 'hedge', x: 0, z: -44.2, rot: 0, len: 12 },
      { kind: 'cart', x: 22.5, z: -9.5, rot: -0.9 },
      { kind: 'barrels', x: 26.5, z: 13, rot: 0 },
      { kind: 'crates', x: -26.5, z: -30.5, rot: 0.9 },
    ],
    bunting: [
      [-4.3, 15.5, 4.3, 15.5, 4.6],
      [-4.3, 8.5, 4.3, 8.5, 4.6],
      [-4.3, 1.5, 4.3, 1.5, 4.6],
      [-4.3, 15.5, -4.3, 8.5, 4.6],
      [4.3, 15.5, 4.3, 8.5, 4.6],
      [-4.3, 8.5, -4.3, 1.5, 4.6],
      [4.3, 8.5, 4.3, 1.5, 4.6],
    ],
    fields: [
      // 城門外的農田（城鎮地圖裡看得到；主線世界那一側是原本的草原）
      { x: -14, z: 36, w: 14, d: 10, rot: 0.05, crop: 'wheat' },
      { x: 14, z: 37, w: 12, d: 10, rot: -0.06, crop: 'veg' },
      { x: -15, z: 50, w: 13, d: 9, rot: -0.04, crop: 'flower' },
      { x: 15, z: 51, w: 14, d: 10, rot: 0.08, crop: 'wheat' },
    ],
    signs: [
      { x: 0, z: FRONT + gateDepth + 0.05, y: 7.3, rot: 0 },
      { x: 0, z: FRONT - gateDepth - 0.05, y: 7.3, rot: Math.PI },
    ],
    npcs: [
      { role: 'quest-guide', model: 'guide', x: -4.2, z: -29, rot: 0 },
      { role: 'guild-placeholder', model: 'guide', x: 4.2, z: -29, rot: 0 },
      { role: 'weapon-vendor-placeholder', model: 'merchant', x: -8.6, z: 8.4, rot: H },
      { role: 'general-vendor', model: 'merchant', x: 8.6, z: 8.4, rot: -H },
    ],
    spawn: { x: 0, z: FRONT - gateDepth - 2.6, facing: Math.PI },
    exit: { minX: -2.1, maxX: 2.1, minZ: FRONT + 0.2, maxZ: FRONT + gateDepth + 1 },
  }
}

// ── 方案 A：開放式村莊（範本：沒有城牆，木柵欄圍起農田，商店沿著彎曲的土路不規則排列） ──
function layoutA(): TownLayout {
  const S = WORLD_SCALE
  const plaza = { x: -2, z: -10, r: 8.5 }
  const fence = (pts: [number, number][]) => pts
  return {
    id: 'A',
    name: '方案 A：開放式村莊',
    bounds: { minX: -34, maxX: 34, minZ: -44, maxZ: 24.5 },
    footprint: { minX: -40, maxX: 40, minZ: -50, maxZ: 26 },
    gate: null,
    arch: { x: 0, z: 20, rot: 0 },
    walls: [],
    towers: [],
    shops: [
      { id: 'weapon-shop', piece: P('weapon-shop', -15, 4, H, S.building) },
      { id: 'general-store', piece: P('general-store', 13, -1, -H, S.building) },
      { id: 'adventurers-guild', piece: P('adventurers-guild', -4, -29, 0, S.building) },
      { id: 'town-inn', piece: P('town-inn', 16, -24, 0, S.building) },
    ],
    fountain: P('star-fountain', plaza.x, plaza.z, 0, S.fountain * 0.85),
    houses: [
      { x: -24, z: -14, rot: H, w: 7, d: 6, h: 3.6, wall: '#f6e2c4', roof: '#6fae73', floors: 1 },
      { x: 26, z: 8, rot: -H, w: 6.5, d: 6, h: 3.8, wall: '#fff3dc', roof: '#e8735a', floors: 1 },
      { x: -22, z: -32, rot: 0.0, w: 6, d: 6, h: 3.6, wall: '#fdeccd', roof: '#5d8fe0', floors: 1 },
      { x: 28, z: -38, rot: -H, w: 7, d: 6, h: 4, wall: '#fff3dc', roof: '#c46a8f', floors: 2 },
    ],
    trees: [
      P('town-tree', -28, 14, 0.4, S.tree),
      P('town-tree', 30, 18, 1.4, S.tree * 0.9),
      P('town-tree', -31, -2, 2.2, S.tree * 1.05),
      P('town-tree', 6, -38, 0.6, S.tree),
      P('town-tree', -30, -40, 1.1, S.tree * 0.95),
      P('town-tree', 31, -26, 2.7, S.tree),
      P('town-tree', 4, 13, 0.2, S.tree * 0.8),
      P('town-tree', -8, -19, 1.9, S.tree * 0.8),
    ],
    roads: [
      { pts: [[0, 60], [0, 22], [-1.5, 12], [-3, 2], [-2, -1.5]], w: 4.5, kind: 'dirt' },
      { pts: [[-2, -18.5], [-3.5, -24.5]], w: 4, kind: 'dirt' },
      { pts: [[6.5, -10], [11, -6], [8.4, -1]], w: 3.4, kind: 'dirt' },
      { pts: [[-10.5, -10], [-12, -2], [-10.4, 4]], w: 3.4, kind: 'dirt' },
      { pts: [[5, -14], [12, -18], [16, -19]], w: 3.2, kind: 'dirt' },
    ],
    plaza,
    lamps: [
      { x: 2.6, z: 16, rot: 0 },
      { x: -4.5, z: 6, rot: 0 },
      { x: 5, z: -4, rot: 0 },
      { x: -9, z: -16, rot: 0 },
    ],
    flags: [],
    guards: [],
    benches: [{ x: plaza.x + 5, z: plaza.z + 4, rot: -0.8 }],
    beds: [
      { x: -7, z: 12, rot: 0.3, w: 3.4, d: 1.2 },
      { x: 8, z: 8, rot: -0.4, w: 3, d: 1.1 },
      { x: -10, z: -24, rot: 0.1, w: 3.2, d: 1.1 },
    ],
    stalls: [
      { x: plaza.x + 6.4, z: plaza.z - 4, rot: -2.2, color: '#e8735a' },
      { x: plaza.x - 6.6, z: plaza.z - 3.4, rot: 2.3, color: '#6fbf73' },
    ],
    fences: [
      fence([[-34, 22], [-20, 22], [-18, 30], [-34, 30]]),
      fence([[16, 22], [33, 22], [33, 32], [16, 32]]),
      fence([[22.5, -5], [33, -5], [33, -17], [22.5, -17]]),
      fence([[-33, -20], [-28, -26], [-30, -42]]),
    ],
    props: [
      { kind: 'cart', x: 4.5, z: 10, rot: 0.4 },
      { kind: 'barrels', x: -6.5, z: -2, rot: 0 },
      { kind: 'well', x: 9, z: -12, rot: 0 },
      { kind: 'crates', x: 19, z: -4, rot: 0.6 },
      { kind: 'hedge', x: -18, z: -21, rot: 0.2, len: 5 },
    ],
    bunting: [[-2.9, 20, 2.9, 20, 4.2]],
    fields: [
      { x: -26, z: 26, w: 12, d: 6.5, rot: 0, crop: 'wheat' },
      { x: 24.5, z: 27, w: 14, d: 8, rot: 0, crop: 'veg' },
      { x: 27.5, z: -11, w: 8, d: 10, rot: 0, crop: 'flower' },
    ],
    signs: [{ x: 0, z: 20.2, y: 3.6, rot: 0 }],
    npcs: [
      { role: 'quest-guide', model: 'guide', x: -7.5, z: -20.8, rot: 0 },
      { role: 'guild-placeholder', model: 'guide', x: -0.5, z: -20.8, rot: 0 },
      { role: 'weapon-vendor-placeholder', model: 'merchant', x: -9.2, z: 7.6, rot: H },
      { role: 'general-vendor', model: 'merchant', x: 7.2, z: 2.3, rot: -H },
    ],
    spawn: { x: 0, z: 16.5, facing: Math.PI },
    exit: { minX: -2.6, maxX: 2.6, minZ: 21.4, maxZ: 24.5 },
  }
}

export const LAYOUTS = { A: layoutA, B: layoutB }
export function getLayout(id: 'A' | 'B') {
  return LAYOUTS[id]()
}

// ── 由配置表算出來的資料 ──
/** 模組依旋轉後的軸對齊尺寸（半寬 x、半深 z） */
export function pieceHalf(p: Piece) {
  const [w, , d] = MODULE_DIMS[p.asset]
  const side = Math.abs(Math.sin(p.rot)) > 0.5
  return { hx: ((side ? d : w) * p.s) / 2, hz: ((side ? w : d) * p.s) / 2 }
}
export function houseHalf(h: House) {
  const side = Math.abs(Math.sin(h.rot)) > 0.5
  return { hx: (side ? h.d : h.w) / 2, hz: (side ? h.w : h.d) / 2 }
}
/** 正面方向 */
const front = (rot: number) => ({ x: Math.sin(rot), z: Math.cos(rot) })

/** 建築門口（互動位置）：正面外側 1.4 m */
export function doorOf(p: Piece) {
  const [, , d] = MODULE_DIMS[p.asset]
  const f = front(p.rot)
  const k = (d * p.s) / 2 + 1.4
  return { x: p.x + f.x * k, z: p.z + f.z * k, facing: p.rot }
}

/** 建築與高度（鏡頭淡出、防穿模用） */
export interface Blocker extends Box {
  h: number
  /** 建築：擋住時淡出；城牆與塔：鏡頭拉近 */
  fade: boolean
  key: string
}

export function blockersOf(L: TownLayout): Blocker[] {
  const out: Blocker[] = []
  const add = (key: string, x: number, z: number, hx: number, hz: number, h: number, fade: boolean) =>
    out.push({ key, minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h, fade })
  for (const s of L.shops) {
    const { hx, hz } = pieceHalf(s.piece)
    add(s.id, s.piece.x, s.piece.z, hx, hz, MODULE_DIMS[s.piece.asset][1] * s.piece.s, true)
  }
  L.houses.forEach((h, i) => {
    const { hx, hz } = houseHalf(h)
    add('house-' + i, h.x, h.z, hx, hz, h.h * (h.floors === 2 ? 2 : 1) + Math.min(h.w, h.d) * 0.45, true)
  })
  if (L.gate) {
    const { hx, hz } = pieceHalf(L.gate)
    add('gate', L.gate.x, L.gate.z, hx, hz, MODULE_DIMS['town-gate'][1] * L.gate.s, true)
  }
  return out
}

/** 碰撞體（本地座標）：建築方塊、城牆、塔、城門兩側、噴水池、樹幹、路燈、攤位、長椅、花圃、柵欄 */
export function collidersOf(L: TownLayout): Collider[] {
  const out: Collider[] = []
  const box = (minX: number, maxX: number, minZ: number, maxZ: number, h: number, soft = false) =>
    out.push({ kind: 'box', minX, maxX, minZ, maxZ, h, soft })
  const circle = (x: number, z: number, r: number, h?: number) => out.push({ kind: 'circle', x, z, r, h })
  for (const s of L.shops) {
    const { hx, hz } = pieceHalf(s.piece)
    // 模型屋簷比牆面外凸，碰撞內縮一點，門口才走得到
    box(s.piece.x - hx * 0.9, s.piece.x + hx * 0.9, s.piece.z - hz * 0.86, s.piece.z + hz * 0.86, MODULE_DIMS[s.piece.asset][1] * s.piece.s, true)
  }
  for (const h of L.houses) {
    const { hx, hz } = houseHalf(h)
    box(h.x - hx, h.x + hx, h.z - hz, h.z + hz, h.h * h.floors + 2, true)
  }
  const wallT = (MODULE_DIMS['town-wall'][2] * WORLD_SCALE.wall) / 2 + 0.05
  for (const w of L.walls) box(Math.min(w.x1, w.x2) - wallT, Math.max(w.x1, w.x2) + wallT, Math.min(w.z1, w.z2) - wallT, Math.max(w.z1, w.z2) + wallT, 3.6 * 1.6)
  for (const t of L.towers) circle(t.x, t.z, t.r + 0.1, t.h + t.r * 1.5)
  if (L.gate) {
    const g = L.gate
    const half = (MODULE_DIMS['town-gate'][0] * g.s) / 2
    const open = 1.3 * g.s
    const dz = (MODULE_DIMS['town-gate'][2] * g.s) / 2
    box(g.x - half, g.x - open, g.z - dz, g.z + dz, 10, true)
    box(g.x + open, g.x + half, g.z - dz, g.z + dz, 10, true)
  }
  if (L.arch) {
    circle(L.arch.x - 2.9, L.arch.z, 0.35)
    circle(L.arch.x + 2.9, L.arch.z, 0.35)
  }
  if (L.fountain) circle(L.fountain.x, L.fountain.z, 1.75 * L.fountain.s)
  for (const t of L.trees) circle(t.x, t.z, 0.32 * t.s)
  for (const l of L.lamps) circle(l.x, l.z, 0.2)
  for (const s of L.stalls) circle(s.x, s.z, 1.3)
  for (const b of L.benches) circle(b.x, b.z, 0.7)
  for (const b of L.beds) circle(b.x, b.z, Math.max(b.w, b.d) / 2)
  for (const g of L.guards) circle(g.x, g.z, 0.35)
  for (const p of L.props) {
    if (p.kind === 'hedge') {
      const half = (p.len ?? 4) / 2
      const side = Math.abs(Math.sin(p.rot)) > 0.5
      box(p.x - (side ? 0.45 : half), p.x + (side ? 0.45 : half), p.z - (side ? half : 0.45), p.z + (side ? half : 0.45), 1)
    } else circle(p.x, p.z, p.kind === 'well' ? 1.15 : p.kind === 'cart' ? 1.3 : 0.9)
  }
  for (const f of L.fences)
    for (let i = 0; i + 1 < f.length; i++) {
      const [x1, z1] = f[i]
      const [x2, z2] = f[i + 1]
      const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.8)
      for (let k = 0; k <= n; k++) circle(x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n, 0.22)
    }
  return out
}

/** 尋路網格（格距 0.4 m，含主角半徑 0.4 m） */
export function gridOf(L: TownLayout, colliders: Collider[]) {
  const cell = 0.4
  const R = 0.4
  const b = L.bounds
  const nx = Math.ceil((b.maxX - b.minX) / cell)
  const nz = Math.ceil((b.maxZ - b.minZ) / cell)
  const blocked = new Uint8Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = b.minX + (i + 0.5) * cell
      const z = b.minZ + (j + 0.5) * cell
      let hit = false
      for (const c of colliders) {
        if (c.kind === 'circle') hit = Math.hypot(x - c.x, z - c.z) < c.r + R
        else hit = x > c.minX - R && x < c.maxX + R && z > c.minZ - R && z < c.maxZ + R
        if (hit) break
      }
      blocked[j * nx + i] = hit ? 1 : 0
    }
  }
  return { cell, minX: b.minX, minZ: b.minZ, nx, nz, blocked }
}

// ── 主線世界的城門 ↔ 城鎮本地座標 ──
/** 主線世界城門（南方街道盡頭）的位置 */
export const WORLD_GATE = { x: 0.2, z: 36.2 }
/** 城鎮本地 → 主線世界：旋轉 180°，本地的城門對到世界的城門 */
export function townToWorld(L: TownLayout, x: number, z: number) {
  const gx = L.gate?.x ?? L.arch?.x ?? 0
  const gz = L.gate?.z ?? L.arch?.z ?? 0
  return { x: WORLD_GATE.x + (gx - x), z: WORLD_GATE.z + (gz - z) }
}
/** 世界座標的方塊（本地方塊旋轉 180° 後） */
export function boxToWorld(L: TownLayout, b: Box): Box {
  const a = townToWorld(L, b.minX, b.minZ)
  const c = townToWorld(L, b.maxX, b.maxZ)
  return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z) }
}

/** 目前遊戲用的新版配置（原版時為 null） */
export const ACTIVE_LAYOUT: TownLayout | null = TOWN_VARIANT === 'classic' ? null : getLayout(TOWN_VARIANT)
