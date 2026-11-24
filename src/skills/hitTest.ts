// 命中判定（純函式）：只看位置、面向與範圍，不管特效也不算傷害。遊戲和測試頁共用。
export interface Body {
  x: number
  z: number
  radius: number
}

/** 目標在不在前方扇形內（距離算到目標的邊緣） */
export function inArc(ox: number, oz: number, facing: number, b: Body, range: number, arcDeg: number) {
  const dx = b.x - ox
  const dz = b.z - oz
  const d = Math.hypot(dx, dz)
  if (d - b.radius > range) return false
  if (d < 1e-4) return true
  let da = Math.atan2(dx, dz) - facing
  da = Math.atan2(Math.sin(da), Math.cos(da))
  // 很近的目標放寬角度（貼身時方向容易抖動）
  const half = (arcDeg * Math.PI) / 360 + Math.atan2(b.radius, d)
  return Math.abs(da) <= half
}

/** 扇形內的目標，由近到遠，最多 max 個；prefer 會排在最前面（鎖定的目標） */
export function arcTargets<T extends Body>(list: readonly T[], ox: number, oz: number, facing: number, range: number, arcDeg: number, max = Infinity, prefer?: T) {
  const hit = list.filter((b) => inArc(ox, oz, facing, b, range, arcDeg))
  hit.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : Math.hypot(a.x - ox, a.z - oz) - Math.hypot(b.x - ox, b.z - oz)))
  return hit.slice(0, max)
}

/** 圓形範圍內的目標（爆炸波及） */
export function radiusTargets<T extends Body>(list: readonly T[], x: number, z: number, radius: number) {
  return list.filter((b) => Math.hypot(b.x - x, b.z - z) - b.radius <= radius)
}

/** 投射物這一步會不會碰到目標 */
export function reaches(px: number, pz: number, step: number, b: Body) {
  return Math.hypot(b.x - px, b.z - pz) <= step + b.radius
}
