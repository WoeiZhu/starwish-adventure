// 可互動物件：村長、商人、待招募夥伴、寶箱、祭壇。靠近顯示提示，按 F 或點擊互動。
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { MERCHANT_APPEARANCE, NPC_ELDER_APPEARANCE, buildAppearance } from '../data/appearance'
import { regionAt } from '../data/world'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { interactWith, interactables, type Interactable } from '../game/story'
import { findPath } from '../systems/pathfinding'
import { CharacterModel } from './characters/CharacterModel'

const TALK_RANGE = 2.6

function Marker({ y }: { y: number }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame((state) => {
    ref.current.position.y = y + Math.sin(state.clock.elapsedTime * 3) * 0.06
    ref.current.rotation.y = state.clock.elapsedTime * 1.5
  })
  return (
    <group ref={ref} position={[0, y, 0]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.055, 0.03, 0.26, 10]} />
        <meshBasicMaterial color="#ffc93c" />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshBasicMaterial color="#ffc93c" />
      </mesh>
    </group>
  )
}

function Chest() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.55]} />
        <meshToonMaterial color="#a8703f" />
      </mesh>
      <mesh position={[0, 0.56, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.8, 14, 1, false, 0, Math.PI]} />
        <meshToonMaterial color="#c98a4b" />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]}>
          <boxGeometry args={[0.08, 0.76, 0.58]} />
          <meshToonMaterial color="#f2c14e" />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0.29]}>
        <boxGeometry args={[0.14, 0.18, 0.05]} />
        <meshToonMaterial color="#f2c14e" emissive="#f2c14e" emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

function Altar({ active }: { active: boolean }) {
  const gem = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    gem.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 2) * 0.08
    gem.current.rotation.y = state.clock.elapsedTime
  })
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1.15, 0.4, 8]} />
        <meshLambertMaterial color="#b9b2a6" flatShading />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.6, 0.5, 8]} />
        <meshLambertMaterial color="#a39c90" flatShading />
      </mesh>
      <mesh ref={gem} position={[0, 1.35, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshToonMaterial
          color={active ? '#b06bff' : '#8a94a6'}
          emissive={active ? '#b06bff' : '#000000'}
          emissiveIntensity={active ? 0.8 : 0}
        />
      </mesh>
    </group>
  )
}

function Item({ it }: { it: Interactable }) {
  const root = useRef<THREE.Group>(null!)
  const appearance = useMemo(
    () =>
      it.kind === 'companion'
        ? buildAppearance('girl', it.classId!)
        : it.kind === 'merchant'
          ? MERCHANT_APPEARANCE
          : NPC_ELDER_APPEARANCE,
    [it.kind, it.classId],
  )
  const person = it.kind === 'elder' || it.kind === 'merchant' || it.kind === 'companion'

  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    if (!person || g.phase !== 'playing' || g.paused) return
    // 玩家靠近時轉過來面對玩家
    const dx = runtime.player.x - it.x
    const dz = runtime.player.z - it.z
    const want = Math.hypot(dx, dz) < TALK_RANGE + 1.5 ? Math.atan2(dx, dz) : it.facing
    const cur = root.current.rotation.y
    root.current.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * (1 - Math.exp(-Math.min(dtRaw, 0.05) * 5))
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const g = useGame.getState()
    if (g.phase !== 'playing' || g.paused || g.dialog || e.nativeEvent.button !== 0) return
    if (Math.hypot(runtime.player.x - it.x, runtime.player.z - it.z) < TALK_RANGE) return interactWith(it.id)
    // 太遠就先走過去
    const path = findPath(runtime.player, { x: it.x, z: it.z + 1.3 })
    if (path) {
      runtime.path = path
      runtime.approach = false
    }
  }

  return (
    <group position={[it.x, 0, it.z]} onClick={onClick}>
      <group ref={root} rotation={[0, it.facing, 0]}>
        {person && <CharacterModel appearance={appearance} />}
        {it.kind === 'chest' && <Chest />}
        {it.kind === 'altar' && <Altar active={it.marker} />}
      </group>
      {it.marker && <Marker y={it.kind === 'altar' ? 2.2 : 1.9} />}
    </group>
  )
}

export function Interactables() {
  const [list, setList] = useState<Interactable[]>(() => interactables())
  const signature = useRef('')
  const timer = useRef(0)

  useFrame((_, dt) => {
    const g = useGame.getState()
    // 物件清單每 0.2 秒檢查一次（招募、開寶箱、任務推進後會變）
    timer.current -= dt
    if (timer.current <= 0) {
      timer.current = 0.2
      const next = interactables()
      const sig = next.map((i) => i.id + (i.marker ? '!' : '')).join('|')
      if (sig !== signature.current) {
        signature.current = sig
        setList(next)
      }
    }
    if (g.phase !== 'playing' || g.paused) return
    const { x, z } = runtime.player
    g.setRegion(regionAt(x, z))

    let best: Interactable | null = null
    let bestD = TALK_RANGE
    for (const it of list) {
      const d = Math.hypot(x - it.x, z - it.z)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    runtime.nearId = best ? best.id : null
    g.setHint(best && !g.dialog ? `按 F ${best.verb}「${best.name}」` : null)
  })

  return (
    <>
      {list.map((it) => (
        <Item key={it.id} it={it} />
      ))}
    </>
  )
}
