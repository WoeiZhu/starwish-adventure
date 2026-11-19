// 點地面移動：A* 網格尋路 + 視線平滑。
import { COLLIDERS, PLAY_HALF, type Vec2 } from '../data/world'

const CELL = 0.5
const N = Math.ceil((PLAY_HALF * 2) / CELL)
const CLEARANCE = 0.44 // 略大於角色半徑，避免貼牆卡住

const toCell = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + PLAY_HALF) / CELL)))
const center = (i: number) => -PLAY_HALF + (i + 0.5) * CELL

let blocked: Uint8Array | null = null
function grid() {
  if (blocked) return blocked
  blocked = new Uint8Array(N * N)
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const x = center(ix)
      const z = center(iz)
      for (const c of COLLIDERS) {
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
  if (Math.abs(x) > PLAY_HALF || Math.abs(z) > PLAY_HALF) return true
  return grid()[toCell(z) * N + toCell(x)] === 1
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
        if (x < 0 || z < 0 || x >= N || z >= N || g[z * N + x]) continue
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
  const start = nearestFree(toCell(from.x), toCell(from.z))
  const goal = nearestFree(toCell(to.x), toCell(to.z))
  if (start < 0 || goal < 0) return null
  const goalExact = !isBlockedAt(to.x, to.z)
  const end: Vec2 = goalExact ? { x: to.x, z: to.z } : { x: center(goal % N), z: center((goal / N) | 0) }
  if (lineClear(from, end)) return [end]

  const cost = new Float32Array(N * N).fill(Infinity)
  const came = new Int32Array(N * N).fill(-1)
  const closed = new Uint8Array(N * N)
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
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue
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
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push({ x: center(i % N), z: center((i / N) | 0) })
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
