// 遊戲裡的技能特效層：建立一份 VfxWorld，
// 每幀取出戰鬥模擬放進 vfxBus 的特效請求，並讓拖尾跟著有技能特效的投射物飛。
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { combat } from '../game/combat/state'
import { shake } from '../game/combat/fx'
import type { Projectile } from '../game/combat/types'
import { useGame } from '../game/store'
import { DEMO_SKILLS, isDemoSkill } from '../skills/demoSkills'
import { vfxBus } from '../vfx/bus'
import { CUES } from '../vfx/cues'
import { VfxWorld, type Tracker } from '../vfx/VfxWorld'

const PROJECTILE_Y = 0.75

/** 開發模式下給自動化測試讀取 */
export const skillVfxRef: { world: VfxWorld | null } = { world: null }

export function SkillVfx() {
  const quality = useGame((s) => s.quality)
  const { gl, scene, camera } = useThree()
  const world = useMemo(() => new VfxWorld(), [])
  const tracked = useMemo(() => new Map<Projectile, { tr: Tracker; stamp: number }>(), [])

  useEffect(() => world.setQuality(quality === 'high' ? 'high' : 'low'), [world, quality])

  useEffect(() => {
    scene.add(world.root)
    world.prewarm(gl, scene, camera)
    skillVfxRef.world = world
    return () => {
      skillVfxRef.world = null
      tracked.clear()
      world.dispose()
    }
    // 只在建立時做一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world])

  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    if (vfxBus.clearRequested) {
      vfxBus.clearRequested = false
      world.clear()
      tracked.clear()
    }
    if (g.paused) return
    // 頓幀時特效也一起變慢，和命中瞬間同步
    const dt = Math.min(dtRaw, 0.05) * (combat.hitStop > 0 ? 0.25 : 1)

    for (const r of vfxBus.queue) {
      const sk = isDemoSkill(r.skill) ? DEMO_SKILLS[r.skill] : null
      if (!sk) continue
      CUES[r.cue]?.(world, { x: r.x, y: r.y, z: r.z, facing: r.facing, p: sk.params, shake })
    }
    vfxBus.queue.length = 0

    // 投射物拖尾：新出現的開始追蹤，消失的放開（拖尾自然收掉）
    const stamp = performance.now()
    for (const p of combat.projectiles) {
      if (!p.vfx || p.delay > 0) continue
      const sk = DEMO_SKILLS[p.vfx]
      if (!sk.projectile) continue
      const entry = tracked.get(p)
      if (entry) {
        world.move(entry.tr, p.x, PROJECTILE_Y, p.z)
        entry.stamp = stamp
      } else {
        // 箭的本體由 CombatLayer 畫武器包的箭；火球的本體由特效系統畫
        const body = sk.projectile.style !== 'arrow'
        const tr = world.track(sk.projectile.style, sk.params, p.x, PROJECTILE_Y, p.z, Math.atan2(p.dirX, p.dirZ), body)
        tracked.set(p, { tr, stamp })
      }
    }
    for (const [p, e] of tracked) {
      if (e.stamp === stamp) continue
      world.untrack(e.tr)
      tracked.delete(p)
    }
    world.update(dt, camera)
  })

  return null
}
