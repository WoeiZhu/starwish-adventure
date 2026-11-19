// 人物與相機的碰撞處理（圓形 / 軸對齊方塊）。
import { COLLIDERS, PLAY_HALF, type Vec2 } from '../data/world'

/** 把圓形角色推出所有障礙物，並限制在可行走範圍內 */
export function resolveCollisions(p: Vec2, radius: number) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of COLLIDERS) {
      if (c.kind === 'circle') {
        let dx = p.x - c.x
        let dz = p.z - c.z
        let d = Math.hypot(dx, dz)
        const min = radius + c.r
        if (d >= min) continue
        if (d < 1e-4) {
          dx = 1
          dz = 0
          d = 1
        }
        p.x = c.x + (dx / d) * min
        p.z = c.z + (dz / d) * min
      } else {
        const cx = Math.max(c.minX, Math.min(c.maxX, p.x))
        const cz = Math.max(c.minZ, Math.min(c.maxZ, p.z))
        const dx = p.x - cx
        const dz = p.z - cz
        const d = Math.hypot(dx, dz)
        if (d >= radius) continue
        if (d < 1e-4) {
          // 已在方塊內：沿最近的邊推出
          const l = p.x - c.minX
          const r = c.maxX - p.x
          const n = p.z - c.minZ
          const f = c.maxZ - p.z
          const m = Math.min(l, r, n, f)
          if (m === l) p.x = c.minX - radius
          else if (m === r) p.x = c.maxX + radius
          else if (m === n) p.z = c.minZ - radius
          else p.z = c.maxZ + radius
        } else {
          p.x = cx + (dx / d) * radius
          p.z = cz + (dz / d) * radius
        }
      }
    }
  }
  p.x = Math.max(-PLAY_HALF, Math.min(PLAY_HALF, p.x))
  p.z = Math.max(-PLAY_HALF, Math.min(PLAY_HALF, p.z))
}

/**
 * 相機防穿模：從注視點沿 (dx,dy,dz) 方向前進，回傳碰到房屋前可用的最大距離。
 * 樹木不在此處理（由樹冠淡出處理遮蔽）。
 */
export function cameraClearDistance(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
) {
  const pad = 0.45
  const steps = 40
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * maxDist
    const x = ox + dx * t
    const y = oy + dy * t
    const z = oz + dz * t
    for (const c of COLLIDERS) {
      if (c.kind !== 'box') continue
      if (y < c.h + pad && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
        return Math.max(0.9, t - maxDist / steps)
      }
    }
  }
  return maxDist
}
