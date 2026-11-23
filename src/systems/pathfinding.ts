// 點地面移動：A* 網格尋路 + 視線平滑。
import { BOUNDS, COLLIDERS, DYNAMIC, type Vec2 } from '../data/world'

const CELL = 0.5
// 網格：X 方向 NX 格、Z 方向 NZ 格（地圖往北延伸後不再是正方形）
const NX = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL)
const NZ = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL)
const N = NX
const CLEARANCE = 0.44 // 略大於角色半徑，避免貼牆卡住

const toCellX = (v: number) => Math.max(0, Math.min(NX - 1, Math.floor((v - BOUNDS.minX) / CELL)))
const toCellZ = (v: number) => Math.max(0, Math.min(NZ - 1, Math.floor((v - BOUNDS.minZ) / CELL)))
const centerX = (i: number) => BOUNDS.minX + (i + 0.5) * CELL
const centerZ = (i: number) => BOUNDS.minZ + (i + 0.5) * CELL

let blocked: Uint8Array | null = null
let builtFor = -1
function grid() {
  if (blocked && builtFor === DYNAMIC.version) return blocked
  builtFor = DYNAMIC.version
  blocked = new Uint8Array(NX * NZ)
  const list = [...COLLIDERS, ...DYNAMIC.list]
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      const x = centerX(ix)
      const z = centerZ(iz)
      for (const c of list) {
        const hit =
          c.kind === 'circle'
            ? Math.hypot(x - c.x, z - c.z) < c.r + CLEARANCE
            : x > c.minX - CLEARANCE && x < c.maxX + CLEARANCE && z > c.minZ - CLEARANCE && z < c.maxZ + CLEARANCE
        if (hit) {
          blocked[iz * N + ix] = 1
          break
        }
      }
    }
  }
  return blocked
}

function isBlockedAt(x: number, z: number) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true
  return grid()[toCellZ(z) * N + toCellX(x)] === 1
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

/** 目標格被擋住時，找最近的可走格 */
function nearestFree(ix: number, iz: number) {
  const g = grid()
  if (!g[iz * N + ix]) return iz * N + ix
  for (let r = 1; r < 24; r++) {
    let best = -1
    let bestD = Infinity
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = ix + dx
        const z = iz + dz
        if (x < 0 || z < 0 || x >= NX || z >= NZ || g[z * N + x]) continue
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = z * N + x
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

/** 回傳從 from 到 to 的路徑點（不含起點）；無路可走時回傳 null */
export function findPath(from: Vec2, to: Vec2): Vec2[] | null {
  const g = grid()
  const start = nearestFree(toCellX(from.x), toCellZ(from.z))
  const goal = nearestFree(toCellX(to.x), toCellZ(to.z))
  if (start < 0 || goal < 0) return null
  const goalExact = !isBlockedAt(to.x, to.z)
  const end: Vec2 = goalExact ? { x: to.x, z: to.z } : { x: centerX(goal % N), z: centerZ((goal / N) | 0) }
  if (lineClear(from, end)) return [end]

  const cost = new Float32Array(NX * NZ).fill(Infinity)
  const came = new Int32Array(NX * NZ).fill(-1)
  const closed = new Uint8Array(NX * NZ)
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
    const cx = cur % N
    const cz = (cur / N) | 0
    for (const [dx, dz, w] of DIRS) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue
      const ni = nz * N + nx
      if (g[ni] || closed[ni]) continue
      // 斜向不可切過障礙角
      if (dx && dz && (g[cz * N + nx] || g[nz * N + cx])) continue
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
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push({ x: centerX(i % N), z: centerZ((i / N) | 0) })
  cells.reverse()
  if (cells.length) cells[cells.length - 1] = end
  else cells.push(end)

  // 視線平滑：能直走就略過中間格
  const out: Vec2[] = []
  let anchor = from
  let i = 0
  while (i < cells.length) {
    let j = cells.length - 1
    while (j > i && !lineClear(anchor, cells[j])) j--
    out.push(cells[j])
    anchor = cells[j]
    i = j + 1
  }
  return out
}

/** 最近的可走位置（讀檔時位置剛好落在新地形裡會用到） */
export function nearestWalkable(p: Vec2): Vec2 {
  if (!isBlockedAt(p.x, p.z)) return { x: p.x, z: p.z }
  const i = nearestFree(toCellX(p.x), toCellZ(p.z))
  return i < 0 ? { x: p.x, z: p.z } : { x: centerX(i % N), z: centerZ((i / N) | 0) }
}
