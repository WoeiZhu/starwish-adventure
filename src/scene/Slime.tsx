// 史萊姆：用固定數量的顯示槽位，每個槽位對應戰鬥模擬中的第 N 隻怪物。
// 位置、顏色、大小、狀態都由 Unit 決定，這裡只負責外觀與動作（含精英與 Boss 的皇冠）。
import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { enemyAt, hero } from '../game/combat/state'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'

const BODY = new THREE.SphereGeometry(0.45, 24, 18)
const DOT = new THREE.SphereGeometry(1, 12, 10)
const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')

export function Slime({ slot }: { slot: number }) {
  const root = useRef<THREE.Group>(null!)
  const squash = useRef<THREE.Group>(null!)
  const crown = useRef<THREE.Group>(null!)
  const mat = useRef<THREE.MeshToonMaterial>(null!)
  const tipMat = useRef<THREE.MeshToonMaterial>(null!)
  const seed = useRef(slot * 2.37)
  const t = useRef(seed.current)
  const shown = useRef(0)

  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    if (g.paused) return
    const u = enemyAt(slot)
    const dt = Math.min(dtRaw, 0.05)

    // 死亡時縮小消失，重生或生成時再長出來
    const alive = !!u && u.alive
    shown.current += ((alive ? 1 : 0) - shown.current) * (1 - Math.exp(-dt * (alive ? 5 : 12)))
    root.current.visible = !!u && shown.current > 0.02
    if (!u || !root.current.visible) return
    root.current.position.set(u.x, 0, u.z)
    root.current.rotation.y = u.facing
    root.current.scale.setScalar(shown.current * u.scale)
    mat.current.color.set(u.color)
    tipMat.current.color.set(u.color)
    crown.current.visible = u.tier !== 'normal'

    // 移動越快跳得越勤；待機時偶爾小跳；被暈眩時壓扁不動
    const moving = Math.min(1, u.speed / 2)
    t.current += dt * (1 + moving * 2.2) * (u.stun > 0 ? 0 : 1)
    const time = t.current
    const cycle = (time * 0.42 + seed.current) % 1
    const span = 0.22 + moving * 0.5
    const hop = cycle < span ? Math.sin((cycle / span) * Math.PI) : 0
    const breathe = Math.sin(time * 2.6)
    const lunge = Math.sin(u.attackAnim * Math.PI)
    // 受擊時瞬間壓扁再彈回
    const jolt = Math.sin(u.squash * Math.PI) * 0.38
    const sy = (u.stun > 0 ? 0.72 : 1) + breathe * 0.06 + hop * 0.22 - lunge * 0.18 - jolt
    squash.current.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
    squash.current.position.y = hop * (0.3 + moving * 0.2)
    squash.current.position.z = lunge * 0.45 // 攻擊時往前撲

    // 受擊閃白；狂暴時泛紅
    const flashing = u.hitFlash > 0
    mat.current.emissive.copy(flashing ? WHITE : u.enraged ? mat.current.emissive.set('#ff3b3b') : BLACK)
    mat.current.emissiveIntensity = flashing ? 0.7 : u.enraged ? 0.35 : 0
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const g = useGame.getState()
    const u = enemyAt(slot)
    if (g.phase !== 'playing' || g.paused || g.dialog || !u?.alive || e.nativeEvent.button !== 0) return
    // 點擊怪物：鎖定並自動走到攻擊距離
    hero().targetId = u.id
    runtime.approach = true
    runtime.marker.life = 0
  }

  return (
    <group ref={root} visible={false} onClick={onClick}>
      <group ref={squash}>
        <mesh geometry={BODY} position={[0, 0.34, 0]} scale={[1, 0.8, 1]} castShadow>
          <meshToonMaterial ref={mat} />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <coneGeometry args={[0.1, 0.2, 12]} />
          <meshToonMaterial ref={tipMat} />
        </mesh>
        {/* 精英與 Boss 的皇冠 */}
        <group ref={crown} position={[0, 0.74, 0]} visible={false}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.17, 0.1, 12, 1, true]} />
            <meshToonMaterial color="#ffd23c" side={THREE.DoubleSide} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.19, 0.1, Math.sin((i / 5) * Math.PI * 2) * 0.19]}>
              <coneGeometry args={[0.045, 0.13, 6]} />
              <meshToonMaterial color="#ffd23c" />
            </mesh>
          ))}
        </group>
        <mesh geometry={DOT} position={[-0.17, 0.56, 0.24]} scale={[0.09, 0.05, 0.04]} rotation={[-0.5, -0.4, 0.4]}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
        {[-1, 1].map((sd) => (
          <group key={sd} position={[sd * 0.15, 0.36, 0.385]} rotation={[0, sd * 0.36, 0]}>
            <mesh geometry={DOT} scale={[0.05, 0.07, 0.03]}>
              <meshBasicMaterial color="#2b1b12" />
            </mesh>
            <mesh geometry={DOT} position={[-0.012, 0.025, 0.026]} scale={0.018}>
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh geometry={DOT} position={[sd * 0.1, -0.08, -0.03]} scale={[0.05, 0.028, 0.02]}>
              <meshBasicMaterial color="#ff8fa3" transparent opacity={0.6} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.27, 0.435]} rotation={[0.1, 0, Math.PI]}>
          <torusGeometry args={[0.035, 0.009, 8, 14, Math.PI]} />
          <meshBasicMaterial color="#2b1b12" />
        </mesh>
      </group>
    </group>
  )
}
