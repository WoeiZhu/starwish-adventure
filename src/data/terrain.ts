// 地形與地標（第一階段：探索感）：河流與橋、北方隘口的山脊、新的步道與岔路、
// 各區地標、邊界山壁與區域入口、遠景山脈與遠方地標。
// 這個檔案只放「形狀資料」，不依賴 world.ts，避免互相引用；樹木過濾與碰撞體在 world.ts 組合。
import * as THREE from 'three'

export interface P2 {
  x: number
  z: number
}

/** 可行走範圍（與 world.ts 的 BOUNDS 相同，放這裡讓地形計算不必引用 world.ts） */
export const WALK = { minX: -37, maxX: 37, minZ: -72, maxZ: 37 }

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const v = (x: number, z: number) => new THREE.Vector3(x, 0, z)

// ── 河流：橫越地圖北段，把村子這一側與月光山谷隔開，只能走橋過去 ──
export const RIVER = {
  curve: new THREE.CatmullRomCurve3([
    v(-62, -37.4),
    v(-48, -37.6),
    v(-34, -39.6),
    v(-22, -38.4),
    v(-10, -36.9),
    v(2, -38.4),
    v(14, -37.2),
    v(26, -39.2),
    v(38, -38.6),
    v(50, -37.6),
    v(62, -38),
  ]),
  /** 水面半寬；角色碰撞也用這個 */
  hw: 1.7,
}
export const RIVER_SAMPLES: P2[] = RIVER.curve.getSpacedPoints(260).map((p) => ({ x: p.x, z: p.z }))
/** 河道中心線在某個 x 的 z 值（河是東西向）：每 0.25 公尺預先算好一張表 */
const RZ_MIN = -62
const RZ_STEP = 0.25
const RZ_TABLE: number[] = []
{
  const s = RIVER_SAMPLES
  let i = 1
  for (let x = RZ_MIN; x <= 62 + RZ_STEP; x += RZ_STEP) {
    while (i < s.length - 1 && s[i].x < x) i++
    const t = Math.max(0, Math.min(1, (x - s[i - 1].x) / (s[i].x - s[i - 1].x || 1)))
    RZ_TABLE.push(s[i - 1].z + (s[i].z - s[i - 1].z) * t)
  }
}
export function riverZ(x: number) {
  const k = Math.max(0, Math.min(RZ_TABLE.length - 1, Math.round((x - RZ_MIN) / RZ_STEP)))
  return RZ_TABLE[k]
}
export const distToRiver = (x: number, z: number) => {
  let best = Infinity
  for (const p of RIVER_SAMPLES) {
    const d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z)
    if (d < best) best = d
  }
  return Math.sqrt(best) - RIVER.hw
}

// ── 北方隘口：村子北邊一道岩石山脊，只在北路經過的地方留一個缺口 ──
export const RIDGE_Z = -27.6
export const PASS = { x: 6.1, z: RIDGE_Z, halfGap: 2.5 }
export interface Boulder {
  x: number
  z: number
  r: number
  h: number
  rot: number
  color: string
}
export const RIDGE_ROCKS: Boulder[] = []
{
  const rnd = mulberry32(777)
  const tones = ['#a9a296', '#b6ae9f', '#9c978d', '#c0b8a8']
  for (let x = -19; x <= 19.5; x += 1.55) {
    if (Math.abs(x - PASS.x) < PASS.halfGap + 1.1) continue
    // 離缺口越近越高，像兩側夾著的岩壁
    const nearPass = Math.max(0, 1 - Math.abs(x - PASS.x) / 9)
    RIDGE_ROCKS.push({
      x: x + (rnd() - 0.5) * 0.5,
      z: RIDGE_Z + (rnd() - 0.5) * 1.3 + Math.sin(x * 0.4) * 0.5,
      r: 1.3 + rnd() * 0.8,
      h: 2.2 + rnd() * 1.8 + nearPass * 2.5,
      rot: rnd() * Math.PI,
      color: tones[Math.floor(rnd() * tones.length)],
    })
  }
}
/** 隘口上方的石拱門（地標，從村子就看得到） */
export const PASS_ARCH = { x: PASS.x, z: RIDGE_Z - 0.4, span: 4.2, h: 4.6 }

// ── 新步道與岔路（舊的三條路在 world.ts） ──
export interface TrailDef {
  id: string
  points: P2[]
  width: number
}
const pts = (...a: [number, number][]) => a.map(([x, z]) => ({ x, z }))
export const TRAILS: TrailDef[] = [
  // 村子廣場往西進入迷霧森林（招募點）；在 (-23.5,-6) 分岔
  { id: 'west', width: 1.9, points: pts([-5.6, -10.4], [-12, -11.6], [-18, -9.6], [-23.5, -6], [-27.6, 0], [-27, 4.6]) },
  // 森林北岔路：經過哥布林營地、西橋，繞進山谷西側與北路會合
  {
    id: 'forest_north',
    width: 1.7,
    points: pts([-23.5, -6], [-20.6, -13], [-19.6, -23], [-22.4, -31], [-23.6, -38.3], [-22, -45], [-16, -50.6], [-9, -53.2], [-1.6, -53.4]),
  },
  // 東路往北岔向古代石環
  { id: 'ruins_spur', width: 1.8, points: pts([27, 1.6], [27.6, -3.5], [26.2, -8.5], [27, -12.4]) },
  // 石環北邊經過吊橋（捷徑）通往星晶林的西側入口
  { id: 'ruins_north', width: 1.7, points: pts([27, -25.4], [28.4, -31], [28.7, -38.8], [27, -45], [22.6, -50.2], [19.3, -55]) },
]

// ── 橋：道路與河流交會處；locked 的橋要從對岸放下（解鎖捷徑） ──
export interface BridgeDef {
  id: string
  x: number
  z: number
  /** 橋面方向（沿道路，弧度，0 = +Z） */
  rot: number
  len: number
  /** 橋面半寬 */
  hw: number
  style: 'stone' | 'wood' | 'draw'
  locked?: boolean
}
/** 找出折線與河流最接近的點，當作橋的中心 */
function crossing(points: P2[]): { x: number; z: number; rot: number } {
  const c = new THREE.CatmullRomCurve3(points.map((p) => v(p.x, p.z)))
  let best = { d: Infinity, x: 0, z: 0, rot: 0 }
  const N = 400
  for (let i = 0; i <= N; i++) {
    const p = c.getPointAt(i / N)
    const d = Math.abs(p.z - riverZ(p.x))
    if (d < best.d) {
      const t = c.getTangentAt(i / N)
      best = { d, x: p.x, z: p.z, rot: Math.atan2(t.x, t.z) }
    }
  }
  return best
}
const NORTH_ROAD_PTS = pts([3, -13], [5.2, -19], [6, -27], [3.5, -35], [1.5, -43], [-1, -51], [0, -57])
export const BRIDGES: BridgeDef[] = [
  { id: 'main_bridge', ...crossing(NORTH_ROAD_PTS), len: 6.4, hw: 1.55, style: 'stone' },
  { id: 'west_bridge', ...crossing(TRAILS[1].points), len: 6, hw: 1.2, style: 'wood' },
  { id: 'east_bridge', ...crossing(TRAILS[3].points), len: 6, hw: 1.25, style: 'draw', locked: true },
]
/** 吊橋的絞盤在北岸（山谷那一側）：從山谷過來才能放下，之後就是石環 ↔ 星晶林的捷徑 */
export const DRAW_LEVER: P2 = (() => {
  const b = BRIDGES[2]
  // 橋面方向朝北（rot 指向道路前進方向 = 往北），絞盤放在北端旁邊
  const fx = Math.sin(b.rot)
  const fz = Math.cos(b.rot)
  const sgn = fz < 0 ? 1 : -1
  return { x: b.x + fx * sgn * (b.len / 2 + 1.4) + fz * 1.6, z: b.z + fz * sgn * (b.len / 2 + 1.4) - fx * 1.6 }
})()
/** 南岸的告示牌：提醒玩家吊橋要從對岸放下 */
export const DRAW_NOTICE: P2 = (() => {
  const b = BRIDGES[2]
  const fx = Math.sin(b.rot)
  const fz = Math.cos(b.rot)
  const sgn = fz < 0 ? -1 : 1
  return { x: b.x + fx * sgn * (b.len / 2 + 1.2) - fz * 1.7, z: b.z + fz * sgn * (b.len / 2 + 1.2) + fx * 1.7 }
})()

// ── 各區地標 ──
/** 翠綠草原東側的風車 */
export const WINDMILL = { x: 32.5, z: 16.5, rot: -0.9 }
/** 迷霧森林深處的古老巨木 */
export const ELDER_TREE = { x: -32, z: -18.5 }
/** 古代石環一帶散落的斷牆與倒下的石柱 */
export interface RuinPiece {
  x: number
  z: number
  rot: number
  kind: 'wall' | 'column'
  len: number
  h: number
}
export const RUIN_PIECES: RuinPiece[] = [
  { x: 20.5, z: -24, rot: 0.4, kind: 'wall', len: 3.2, h: 1.6 },
  { x: 33.5, z: -14, rot: 1.3, kind: 'wall', len: 2.6, h: 1.2 },
  { x: 33, z: -30, rot: -0.5, kind: 'wall', len: 3.6, h: 2 },
  { x: 19.5, z: -15.5, rot: 0.9, kind: 'column', len: 3.4, h: 0.5 },
  { x: 31.5, z: -35.2, rot: 0.2, kind: 'column', len: 3, h: 0.5 },
  { x: 35, z: -21.5, rot: 2.1, kind: 'column', len: 2.6, h: 0.5 },
]
/** 村子的路燈（晚點可以做夜晚） */
export const LAMPS: P2[] = pts([-3.8, -2.6], [3.8, -2.4], [-6.6, -13.8], [6.8, -14.2], [4.2, -24.8], [8.2, -24.6])

// ── 邊界：山壁與區域入口（之後新區域從這些入口接上） ──
export interface GateDef {
  id: string
  x: number
  z: number
  rot: number
  name: string
}
/** 南方街道與東方街道的盡頭：暫時封起來的關卡，之後會接上新區域 */
export const ENTRANCES: GateDef[] = [
  { id: 'gate_south', x: 0.2, z: 36.2, rot: 0, name: '南方街道' },
  { id: 'gate_east', x: 36.2, z: 0.4, rot: Math.PI / 2, name: '東方街道' },
]
/** 點在可行走範圍外多遠（範圍內為負值） */
export function outsideWalk(x: number, z: number) {
  const dx = Math.max(WALK.minX - x, x - WALK.maxX)
  const dz = Math.max(WALK.minZ - z, z - WALK.maxZ)
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz)
}
/** 地面高度：可行走範圍內永遠是 0；範圍外慢慢隆起成丘陵，看不到地面的盡頭 */
export function groundHeight(x: number, z: number) {
  const out = outsideWalk(x, z)
  if (out < 7) return 0
  const k = Math.min(1, (out - 7) / 30)
  const n = Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06 - 0.4) * 0.5 + 0.5
  // 河流流出地圖的地方保持低窪，河看起來一路流向遠方
  const rv = Math.min(1, Math.max(0, (Math.abs(z - riverZ(x)) - 3) / 12))
  return k * k * (5 + n * 12) * rv
}
/** 邊界山壁：沿可行走範圍外側排列的岩壁，入口處留空 */
export const CLIFFS: Boulder[] = []
{
  const rnd = mulberry32(9090)
  const tones = ['#a7a6a0', '#b8b3a6', '#9d9b94', '#c4beb0']
  const push = (x: number, z: number, big: number) => {
    if (ENTRANCES.some((g) => Math.hypot(g.x - x, g.z - z) < 6.5)) return
    if (Math.abs(z - riverZ(x)) < 3.2) return // 河流出口留空，讓河看起來流向遠方
    CLIFFS.push({ x, z, r: 2.2 + rnd() * 1.6 * big, h: (4 + rnd() * 5) * big, rot: rnd() * Math.PI, color: tones[Math.floor(rnd() * tones.length)] })
  }
  const off = () => 2.6 + rnd() * 2.2
  for (let x = WALK.minX - 2; x <= WALK.maxX + 2; x += 3.4) {
    push(x, WALK.minZ - off(), 1.35) // 北：月光山谷後方的高山壁
    if (rnd() < 0.55) push(x, WALK.maxZ + off(), 0.9) // 南：斷續的岩石，中間夾著森林
  }
  for (let z = WALK.minZ; z <= WALK.maxZ; z += 3.4) {
    const big = z < -40 ? 1.2 : 0.95
    if (z < -30 || rnd() < 0.6) push(WALK.minX - off(), z, big)
    if (z < -30 || rnd() < 0.6) push(WALK.maxX + off(), z, big)
  }
}

// ── 遠景：山脈與三個遠方地標（之後可以逐步走過去探索） ──
export interface Peak {
  x: number
  z: number
  r: number
  h: number
  seed: number
  snow: boolean
}
export const WORLD_CENTER = { x: 0, z: -18 }
const VISTA_TOWER = { x: 10, z: -205 }
export const PEAKS: Peak[] = []
{
  const rnd = mulberry32(31337)
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.12
    // 北邊（a ≈ -π/2）山最高，南邊低一些
    const north = Math.max(0, -Math.sin(a))
    const d = 128 + rnd() * 40 + (i % 2) * 14
    let h = 26 + rnd() * 22 + north * 34
    // 星見塔前方留一個山口，從村子往北看得到塔
    const ta = Math.atan2(VISTA_TOWER.z - WORLD_CENTER.z, VISTA_TOWER.x - WORLD_CENTER.x)
    if (Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta))) < 0.2) h = Math.min(h, 16)
    PEAKS.push({ x: WORLD_CENTER.x + Math.cos(a) * d * 1.05, z: WORLD_CENTER.z + Math.sin(a) * d, r: 26 + rnd() * 20, h, seed: i * 97 + 13, snow: h > 52 })
  }
}
/** 北方高山上的星見塔、東方的古堡遺跡、西方的世界巨樹 */
export const VISTA = {
  tower: { ...VISTA_TOWER, base: 16, h: 24, name: '星見塔' },
  castle: { x: 170, z: -36, base: 16, name: '古堡遺跡' },
  giantTree: { x: -162, z: -2, h: 48, name: '世界巨樹' },
}
