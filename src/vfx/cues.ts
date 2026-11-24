// 特效片段（cue）：時間軸上的「特效」事件用名字呼叫這裡的函式。
// 每個片段只讀參數（顏色、大小、持續時間、範圍、半徑）與位置，不碰遊戲邏輯。
import type { VfxWorld } from './VfxWorld'
import type { CueCtx } from './types'

export type CueName =
  | 'slash'
  | 'hitSpark'
  | 'charge'
  | 'muzzle'
  | 'castCircle'
  | 'areaCircle'
  | 'explosion'
  | 'healPillar'
  | 'healBurst'

const fwd = (facing: number) => [Math.sin(facing), Math.cos(facing)] as const

export const CUES: Record<CueName, (w: VfxWorld, c: CueCtx) => void> = {
  /** 斬擊：主刀光＋一道較細的殘影，刀尖甩出火花 */
  slash(w, c) {
    const { p } = c
    // 刀光畫在刀尖附近：射程含怪物體型，視覺半徑略小一點
    const reach = p.range * 0.85
    w.slash({ x: c.x, y: c.y, z: c.z, facing: c.facing, reach, color: p.color, color2: p.color2, duration: p.duration, tilt: -0.32 })
    w.slash({
      x: c.x,
      y: c.y + 0.08,
      z: c.z,
      facing: c.facing,
      reach: reach * 0.82,
      color: '#ffffff',
      color2: p.color2,
      duration: p.duration * 0.85,
      tilt: -0.22,
      opacity: 0.55,
    })
    // 弧線外緣沿切線甩出的火花
    for (let i = 0; i < w.n(9 * p.size); i++) {
      const a = c.facing + (Math.random() - 0.5) * 2.2
      const r = reach * (0.85 + Math.random() * 0.2)
      w.particle(
        {
          x: c.x + Math.sin(a) * r,
          y: c.y - 0.1 + Math.random() * 0.3,
          z: c.z + Math.cos(a) * r,
          vx: Math.cos(a) * 4,
          vy: 0.6 + Math.random(),
          vz: -Math.sin(a) * 4,
          life: 0.22 + Math.random() * 0.12,
          size: 0.07 * p.size,
          color: w.color(p.color),
          stretch: 3,
          drag: 3,
        },
        true,
      )
    }
  },

  /** 命中火花：閃光、四散的光痕、地面小衝擊波 */
  hitSpark(w, c) {
    const { p } = c
    const s = p.size
    w.flash(c.x, c.y, c.z, p.color, 0.9 * s, 0.14)
    w.flash(c.x, c.y, c.z, '#ffffff', 0.45 * s, 0.1, false)
    w.burst({ x: c.x, y: c.y, z: c.z, count: 12, speed: 6 * s, up: 3, color: '#ffffff', color2: p.color, size: 0.09 * s, life: 0.28, stretch: 3, drag: 4, add: true })
    w.burst({ x: c.x, y: c.y, z: c.z, count: 6, speed: 2.5, up: 2, gravity: 6, color: p.color, color2: p.color2, size: 0.1 * s, life: 0.45 })
    w.shockwave(c.x, 0, c.z, 0.2, 1.1 * s, p.color, 0.3, 0.1)
  },

  /** 集氣：光點往發射點收束，中心光暈慢慢變大 */
  charge(w, c) {
    const { p } = c
    const s = p.size
    const life = Math.min(0.45, p.duration * 0.6)
    w.converge(c.x, c.y, c.z, 16 * s, 0.7 * s, life, p.color, 0.08 * s)
    w.particle({ x: c.x, y: c.y, z: c.z, life, size: 0.1 * s, size1: 0.5 * s, color: w.color(p.color), alpha: 0.9 }, true)
  },

  /** 出手閃光：往前噴的小火花 */
  muzzle(w, c) {
    const { p } = c
    const s = p.size
    w.flash(c.x, c.y, c.z, p.color, 0.6 * s, 0.12)
    w.burst({ x: c.x, y: c.y, z: c.z, count: 7, speed: 5 * s, color: '#ffffff', color2: p.color, size: 0.06 * s, life: 0.2, stretch: 2.5, drag: 5, add: true, dir: c.facing, cone: 0.9 })
  },

  /** 施放者腳下的魔法陣（大小跟著 size） */
  castCircle(w, c) {
    const { p } = c
    w.circle(c.x, 0, c.z, 1.15 * p.size, p.color, p.color2, p.duration)
    w.burst({ x: c.x, y: 0.05, z: c.z, count: 12, speed: 0.3, up: 2.2, spread: 1 * p.size, color: p.color2, color2: p.color, size: 0.07, life: p.duration, drag: 0.5 })
  },

  /** 目標位置的魔法陣（半徑 = 作用半徑） */
  areaCircle(w, c) {
    const { p } = c
    w.circle(c.x, 0, c.z, p.radius, p.color, p.color2, p.duration)
  },

  /** 爆炸：閃光、衝擊波、火焰、煙、火星，加上鏡頭震動 */
  explosion(w, c) {
    const { p } = c
    const s = p.size
    const r = p.radius
    // 明亮的草地上加亮混合容易變成一片白：閃光用一般混合，只留一點加亮
    w.flash(c.x, c.y, c.z, p.color2, r * 1.1 * s, 0.2, false)
    w.particle({ x: c.x, y: c.y, z: c.z, life: 0.16, size: r * 0.4 * s, size1: r * 0.9 * s, color: w.color(p.color2), alpha: 0.5 }, true)
    w.shockwave(c.x, 0, c.z, 0.3, r, p.color, 0.42, 0.09)
    w.shockwave(c.x, 0, c.z, 0.1, r * 0.6, p.color2, 0.3, 0.16)
    // 火焰：往上翻滾、顏色從亮黃變成主色（一般混合才看得出橘色）
    w.burst({ x: c.x, y: c.y, z: c.z, count: 30 * s, speed: 3.6 * r * 0.5, up: 3.5, spread: 0.3, color: p.color2, color2: p.color, size: 0.45 * s, life: 0.55, drag: 3.5 })
    w.burst({ x: c.x, y: c.y, z: c.z, count: 10 * s, speed: 2.4 * r * 0.5, up: 2.5, spread: 0.2, color: p.color2, color2: p.color, size: 0.3 * s, life: 0.35, drag: 3.5, add: true, alpha: 0.6 })
    // 煙：慢慢變大、往上飄
    const smoke = w.color('#7d6f6a')
    for (let i = 0; i < w.n(12 * s); i++) {
      const a = Math.random() * Math.PI * 2
      const v = 0.6 + Math.random() * 1.2
      w.particle({
        x: c.x + Math.cos(a) * 0.3,
        y: c.y,
        z: c.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * v,
        vy: 0.9 + Math.random() * 0.8,
        vz: Math.sin(a) * v,
        life: 0.9 + Math.random() * 0.4,
        size: 0.35 * s,
        size1: 1.2 * s,
        color: smoke,
        alpha: 0.4,
        drag: 1.8,
      })
    }
    // 火星：有重力的拉長光點
    w.burst({ x: c.x, y: c.y, z: c.z, count: 16 * s, speed: 7 * s, up: 6, gravity: 12, color: '#fff3c4', color2: p.color, size: 0.07 * s, life: 0.7, stretch: 2, drag: 0.8, add: true })
    c.shake?.(0.22 * Math.min(1.6, s))
  },

  /** 治療光柱：光柱、上升的光點、地面光環 */
  healPillar(w, c) {
    const { p } = c
    const s = p.size
    w.pillar(c.x, c.z, 0.55 * s, 3 * s, p.color, p.color2, p.duration * 0.8)
    w.burst({ x: c.x, y: 0.1, z: c.z, count: 22 * s, speed: 0.25, up: 2.6, spread: 0.6 * s, color: p.color2, color2: p.color, size: 0.09 * s, life: p.duration * 0.9, drag: 0.4 })
    w.shockwave(c.x, 0, c.z, 0.2, p.radius, p.color, 0.5, 0.08)
  },

  /** 治療生效：閃爍的光點從身上散開 */
  healBurst(w, c) {
    const { p } = c
    const s = p.size
    w.flash(c.x, c.y, c.z, p.color, 1.1 * s, 0.25, false)
    w.burst({ x: c.x, y: c.y, z: c.z, count: 18, speed: 2.4 * s, up: 2.5, gravity: -0.5, color: '#ffffff', color2: p.color, size: 0.08 * s, life: 0.7, drag: 2, add: true })
  },
}

/** 發射點：施放者位置＋本地 offset（x 右、y 上、z 前） */
export function anchorFromCaster(x: number, z: number, facing: number, offset: readonly [number, number, number]) {
  const [fx, fz] = fwd(facing)
  // 右手方向 = 面向轉 -90°：(-cos, sin)
  const rx = -fz
  const rz = fx
  return { x: x + rx * offset[0] + fx * offset[2], y: offset[1], z: z + rz * offset[0] + fz * offset[2] }
}
