// 點地面移動的尋路（分區）：
//   1. 每個區域各有一張自己的 A* 網格（第一次用到才建立），不再為整個世界建一張大網格。
//   2. 跨區時，先在「出口圖」上決定要經過哪些區域與出口（橋、隘口、區域交界），
//      再逐段在各區域的網格裡找路，最後用視線檢查把路徑拉直。
// 出口是自動找出的：兩個區域交界上、兩側都能走的格子連成一段，取中點當出口。
// 城鎮（星光鎮）只有一張現成的網格（navigation.json，格距 0.4 m、已含角色半徑），直接在上面做 A*。
import { TOWN_GRID } from '../data/town'
import { BOUNDS, DYNAMIC, type Vec2 } from '../data/world'
import { REGIONS, REGION_IDS, regionAt, type RegionId } from '../data/regions'
import { blockedAt } from '../world/colliderIndex'
import { inTown } from '../world/maps'

const CELL = 0.5
const CLEARANCE = 0.44 // 略大於角色半徑，避免貼牆卡住
const MARGIN = 2 // 區域網格向外多留的邊（出口點才會同時落在兩邊的網格裡）

const inBounds = (x: number, z: number) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ
/** 主線世界的座標是否不能走（直接查碰撞索引，不需要網格；不管目前在哪張地圖） */
const worldBlocked = (x: number, z: number) => !inBounds(x, z) || blockedAt(x, z, CLEARANCE)
/** 目前地圖上的座標是否不能走（主線世界查碰撞索引；城鎮查網格） */
export const isBlockedAt = (x: number, z: number) => (inTown() ? townBlocked(x, z) : worldBlocked(x, z))

// ── 區域網格 ──
interface RegionGrid {
  id: RegionId | 'town'
  cell: number
  minX: number
  minZ: number
  nx: number
  nz: number
  blocked: Uint8Array
  version: number
}

const townGrid: RegionGrid = { id: 'town', version: 0, ...TOWN_GRID }
/** 城鎮座標是否不能走（讀檔檢查位置時也會用到，不管目前在哪張地圖） */
export const isTownBlocked = (x: number, z: number) => townBlocked(x, z)
function townBlocked(x: number, z: number) {
  const ix = Math.floor((x - townGrid.minX) / townGrid.cell)
  const iz = Math.floor((z - townGrid.minZ) / townGrid.cell)
  return ix < 0 || iz < 0 || ix >= townGrid.nx || iz >= townGrid.nz || townGrid.blocked[iz * townGrid.nx + ix] === 1
}
const grids = new Map<RegionId, RegionGrid>()
export const navStats = { gridsBuilt: 0, cellsBuilt: 0, lastQueryMs: 0, lastLegs: 0 }

function regionGrid(id: RegionId): RegionGrid {
  const old = grids.get(id)
  if (old && old.version === DYNAMIC.version) return old
  const b = REGIONS[id].box
  const minX = Math.max(BOUNDS.minX, b.minX - MARGIN)
  const minZ = Math.max(BOUNDS.minZ, b.minZ - MARGIN)
  const maxX = Math.min(BOUNDS.maxX, b.maxX + MARGIN)
  const maxZ = Math.min(BOUNDS.maxZ, b.maxZ + MARGIN)
  const nx = Math.ceil((maxX - minX) / CELL)
  const nz = Math.ceil((maxZ - minZ) / CELL)
  const blocked = new Uint8Array(nx * nz)
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (worldBlocked(minX + (ix + 0.5) * CELL, minZ + (iz + 0.5) * CELL)) blocked[iz * nx + ix] = 1
    }
  }
  const g = { id, cell: CELL, minX, minZ, nx, nz, blocked, version: DYNAMIC.version }
  grids.set(id, g)
  navStats.gridsBuilt++
  navStats.cellsBuilt += nx * nz
  return g
}
const cx = (g: RegionGrid, x: number) => Math.max(0, Math.min(g.nx - 1, Math.floor((x - g.minX) / g.cell)))
const cz = (g: RegionGrid, z: number) => Math.max(0, Math.min(g.nz - 1, Math.floor((z - g.minZ) / g.cell)))
const wx = (g: RegionGrid, i: number) => g.minX + ((i % g.nx) + 0.5) * g.cell
const wz = (g: RegionGrid, i: number) => g.minZ + (((i / g.nx) | 0) + 0.5) * g.cell

/** 目標格被擋住時，找最近的可走格 */
function nearestFree(g: RegionGrid, ix: number, iz: number) {
  if (!g.blocked[iz * g.nx + ix]) return iz * g.nx + ix
  for (let r = 1; r < 24; r++) {
    let best = -1
    let bestD = Infinity
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = ix + dx
        const z = iz + dz
        if (x < 0 || z < 0 || x >= g.nx || z >= g.nz || g.blocked[z * g.nx + x]) continue
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = z * g.nx + x
        }
      }
    }
    if (best >= 0) return best
  }
  return -1
}

class MinHeap {
  private ids: number[] = []
  private keys: number[] = []
  get size() {
    return this.ids.length
  }
  push(id: number, key: number) {
    let i = this.ids.length
    this.ids.push(id)
    this.keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= key) break
      this.ids[i] = this.ids[p]
      this.keys[i] = this.keys[p]
      i = p
    }
    this.ids[i] = id
    this.keys[i] = key
  }
  pop() {
    const top = this.ids[0]
    const id = this.ids.pop()!
    const key = this.keys.pop()!
    const n = this.ids.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = i * 2 + 1
        if (c >= n) break
        if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c++
        if (this.keys[c] >= key) break
        this.ids[i] = this.ids[c]
        this.keys[i] = this.keys[c]
        i = c
      }
      this.ids[i] = id
      this.keys[i] = key
    }
    return top
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const

/** 在單一區域網格內做 A*；回傳格子中心點（不含起點），找不到回傳 null */
function gridPath(g: RegionGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const N = g.nx
  const start = nearestFree(g, cx(g, from.x), cz(g, from.z))
  const goal = nearestFree(g, cx(g, to.x), cz(g, to.z))
  if (start < 0 || goal < 0) return null
  const size = g.nx * g.nz
  const cost = new Float32Array(size).fill(Infinity)
  const came = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)
  const gx = goal % N
  const gz = (goal / N) | 0
  const h = (i: number) => {
    const dx = Math.abs((i % N) - gx)
    const dz = Math.abs(((i / N) | 0) - gz)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  const heap = new MinHeap()
  cost[start] = 0
  heap.push(start, h(start))
  let found = false
  while (heap.size) {
    const cur = heap.pop()
    if (cur === goal) {
      found = true
      break
    }
    if (closed[cur]) continue
    closed[cur] = 1
    const x0 = cur % N
    const z0 = (cur / N) | 0
    for (const [dx, dz, w] of DIRS) {
      const nx = x0 + dx
      const nz = z0 + dz
      if (nx < 0 || nz < 0 || nx >= N || nz >= g.nz) continue
      const ni = nz * N + nx
      if (g.blocked[ni] || closed[ni]) continue
      // 斜向不可切過障礙角
      if (dx && dz && (g.blocked[z0 * N + nx] || g.blocked[nz * N + x0])) continue
      const nc = cost[cur] + w
      if (nc < cost[ni]) {
        cost[ni] = nc
        came[ni] = cur
        heap.push(ni, nc + h(ni))
      }
    }
  }
  if (!found) return null
  const cells: Vec2[] = []
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push({ x: wx(g, i), z: wz(g, i) })
  cells.reverse()
  return cells
}

// ── 出口圖 ──
export interface Portal {
  a: RegionId
  b: RegionId
  x: number
  z: number
}
let portals: Portal[] = []
let portalsFor = -1
const touch = (p: RegionId, q: RegionId) => {
  const a = REGIONS[p].box
  const b = REGIONS[q].box
  return a.minX <= b.maxX + 1 && b.minX <= a.maxX + 1 && a.minZ <= b.maxZ + 1 && b.minZ <= a.maxZ + 1
}

/** 找出兩個區域交界上可以通過的地方（每段最長 6 公尺取一個點） */
function findPortals(a: RegionId, b: RegionId): Portal[] {
  const A = REGIONS[a].box
  const B = REGIONS[b].box
  const minX = Math.max(BOUNDS.minX, Math.max(A.minX, B.minX) - 2)
  const maxX = Math.min(BOUNDS.maxX, Math.min(A.maxX, B.maxX) + 2)
  const minZ = Math.max(BOUNDS.minZ, Math.max(A.minZ, B.minZ) - 2)
  const maxZ = Math.min(BOUNDS.maxZ, Math.min(A.maxZ, B.maxZ) + 2)
  const nx = Math.ceil((maxX - minX) / CELL)
  const nz = Math.ceil((maxZ - minZ) / CELL)
  const hit: [number, number][] = []
  const free = (ix: number, iz: number) => !worldBlocked(minX + (ix + 0.5) * CELL, minZ + (iz + 0.5) * CELL)
  const reg = (ix: number, iz: number) => regionAt(minX + (ix + 0.5) * CELL, minZ + (iz + 0.5) * CELL)
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (reg(ix, iz) !== a || !free(ix, iz)) continue
      const nb: [number, number][] = [
        [ix + 1, iz],
        [ix - 1, iz],
        [ix, iz + 1],
        [ix, iz - 1],
      ]
      if (nb.some(([x, z]) => x >= 0 && z >= 0 && x < nx && z < nz && reg(x, z) === b && free(x, z))) hit.push([ix, iz])
    }
  }
  // 相鄰的格子連成一段；太長的段切開，每段取最接近中點的格子
  const left = new Set(hit.map(([x, z]) => x + ',' + z))
  const out: Portal[] = []
  for (const [sx, sz] of hit) {
    if (!left.has(sx + ',' + sz)) continue
    const seg: [number, number][] = []
    const stack: [number, number][] = [[sx, sz]]
    left.delete(sx + ',' + sz)
    while (stack.length) {
      const [x, z] = stack.pop()!
      seg.push([x, z])
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = x + dx + ',' + (z + dz)
          if (left.has(k)) {
            left.delete(k)
            stack.push([x + dx, z + dz])
          }
        }
    }
    seg.sort((p, q) => p[0] - q[0] || p[1] - q[1])
    const pieces = Math.max(1, Math.round((seg.length * CELL) / 6))
    for (let k = 0; k < pieces; k++) {
      const [ix, iz] = seg[Math.floor(((k + 0.5) / pieces) * seg.length)]
      out.push({ a, b, x: minX + (ix + 0.5) * CELL, z: minZ + (iz + 0.5) * CELL })
    }
  }
  return out
}

/** 所有區域出口（第一次用到或碰撞改變時才重新計算） */
export function allPortals(): Portal[] {
  if (portalsFor === DYNAMIC.version) return portals
  portalsFor = DYNAMIC.version
  portals = []
  for (let i = 0; i < REGION_IDS.length; i++)
    for (let j = i + 1; j < REGION_IDS.length; j++) {
      const a = REGION_IDS[i]
      const b = REGION_IDS[j]
      if (touch(a, b)) portals.push(...findPortals(a, b))
    }
  return portals
}

type Node = Vec2 & { id: number }
/**
 * 在出口圖上找經過哪些出口：節點 = 起點、終點、各出口；
 * 同一區域內的兩點之間用直線距離估計成本。blockedEdges 是實際找不到路的路段，重試時避開。
 */
function routeRegions(from: Vec2, to: Vec2, ra: RegionId, rb: RegionId, blockedEdges: Set<string>): { pts: Node[]; regs: RegionId[] } | null {
  const ps = allPortals()
  // 節點 0 = 起點，1 = 終點，2.. = 出口
  const nodes: { x: number; z: number; regs: RegionId[] }[] = [
    { ...from, regs: [ra] },
    { ...to, regs: [rb] },
    ...ps.map((p) => ({ x: p.x, z: p.z, regs: [p.a, p.b] })),
  ]
  const dist = new Array<number>(nodes.length).fill(Infinity)
  const prev = new Array<number>(nodes.length).fill(-1)
  const via = new Array<RegionId | null>(nodes.length).fill(null)
  const done = new Uint8Array(nodes.length)
  dist[0] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || u === 1) break
    done[u] = 1
    for (let v = 1; v < nodes.length; v++) {
      if (done[v] || v === u) continue
      const shared = nodes[u].regs.find((r) => nodes[v].regs.includes(r))
      if (!shared || blockedEdges.has(`${u}-${v}`)) continue
      const d = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z)
      if (d < dist[v]) {
        dist[v] = d
        prev[v] = u
        via[v] = shared
      }
    }
  }
  if (dist[1] === Infinity) return null
  const chain: number[] = []
  for (let i = 1; i !== -1; i = prev[i]) chain.push(i)
  chain.reverse()
  return {
    pts: chain.map((i) => ({ x: nodes[i].x, z: nodes[i].z, id: i })),
    regs: chain.slice(1).map((i) => via[i]!),
  }
}

function lineClear(a: Vec2, b: Vec2) {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.ceil(d / 0.2)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (isBlockedAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

/** 回傳從 from 到 to 的路徑點（不含起點）；無路可走時回傳 null */
export function findPath(from: Vec2, to: Vec2): Vec2[] | null {
  const t0 = performance.now()
  const res = findPathInner(from, to)
  navStats.lastQueryMs = Math.round((performance.now() - t0) * 10) / 10
  return res
}

function findPathInner(from: Vec2, to: Vec2): Vec2[] | null {
  const end: Vec2 = isBlockedAt(to.x, to.z) ? nearestWalkable(to) : { x: to.x, z: to.z }
  if (lineClear(from, end)) return [end]

  let cells: Vec2[] | null = null
  // 城鎮：單張網格
  if (inTown()) {
    cells = gridPath(townGrid, from, end)
    navStats.lastLegs = 1
    return cells ? smooth(from, cells, end) : null
  }
  const ra = regionAt(from.x, from.z)
  const rb = regionAt(end.x, end.z)
  if (ra === rb) {
    cells = gridPath(regionGrid(ra), from, end)
    navStats.lastLegs = 1
  }
  if (!cells) {
    // 跨區（或同區但被隔開）：在出口圖上找路線，再逐段找路；某段走不通就避開那段重試
    const blockedEdges = new Set<string>()
    for (let attempt = 0; attempt < 8 && !cells; attempt++) {
      const route = routeRegions(from, end, ra, rb, blockedEdges)
      if (!route) return null
      const out: Vec2[] = []
      let ok = true
      for (let i = 0; i < route.regs.length; i++) {
        const a = route.pts[i]
        const b = route.pts[i + 1]
        const leg = gridPath(regionGrid(route.regs[i]), a, b)
        if (!leg) {
          blockedEdges.add(`${a.id}-${b.id}`)
          ok = false
          break
        }
        out.push(...leg, { x: b.x, z: b.z })
      }
      if (ok) {
        cells = out
        navStats.lastLegs = route.regs.length
      }
    }
  }
  if (!cells) return null
  return smooth(from, cells, end)
}

/** 視線平滑：能直走就略過中間點（一次最多往前看 60 點，長路徑也不會太慢） */
function smooth(from: Vec2, cells: Vec2[], end: Vec2): Vec2[] {
  if (cells.length) cells[cells.length - 1] = end
  else cells.push(end)
  const out: Vec2[] = []
  let anchor = from
  let i = 0
  while (i < cells.length) {
    let j = Math.min(cells.length - 1, i + 60)
    while (j > i && !lineClear(anchor, cells[j])) j--
    out.push(cells[j])
    anchor = cells[j]
    i = j + 1
  }
  return out
}

/** 目前地圖上最近的可走位置 */
export function nearestWalkable(p: Vec2): Vec2 {
  if (!inTown()) return nearestWalkableOverworld(p)
  if (!townBlocked(p.x, p.z)) return { x: p.x, z: p.z }
  const i = nearestFree(townGrid, cx(townGrid, p.x), cz(townGrid, p.z))
  return i < 0 ? { x: p.x, z: p.z } : { x: wx(townGrid, i), z: wz(townGrid, i) }
}

/** 主線世界上最近的可走位置（讀檔時位置剛好落在新地形裡會用到；不管目前在哪張地圖） */
export function nearestWalkableOverworld(p: Vec2): Vec2 {
  if (!worldBlocked(p.x, p.z)) return { x: p.x, z: p.z }
  const g = regionGrid(regionAt(p.x, p.z))
  const i = nearestFree(g, cx(g, p.x), cz(g, p.z))
  return i < 0 ? { x: p.x, z: p.z } : { x: wx(g, i), z: wz(g, i) }
}
