// MVP 地圖「星光村外草原」：以固定亂數種子產生，確保每次載入佈局一致。
import * as THREE from 'three'

export interface Vec2 {
  x: number
  z: number
}

export const PLAY_HALF = 37 // 玩家可行走範圍（±）
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
export type RegionId = 'village' | 'meadow' | 'forest' | 'ruins'
export const REGION_NAME: Record<RegionId, string> = {
  village: '星光村',
  meadow: '翠綠草原',
  forest: '迷霧森林',
  ruins: '古代石環',
}
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
]
/** 這些範圍內不長樹與石頭 */
const CLEARINGS: { x: number; z: number; r: number }[] = [
  { ...RUINS, r: RUINS.r + 3 },
  { ...EVENT_SPOTS.meadow, r: 5 },
  { ...EVENT_SPOTS.forest, r: 5.5 },
  { ...EVENT_SPOTS.ruins, r: 3 },
  { ...MERCHANT, r: 2.5 },
  ...CHESTS.map((c) => ({ x: c.x, z: c.z, r: 2.6 })),
]
const inClearing = (x: number, z: number) => CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)

export function regionAt(x: number, z: number): RegionId {
  if (Math.hypot(x - RUINS.x, z - RUINS.z) < RUINS.r + 5) return 'ruins'
  if (x < FOREST_EDGE) return 'forest'
  if (z < -2 && Math.abs(x) < 17) return 'village'
  return 'meadow'
}

// ── 史萊姆 ───────────────────────────────────────────
export interface SlimeDef {
  id: string
  x: number
  z: number
  color: string
  name: string
  level: number
}
export const SLIMES: SlimeDef[] = [
  { id: 's1', x: 6.5, z: 12, color: '#7ed957', name: '草原史萊姆', level: 1 },
  { id: 's2', x: -7.5, z: 16, color: '#6ec3f4', name: '水藍史萊姆', level: 2 },
  { id: 's3', x: 10.5, z: 22, color: '#ff9ec4', name: '蜜桃史萊姆', level: 3 },
  { id: 's4', x: -12.5, z: 8, color: '#7ed957', name: '草原史萊姆', level: 1 },
  { id: 's5', x: 4.5, z: 28, color: '#6ec3f4', name: '水藍史萊姆', level: 2 },
]

function inHouseArea(x: number, z: number, pad: number) {
  return HOUSES.some((h) => Math.abs(x - h.x) < h.w / 2 + pad && Math.abs(z - h.z) < h.d / 2 + pad)
}
function nearPoints(x: number, z: number, pts: Vec2[], r: number) {
  return pts.some((p) => Math.hypot(x - p.x, z - p.z) < r)
}
const KEEP_CLEAR: Vec2[] = [SPAWN, WELL, SIGN, NPC_ELDER, ...SLIMES]

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

// ── 遠景（邊界森林與山丘，純裝飾） ──────────────────
export const BORDER_TREES: Tuft[] = []
{
  const c = new THREE.Color()
  for (let i = 0; i < 260; i++) {
    const a = rand(0, Math.PI * 2)
    const r = rand(43, 62)
    c.setHSL(rand(0.3, 0.38), rand(0.4, 0.5), rand(0.3, 0.42))
    BORDER_TREES.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: rand(1.1, 2.2), rot: 0, color: '#' + c.getHexString() })
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
]
