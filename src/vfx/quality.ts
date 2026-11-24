// 畫質預算：桌機用 high，手機（省電模式）用 low。
// 粒子緩衝區一開始就配到最大，切換畫質只改「最多同時幾個」，不必重建。
export type VfxQuality = 'high' | 'low'

export interface VfxBudget {
  /** 一般混合粒子（煙、光點）與加亮粒子（火花、火焰、閃光）的同時上限 */
  alphaParticles: number
  addParticles: number
  /** 每次噴發的粒子數量倍率 */
  spawnScale: number
  /** 拖尾的點數（越多越平滑） */
  trailPoints: number
  slashes: number
  trails: number
  circles: number
  rings: number
  pillars: number
  orbs: number
  models: number
}

export const BUDGETS: Record<VfxQuality, VfxBudget> = {
  high: {
    alphaParticles: 1600,
    addParticles: 1000,
    spawnScale: 1,
    trailPoints: 24,
    slashes: 16,
    trails: 32,
    circles: 12,
    rings: 24,
    pillars: 8,
    orbs: 24,
    models: 32,
  },
  low: {
    alphaParticles: 600,
    addParticles: 360,
    spawnScale: 0.5,
    trailPoints: 12,
    slashes: 8,
    trails: 16,
    circles: 6,
    rings: 12,
    pillars: 4,
    orbs: 12,
    models: 16,
  },
}

export const MAX_ALPHA_PARTICLES = BUDGETS.high.alphaParticles
export const MAX_ADD_PARTICLES = BUDGETS.high.addParticles
export const MAX_TRAIL_POINTS = BUDGETS.high.trailPoints
