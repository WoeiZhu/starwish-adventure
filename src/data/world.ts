// MVP 地圖「星光村外草原」：以固定亂數種子產生，確保每次載入佈局一致。
import * as THREE from 'three'
import type { Species } from './enemies'

export interface Vec2 {
  x: number
  z: number
}

/** 玩家可行走範圍：原本的草原一帶是 ±37，第二章往北延伸出月光山谷 */
export const BOUNDS = { minX: -37, maxX: 37, minZ: -72, maxZ: 37 }
export const SPAWN: Vec2 = { x: 0, z: 6 }
export const PLAZA = { x: 0, z: -9, r: 6 }

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20261116)
const rand = (a: number, b: number) => a + (b - a) * rng()

// ── 道路 ─────────────────────────────────────────────
export interface RoadDef {
  curve: THREE.CatmullRomCurve3
  width: number
}
const v = (x: number, z: number) => new THREE.Vector3(x, 0, z)
export const ROADS: RoadDef[] = [
  {
    curve: new THREE.CatmullRomCurve3([v(0, 44), v(1.5, 30), v(-2.5, 19), v(1.2, 9), v(0, 0), v(-0.5, -6)]),
    width: 2.4,
  },
  {
    curve: new THREE.CatmullRomCurve3([v(0, 0.5), v(8, 2.5), v(17, -0.5), v(27, 2), v(44, 0)]),
    width: 2,
  },
  // 第二章：從村子廣場往北穿過林帶，通往月光山谷深處的月泉
  {
    curve: new THREE.CatmullRomCurve3([v(3, -13), v(5.2, -19), v(6, -27), v(3.5, -35), v(1.5, -43), v(-1, -51), v(0, -57)]),
    width: 2.2,
  },
]
const roadSamples: { x: number; z: number; hw: number }[] = []
for (const r of ROADS) {
  for (const p of r.curve.getSpacedPoints(120)) roadSamples.push({ x: p.x, z: p.z, hw: r.width / 2 })
}
/** 到道路邊緣的距離（負值代表在路上） */
export function distToRoad(x: number, z: number) {
  let best = Infinity
  for (const s of roadSamples) {
    const d = Math.hypot(x - s.x, z - s.z) - s.hw
    if (d < best) best = d
  }
  return Math.min(best, Math.hypot(x - PLAZA.x, z - PLAZA.z) - PLAZA.r)
}

// ── 房屋 ─────────────────────────────────────────────
export interface HouseDef {
  x: number
  z: number
  w: number
  d: number
  wallH: number
  roofH: number
  wall: string
  roof: string
}
export const HOUSES: HouseDef[] = [
  { x: -10, z: -11, w: 5.2, d: 4.2, wallH: 2.5, roofH: 1.9, wall: '#fff3dc', roof: '#e8735a' },
  { x: 9.5, z: -12, w: 4.6, d: 4, wallH: 2.4, roofH: 1.8, wall: '#fdebd0', roof: '#5aa9e6' },
  { x: -1, z: -19.5, w: 6, d: 4.6, wallH: 2.8, roofH: 2.2, wall: '#fff8ec', roof: '#f2a65a' },
  { x: 14, z: -4.5, w: 4.2, d: 3.8, wallH: 2.3, roofH: 1.7, wall: '#f8efe0', roof: '#7bc67b' },
]

export const WELL: Vec2 = { x: 3.2, z: -10.5 }
export const SIGN: Vec2 = { x: 2.2, z: 2.6 }
export const NPC_ELDER = { x: -2.6, z: -5.2, facing: 0.5, name: '莉莉安村長' }
export const MERCHANT = { x: 5.4, z: -5.4, facing: -0.6, name: '行商人波可' }

// ── 區域與事件地點（階段 D） ─────────────────────────
export type RegionId = 'village' | 'meadow' | 'forest' | 'ruins' | 'valley'
export const REGION_NAME: Record<RegionId, string> = {
  village: '星光村',
  meadow: '翠綠草原',
  forest: '迷霧森林',
  ruins: '古代石環',
  valley: '月光山谷',
}
/** 月光山谷：村子北邊穿過林帶之後的區域（第二章） */
export const VALLEY_EDGE = -40
/** 山谷入口的月光石碑、東側的星晶林、最深處的月泉（第二章 Boss 戰場） */
export const STELE: Vec2 = { x: 4.2, z: -44.5 }
export const GROVE = { x: 25, z: -55, r: 5 }
export const SPRING = { x: 0, z: -63, r: 5 }
/** 迷霧森林：地圖西側，樹木密集 */
export const FOREST_EDGE = -17
/** 古代石環：地圖東北，Boss 戰場 */
export const RUINS = { x: 27, z: -19, r: 6 }
export const RUIN_PILLARS: Vec2[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8
  return { x: RUINS.x + Math.cos(a) * RUINS.r, z: RUINS.z + Math.sin(a) * RUINS.r }
})
/** 三個招募事件的地點 */
export const EVENT_SPOTS = {
  meadow: { x: 17, z: 13 },
  forest: { x: -27, z: 6 },
  ruins: { x: 21, z: -12.5 },
}
export interface ChestDef {
  id: string
  x: number
  z: number
  rot: number
}
export const CHESTS: ChestDef[] = [
  { id: 'c_meadow', x: -3, z: 33, rot: 0 },
  { id: 'c_forest', x: -31, z: -9, rot: 1.2 },
  { id: 'c_ruins', x: 34, z: -24, rot: -0.8 },
  { id: 'c_valley', x: -32, z: -69, rot: 0.6 },
]
// ── 怪物營地（只在村外；村子與出生點一帶是安全區） ──
export interface CampDef {
  id: string
  x: number
  z: number
  species: Species
  /** 營地裡怪物的名稱與顏色，依序輪流使用 */
  kinds: { name: string; color: string }[]
  /** 營地的基礎等級（重生時會隨主角成長提高） */
  level: number
  /** 營地裡的怪物數量（2～4 隻，擠在一起，要一隻一隻拉） */
  count: number
  /** 精英營地：單獨一隻比較強的怪，重生比較慢 */
  tier?: 'normal' | 'elite'
}
const SLIME_KINDS = [
  { name: '草原史萊姆', color: '#7ed957' },
  { name: '水藍史萊姆', color: '#6ec3f4' },
  { name: '蜜桃史萊姆', color: '#ff9ec4' },
]
const FOREST_GOBLIN = [{ name: '森林哥布林', color: '#7a9a4a' }]
const RUINS_GOBLIN = [{ name: '石環哥布林', color: '#9a8a6a' }]
const WOLF = [{ name: '月影幼狼', color: '#8fa6d8' }]
const SHROOM = [{ name: '孢子蘑菇', color: '#c98ad8' }]
const CRYSTAL = [{ name: '星晶魔靈', color: '#8fd8ff' }]
/** 翠綠草原是史萊姆，離村子越遠等級越高；迷霧森林與石環外圍是哥布林 */
export const CAMPS: CampDef[] = [
  { id: 'm1', x: -9, z: 21, species: 'slime', kinds: SLIME_KINDS, level: 1, count: 3 },
  { id: 'm2', x: 9, z: 20, species: 'slime', kinds: SLIME_KINDS, level: 1, count: 3 },
  { id: 'm7', x: -13, z: 13, species: 'slime', kinds: SLIME_KINDS, level: 1, count: 2 },
  { id: 'm3', x: -14, z: 31, species: 'slime', kinds: SLIME_KINDS, level: 2, count: 4 },
  { id: 'm4', x: 8, z: 32, species: 'slime', kinds: SLIME_KINDS, level: 3, count: 4 },
  { id: 'm5', x: 28, z: 9, species: 'slime', kinds: SLIME_KINDS, level: 3, count: 4 },
  { id: 'm6', x: 27, z: 26, species: 'slime', kinds: SLIME_KINDS, level: 4, count: 4 },
  { id: 'f1', x: -24, z: -18, species: 'goblin', kinds: FOREST_GOBLIN, level: 4, count: 3 },
  { id: 'f2', x: -31, z: -28, species: 'goblin', kinds: FOREST_GOBLIN, level: 5, count: 3 },
  { id: 'f3', x: -23, z: 21, species: 'goblin', kinds: FOREST_GOBLIN, level: 5, count: 4 },
  { id: 'f4', x: -31, z: 29, species: 'goblin', kinds: FOREST_GOBLIN, level: 6, count: 3 },
  { id: 'r1', x: 34, z: -6, species: 'goblin', kinds: RUINS_GOBLIN, level: 6, count: 3 },
  { id: 'r2', x: 23, z: -33, species: 'goblin', kinds: RUINS_GOBLIN, level: 7, count: 3 },
  // 月光山谷（第二章）：幼狼成群、蘑菇放毒霧，兩側各有一隻遊蕩的星晶魔靈
  { id: 'v1', x: -10, z: -48, species: 'wolf', kinds: WOLF, level: 6, count: 3 },
  { id: 'v2', x: 13, z: -47, species: 'mushroom', kinds: SHROOM, level: 6, count: 3 },
  { id: 'v3', x: -24, z: -55, species: 'wolf', kinds: WOLF, level: 7, count: 4 },
  { id: 'v4', x: -12, z: -61, species: 'mushroom', kinds: SHROOM, level: 7, count: 3 },
  { id: 'v5', x: 13, z: -64, species: 'wolf', kinds: WOLF, level: 8, count: 3 },
  { id: 'v6', x: -27, z: -66, species: 'mushroom', kinds: SHROOM, level: 8, count: 4 },
  { id: 'v7', x: -31, z: -46, species: 'crystal', kinds: CRYSTAL, level: 7, count: 1, tier: 'elite' },
  { id: 'v8', x: 31, z: -67, species: 'crystal', kinds: CRYSTAL, level: 8, count: 1, tier: 'elite' },
]

export interface MonsterDef {
  id: string
  x: number
  z: number
  color: string
  name: string
  level: number
  species: Species
  tier: 'normal' | 'elite'
}
/** 營地內每隻怪物的出生點：繞著營地中心排成一圈（用固定亂數種子，每次載入都一樣） */
export const MONSTERS: MonsterDef[] = []
{
  const rnd = mulberry32(5150)
  const RING = [0, 0, 1.3, 1.9, 2.4]
  for (const c of CAMPS) {
    const phase = rnd() * Math.PI * 2
    for (let i = 0; i < c.count; i++) {
      const a = phase + (i / c.count) * Math.PI * 2
      const k = c.kinds[i % c.kinds.length]
      MONSTERS.push({
        id: `${c.id}-${i}`,
        x: c.x + Math.cos(a) * RING[c.count] + (rnd() - 0.5) * 0.6,
        z: c.z + Math.sin(a) * RING[c.count] + (rnd() - 0.5) * 0.6,
        color: k.color,
        name: k.name,
        level: c.level + (i % 3 === 2 ? 1 : 0),
        species: c.species,
        tier: c.tier ?? 'normal',
      })
    }
  }
}

// ── 區域首領：定期重生，可以反覆挑戰刷裝備 ──
export interface AreaBossDef {
  id: string
  name: string
  color: string
  tier: 'elite' | 'boss'
  species: Species
  x: number
  z: number
  /** 被擊敗後多少秒重生 */
  respawn: number
  /** 解鎖後第一次出現前的等待秒數 */
  firstDelay: number
  /** 等級 = 主角等級 + 這個數字（每次重生都重算） */
  levelBonus: number
  /** 訊息用的地點名稱 */
  place: string
}
export const AREA_BOSSES: AreaBossDef[] = [
  // 迷霧森林的精英：救出森林夥伴之後，會固定在森林深處徘徊
  { id: 'ab_forest', name: '迷霧史萊姆王子', color: '#8a7bd8', tier: 'elite', species: 'slime', x: -31, z: 14, respawn: 120, firstDelay: 30, levelBonus: 1, place: '迷霧森林' },
  // 石環 Boss：第一章打倒之後，每隔一段時間再度甦醒
  { id: 'ab_ruins', name: '史萊姆王', color: '#b06bff', tier: 'boss', species: 'slime', x: RUINS.x, z: RUINS.z - 2.5, respawn: 240, firstDelay: 60, levelBonus: 1, place: '古代石環' },
  // 第二章：星晶林的魔靈、月泉的靈鹿（殘留的星晶讓牠們一再失控）
  { id: 'ab_grove', name: '星晶魔靈・核', color: '#8fd8ff', tier: 'elite', species: 'crystal', x: GROVE.x, z: GROVE.z, respawn: 150, firstDelay: 40, levelBonus: 1, place: '星晶林' },
  { id: 'ab_spring', name: '苔蘚靈鹿', color: '#7cc98a', tier: 'boss', species: 'stag', x: SPRING.x, z: SPRING.z, respawn: 300, firstDelay: 60, levelBonus: 2, place: '月泉' },
]

/** 這些範圍內不長樹與石頭 */
const CLEARINGS: { x: number; z: number; r: number }[] = [
  { ...RUINS, r: RUINS.r + 3 },
  { ...EVENT_SPOTS.meadow, r: 5 },
  { ...EVENT_SPOTS.forest, r: 5.5 },
  { ...EVENT_SPOTS.ruins, r: 3 },
  { ...MERCHANT, r: 2.5 },
  ...CHESTS.map((c) => ({ x: c.x, z: c.z, r: 2.6 })),
  ...CAMPS.map((c) => ({ x: c.x, z: c.z, r: 4.2 })),
  ...AREA_BOSSES.map((b) => ({ x: b.x, z: b.z, r: 3.5 })),
  { ...SPRING, r: SPRING.r + 3.5 },
  { ...GROVE, r: GROVE.r + 1.5 },
  { ...STELE, r: 3.5 },
]
const inClearing = (x: number, z: number) => CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)

export function regionAt(x: number, z: number): RegionId {
  if (Math.hypot(x - RUINS.x, z - RUINS.z) < RUINS.r + 5) return 'ruins'
  if (z < VALLEY_EDGE) return 'valley'
  if (x < FOREST_EDGE) return 'forest'
  if (z < -2 && Math.abs(x) < 17) return 'village'
  return 'meadow'
}

/** 安全區：星光村與出生點周圍。怪物不會追進來，隊伍在裡面也不能攻擊野怪 */
export const SAFE_SPAWN_R = 9
export function inSafeZone(x: number, z: number) {
  return regionAt(x, z) === 'village' || Math.hypot(x - SPAWN.x, z - SPAWN.z) < SAFE_SPAWN_R
}

function inHouseArea(x: number, z: number, pad: number) {
  return HOUSES.some((h) => Math.abs(x - h.x) < h.w / 2 + pad && Math.abs(z - h.z) < h.d / 2 + pad)
}
function nearPoints(x: number, z: number, pts: Vec2[], r: number) {
  return pts.some((p) => Math.hypot(x - p.x, z - p.z) < r)
}
const KEEP_CLEAR: Vec2[] = [SPAWN, WELL, SIGN, NPC_ELDER, ...MONSTERS]

// ── 樹木 ─────────────────────────────────────────────
export interface TreeDef {
  x: number
  z: number
  s: number
  kind: 'round' | 'pine'
  color: string
  rot: number
}
export const TREES: TreeDef[] = []
{
  const greens = ['#58b368', '#6cc070', '#4fa860', '#7ccf7a', '#5db87a']
  let guard = 0
  while (TREES.length < 112 && guard++ < 6000) {
    const x = rand(-39, 39)
    const z = rand(-39, 39)
    const edge = Math.max(Math.abs(x), Math.abs(z))
    // 地圖邊緣與西側的迷霧森林樹木較密
    if (rng() > (edge > 24 || x < FOREST_EDGE + 1 ? 1 : 0.28)) continue
    if (inClearing(x, z)) continue
    if (distToRoad(x, z) < 2.6 || inHouseArea(x, z, 3) || nearPoints(x, z, KEEP_CLEAR, 3.5)) continue
    if (nearPoints(x, z, TREES, 3.2)) continue
    TREES.push({
      x,
      z,
      s: rand(0.85, 1.35),
      kind: rng() < 0.3 ? 'pine' : 'round',
      color: greens[Math.floor(rng() * greens.length)],
      rot: rand(0, Math.PI * 2),
    })
  }
}

// ── 石頭 ─────────────────────────────────────────────
export interface RockDef {
  x: number
  z: number
  s: number
  rot: number
}
export const ROCKS: RockDef[] = []
{
  let guard = 0
  while (ROCKS.length < 24 && guard++ < 2000) {
    const x = rand(-36, 36)
    const z = rand(-36, 36)
    if (distToRoad(x, z) < 1 || inHouseArea(x, z, 1.5) || nearPoints(x, z, KEEP_CLEAR, 2.5)) continue
    if (inClearing(x, z)) continue
    if (nearPoints(x, z, TREES, 1.8) || nearPoints(x, z, ROCKS, 2)) continue
    ROCKS.push({ x, z, s: rand(0.3, 0.95), rot: rand(0, Math.PI * 2) })
  }
}

// ── 草叢與花 ─────────────────────────────────────────
export interface Tuft {
  x: number
  z: number
  s: number
  rot: number
  color: string
}
export const GRASS: Tuft[] = []
export const FLOWERS: Tuft[] = []
{
  const c = new THREE.Color()
  let guard = 0
  while (GRASS.length < 3400 && guard++ < 20000) {
    const x = rand(-44, 44)
    const z = rand(-44, 44)
    if (distToRoad(x, z) < 0.25 || inHouseArea(x, z, 0.2)) continue
    c.setHSL(rand(0.25, 0.31), rand(0.5, 0.65), rand(0.42, 0.56))
    GRASS.push({ x, z, s: rand(0.7, 1.5), rot: rand(0, Math.PI), color: '#' + c.getHexString() })
  }
  const petals = ['#ffffff', '#ffd6e7', '#fff3a3', '#c9b6ff', '#ffb38a']
  guard = 0
  while (FLOWERS.length < 320 && guard++ < 4000) {
    const x = rand(-40, 40)
    const z = rand(-40, 40)
    if (distToRoad(x, z) < 0.4 || inHouseArea(x, z, 0.3)) continue
    FLOWERS.push({ x, z, s: rand(0.8, 1.3), rot: 0, color: petals[Math.floor(rng() * petals.length)] })
  }
}

// ── 月光山谷（第二章）：另用一組亂數種子，不影響原本草原的佈局 ──
export interface GlowProp {
  x: number
  z: number
  s: number
  rot: number
  color: string
}
/** 發光的星晶柱（大的有碰撞） */
export const CRYSTALS: GlowProp[] = []
/** 大蘑菇（大的有碰撞） */
export const SHROOMS: GlowProp[] = []
{
  const vr = mulberry32(4242)
  const vrand = (a: number, b: number) => a + (b - a) * vr()
  const inValley = (z: number) => z < VALLEY_EDGE - 1
  // 樹：邊緣密、中間疏，顏色偏青綠
  const teal = ['#3f8f7a', '#4a9c86', '#36806f', '#5aa58e', '#4d8f9c']
  let guard = 0
  let added = 0
  while (added < 78 && guard++ < 6000) {
    const x = vrand(-40, 40)
    const z = vrand(-76, -41)
    const edge = Math.abs(x) > 30 || z < -68
    if (vr() > (edge ? 1 : 0.2)) continue
    if (inClearing(x, z) || distToRoad(x, z) < 2.6 || nearPoints(x, z, KEEP_CLEAR, 3.5)) continue
    if (nearPoints(x, z, TREES, 3)) continue
    TREES.push({ x, z, s: vrand(0.9, 1.4), kind: vr() < 0.65 ? 'pine' : 'round', color: teal[Math.floor(vr() * teal.length)], rot: vrand(0, Math.PI * 2) })
    added++
  }
  guard = 0
  added = 0
  while (added < 10 && guard++ < 1000) {
    const x = vrand(-34, 34)
    const z = vrand(-70, -43)
    if (distToRoad(x, z) < 1 || inClearing(x, z) || nearPoints(x, z, KEEP_CLEAR, 2.5)) continue
    if (nearPoints(x, z, TREES, 1.8) || nearPoints(x, z, ROCKS, 2)) continue
    ROCKS.push({ x, z, s: vrand(0.35, 0.9), rot: vrand(0, Math.PI * 2) })
    added++
  }
  // 星晶：散落在山谷各處，星晶林四周圍成一圈
  const gems = ['#8fd8ff', '#b9a6ff', '#9ff0e0']
  guard = 0
  while (CRYSTALS.length < 26 && guard++ < 3000) {
    const x = vrand(-35, 35)
    const z = vrand(-71, -42)
    if (distToRoad(x, z) < 1.4 || inClearing(x, z) || nearPoints(x, z, KEEP_CLEAR, 2.6)) continue
    if (nearPoints(x, z, TREES, 1.6) || nearPoints(x, z, CRYSTALS, 4)) continue
    CRYSTALS.push({ x, z, s: vrand(0.5, 1.1), rot: vrand(0, Math.PI), color: gems[Math.floor(vr() * gems.length)] })
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3
    // 西側留一個缺口當入口
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.45) continue
    const r = GROVE.r + 0.6 + (i % 2) * 0.5
    CRYSTALS.push({ x: GROVE.x + Math.cos(a) * r, z: GROVE.z + Math.sin(a) * r, s: 1.2 + (i % 3) * 0.25, rot: a, color: gems[i % 3] })
  }
  // 大蘑菇：山谷西半部與月泉周圍
  const caps = ['#d98ad8', '#f0a0c0', '#c4a0f0', '#e8b07a']
  guard = 0
  while (SHROOMS.length < 18 && guard++ < 3000) {
    const x = vrand(-35, 28)
    const z = vrand(-71, -42)
    if (distToRoad(x, z) < 1.4 || inClearing(x, z) || nearPoints(x, z, KEEP_CLEAR, 2.4)) continue
    if (nearPoints(x, z, TREES, 1.6) || nearPoints(x, z, CRYSTALS, 2) || nearPoints(x, z, SHROOMS, 3.2)) continue
    SHROOMS.push({ x, z, s: vrand(0.6, 1.4), rot: vrand(0, Math.PI * 2), color: caps[Math.floor(vr() * caps.length)] })
  }
  // 草與發光小花：偏藍綠
  const c = new THREE.Color()
  guard = 0
  added = 0
  while (added < 1500 && guard++ < 8000) {
    const x = vrand(-44, 44)
    const z = vrand(-80, -40)
    if (!inValley(z) && vr() < 0.5) continue
    if (distToRoad(x, z) < 0.25) continue
    c.setHSL(vrand(0.36, 0.46), vrand(0.4, 0.55), vrand(0.38, 0.5))
    GRASS.push({ x, z, s: vrand(0.7, 1.5), rot: vrand(0, Math.PI), color: '#' + c.getHexString() })
    added++
  }
  const petals = ['#bfe9ff', '#d9c9ff', '#ffffff', '#9ff0e0']
  guard = 0
  added = 0
  while (added < 160 && guard++ < 3000) {
    const x = vrand(-38, 38)
    const z = vrand(-74, -42)
    if (distToRoad(x, z) < 0.4) continue
    FLOWERS.push({ x, z, s: vrand(0.8, 1.3), rot: 0, color: petals[Math.floor(vr() * petals.length)] })
    added++
  }
}

// ── 遠景（邊界森林與山丘，純裝飾）：圍著整個可行走範圍外側 ──
/** 點在可行走範圍外多遠（範圍內為負值） */
export function outsideBounds(x: number, z: number) {
  const dx = Math.max(BOUNDS.minX - x, x - BOUNDS.maxX)
  const dz = Math.max(BOUNDS.minZ - z, z - BOUNDS.maxZ)
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz)
}
export const BORDER_TREES: Tuft[] = []
{
  const c = new THREE.Color()
  let guard = 0
  while (BORDER_TREES.length < 340 && guard++ < 20000) {
    const x = rand(-64, 64)
    const z = rand(-100, 64)
    const out = outsideBounds(x, z)
    if (out < 6 || out > 25) continue
    c.setHSL(rand(0.3, 0.38), rand(0.4, 0.5), rand(0.3, 0.42))
    BORDER_TREES.push({ x, z, s: rand(1.1, 2.2), rot: 0, color: '#' + c.getHexString() })
  }
}

// ── 碰撞體 ───────────────────────────────────────────
export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number; h: number }

export const COLLIDERS: Collider[] = [
  ...HOUSES.map(
    (h): Collider => ({
      kind: 'box',
      minX: h.x - h.w / 2,
      maxX: h.x + h.w / 2,
      minZ: h.z - h.d / 2,
      maxZ: h.z + h.d / 2,
      h: h.wallH + h.roofH,
    }),
  ),
  ...TREES.map((t): Collider => ({ kind: 'circle', x: t.x, z: t.z, r: 0.34 * t.s })),
  ...ROCKS.filter((r) => r.s > 0.45).map((r): Collider => ({ kind: 'circle', x: r.x, z: r.z, r: r.s * 0.75 })),
  { kind: 'circle', x: WELL.x, z: WELL.z, r: 1.0 },
  { kind: 'circle', x: SIGN.x, z: SIGN.z, r: 0.25 },
  { kind: 'circle', x: NPC_ELDER.x, z: NPC_ELDER.z, r: 0.42 },
  { kind: 'circle', x: MERCHANT.x, z: MERCHANT.z, r: 0.42 },
  ...RUIN_PILLARS.map((p): Collider => ({ kind: 'circle', x: p.x, z: p.z, r: 0.6 })),
  ...CHESTS.map((c): Collider => ({ kind: 'circle', x: c.x, z: c.z, r: 0.5 })),
  ...CRYSTALS.filter((c) => c.s > 0.75).map((c): Collider => ({ kind: 'circle', x: c.x, z: c.z, r: 0.45 * c.s })),
  ...SHROOMS.filter((m) => m.s > 0.9).map((m): Collider => ({ kind: 'circle', x: m.x, z: m.z, r: 0.25 * m.s })),
  { kind: 'circle', x: STELE.x, z: STELE.z, r: 0.55 },
]
