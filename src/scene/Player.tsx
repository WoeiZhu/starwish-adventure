// 主角控制：WASD 自由移動（優先）、點擊路徑跟隨、接近鎖定目標、閃避翻滾、碰撞與動畫。
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { buildAppearance } from '../data/appearance'
import { CLASSES } from '../data/classes'
import { SPAWN } from '../data/world'
import { dist, hero, unitById } from '../game/combat/state'
import { weaponTint } from '../game/gear'
import { PLAYER_RADIUS, RUN_SPEED, WALK_SPEED, runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { resolveCollisions } from '../systems/collision'
import { sfx } from '../systems/sfx'
import { moveAxis } from '../systems/input'
import { findPath } from '../systems/pathfinding'
import { areaReady, isPriming } from '../world/stream'
import { CharacterModel } from './characters/CharacterModel'
import type { CharacterMotion } from './characters/types'

const DODGE_TIME = 0.26
const DODGE_SPEED = 14
const DODGE_CD = 1.4
const DODGE_INVULN = 0.45

function dampAngle(a: number, b: number, k: number, dt: number) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + diff * (1 - Math.exp(-k * dt))
}

export function Player() {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const motion = useRef<CharacterMotion>({ speed: 0, attack: 0 })
  const stuck = useRef(0)
  const repath = useRef(0)
  const gender = useGame((s) => s.hero.gender)
  const classId = useGame((s) => s.hero.classId)
  const gearVersion = useGame((s) => s.gearVersion)
  // 武器外觀跟著裝備品質變色（gearVersion 在換裝時遞增）
  const appearance = useMemo(
    () => buildAppearance(gender, classId, weaponTint(classId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gender, classId, gearVersion],
  )

  useFrame((state, dtRaw) => {
    const s = useGame.getState()
    const p = runtime.player
    const dt = Math.min(dtRaw, 0.05)

    if (s.phase === 'title') {
      // 角色創建畫面：原地展示並緩慢左右轉身
      p.x = SPAWN.x
      p.z = SPAWN.z
      p.facing = 0.2 + Math.sin(state.clock.elapsedTime * 0.7) * 0.55
      motion.current.speed = 0
      motion.current.attack = 0
      group.current.position.set(p.x, 0, p.z)
      group.current.rotation.y = p.facing
      body.current.rotation.x = 0
      body.current.position.y = 0
      return
    }
    if (s.paused) return
    // 讀檔／開局：主角所在區域的區塊還沒準備好之前，先不出現、不能移動
    const loading = isPriming()
    group.current.visible = !loading
    if (loading) return

    const h = hero()
    const dodge = runtime.dodge
    dodge.cd = Math.max(0, dodge.cd - dt)

    let vx = 0
    let vz = 0
    let want = 0
    let following = false
    const canAct = h.alive && !s.dialog && h.stun <= 0
    const axis = moveAxis()
    const manual = canAct && (axis.x !== 0 || axis.y !== 0)
    let mx = 0
    let mz = 0
    if (manual) {
      const yaw = runtime.cam.yaw
      mx = -Math.sin(yaw) * axis.y + Math.cos(yaw) * axis.x
      mz = -Math.cos(yaw) * axis.y - Math.sin(yaw) * axis.x
      const len = Math.hypot(mx, mz)
      mx /= len
      mz /= len
    }

    // 閃避：朝移動方向（沒按方向鍵就朝面向）快速翻滾，期間無敵
    if (dodge.request) {
      dodge.request = false
      if (canAct && dodge.cd <= 0 && dodge.time <= 0) {
        dodge.time = DODGE_TIME
        dodge.cd = DODGE_CD
        dodge.dx = manual ? mx : Math.sin(p.facing)
        dodge.dz = manual ? mz : Math.cos(p.facing)
        h.invuln = DODGE_INVULN
        sfx.dodge()
        runtime.path = null
        runtime.approach = false
      }
    }

    if (dodge.time > 0) {
      dodge.time -= dt
      want = DODGE_SPEED
      vx = dodge.dx * want
      vz = dodge.dz * want
    } else if (manual) {
      // 手動輸入優先：取消點擊自動移動與自動接近
      runtime.path = null
      runtime.approach = false
      runtime.queuedSkill = null
      runtime.marker.life = Math.min(runtime.marker.life, 0.25)
      want = axis.run ? RUN_SPEED : WALK_SPEED
      vx = mx * want
      vz = mz * want
    } else if (canAct) {
      // 點擊怪物後自動走到攻擊距離內
      if (runtime.approach) {
        const t = unitById(h.targetId)
        const reach = runtime.queuedSkill !== null ? Math.min(h.range, CLASSES[classId].skills[runtime.queuedSkill].range) : h.range
        if (!t || !t.alive) runtime.approach = false
        else if (dist(h, t) - t.radius > reach * 0.85) {
          repath.current -= dt
          if (repath.current <= 0 || !runtime.path) {
            runtime.path = findPath(p, t)
            repath.current = 0.4
          }
        } else {
          runtime.path = null
          runtime.approach = false
        }
      }
      const path = runtime.path
      if (path) {
        while (path.length && Math.hypot(path[0].x - p.x, path[0].z - p.z) < 0.14) path.shift()
        if (!path.length) {
          runtime.path = null
        } else {
          following = true
          let remain = Math.hypot(path[0].x - p.x, path[0].z - p.z)
          const d = remain
          for (let i = 1; i < path.length; i++) remain += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
          want = runtime.approach
            ? RUN_SPEED
            : Math.min(remain > 7 ? RUN_SPEED : WALK_SPEED, Math.max(1.4, remain * 5))
          vx = ((path[0].x - p.x) / d) * want
          vz = ((path[0].z - p.z) / d) * want
        }
      }
    } else {
      runtime.path = null
    }

    const ox = p.x
    const oz = p.z
    if (want > 0) {
      p.x += vx * dt
      p.z += vz * dt
      resolveCollisions(p, PLAYER_RADIUS)
      // 前方區塊還沒建好（正常走路不會發生，保險用）：停在原地，不會走進空白地形
      if (!areaReady(p.x, p.z, 4)) {
        p.x = ox
        p.z = oz
      }
      p.facing = dampAngle(p.facing, Math.atan2(vx, vz), 14, dt)
    }
    const actual = Math.min(want, Math.hypot(p.x - ox, p.z - oz) / dt)
    p.speed = actual
    motion.current.speed += (Math.min(actual, RUN_SPEED) - motion.current.speed) * (1 - Math.exp(-dt * 14))
    motion.current.attack = h.attackAnim

    // 自動移動被擋住太久就放棄，避免原地踏步
    if (following && actual < want * 0.3) {
      stuck.current += dt
      if (stuck.current > 0.6) runtime.path = null
    } else stuck.current = 0
    if (!runtime.path) runtime.marker.life = Math.min(runtime.marker.life, 0.25)

    group.current.position.set(p.x, 0, p.z)
    group.current.rotation.y = p.facing

    // 閃避時身體前撲；倒下時躺平
    const b = body.current
    if (!h.alive) {
      b.rotation.x = dampAngle(b.rotation.x, -Math.PI / 2, 10, dt)
      b.position.y = 0.25
    } else if (dodge.time > 0) {
      b.rotation.x = Math.sin((1 - dodge.time / DODGE_TIME) * Math.PI) * 0.9
      b.position.y = 0
    } else {
      b.rotation.x = 0
      b.position.y = 0
    }
    // 出招時近戰往前踏、遠程略為後座
    b.position.z = h.alive ? Math.sin(h.attackAnim * Math.PI) * (h.ranged ? -0.1 : 0.35) : 0
  })

  return (
    <group ref={group} position={[SPAWN.x, 0, SPAWN.z]}>
      <group ref={body}>
        <CharacterModel appearance={appearance} motion={motion} />
      </group>
    </group>
  )
}

/** 點擊移動的目的地標記 */
export function MoveMarker() {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state, dt) => {
    const m = runtime.marker
    if (m.life < 0.26 && m.life > 0) m.life = Math.max(0, m.life - dt)
    ref.current.visible = m.life > 0
    if (!ref.current.visible) return
    ref.current.position.set(m.x, 0.06, m.z)
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 7) * 0.12
    ref.current.scale.setScalar(pulse)
    mat.current.opacity = Math.min(1, m.life * 4) * 0.85
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.28, 0.4, 32]} />
      <meshBasicMaterial ref={mat} color="#fff3a3" transparent depthWrite={false} />
    </mesh>
  )
}
