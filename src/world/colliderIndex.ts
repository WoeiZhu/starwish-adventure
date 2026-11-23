// 碰撞體空間索引：把固定碰撞體放進 4 公尺的格子，查詢時只看附近幾格。
// 會隨進度改變的碰撞（吊橋）數量很少，另外整份檢查。
import { COLLIDERS, DYNAMIC, type Collider } from '../data/world'

const CELL = 4
const buckets = new Map<number, Collider[]>()
const key = (ix: number, iz: number) => ix * 100003 + iz

function bounds(c: Collider) {
  return c.kind === 'circle'
    ? { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r }
    : { minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ }
}

for (const c of COLLIDERS) {
  const b = bounds(c)
  for (let ix = Math.floor(b.minX / CELL); ix <= Math.floor(b.maxX / CELL); ix++) {
    for (let iz = Math.floor(b.minZ / CELL); iz <= Math.floor(b.maxZ / CELL); iz++) {
      const k = key(ix, iz)
      let list = buckets.get(k)
      if (!list) buckets.set(k, (list = []))
      list.push(c)
    }
  }
}

const seen = new Set<Collider>()
/** 對 (x, z) 周圍 r 公尺內可能碰到的碰撞體執行 fn；fn 回傳 true 會提前結束 */
export function forColliders(x: number, z: number, r: number, fn: (c: Collider) => boolean | void) {
  seen.clear()
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      const list = buckets.get(key(ix, iz))
      if (!list) continue
      for (const c of list) {
        if (seen.has(c)) continue
        seen.add(c)
        if (fn(c)) return true
      }
    }
  }
  for (const c of DYNAMIC.list) if (fn(c)) return true
  return false
}

/** 點 (x, z) 加上 pad 之後是否碰到任何碰撞體 */
export function blockedAt(x: number, z: number, pad: number) {
  return forColliders(x, z, pad + 0.1, (c) =>
    c.kind === 'circle'
      ? (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < (c.r + pad) * (c.r + pad)
      : x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad,
  )
}
