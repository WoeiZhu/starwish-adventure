// 可互動物件：村長、商人、待招募夥伴、寶箱、祭壇。靠近顯示提示，按 F 或點擊互動。
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MERCHANT_APPEARANCE, NPC_ELDER_APPEARANCE, buildAppearance } from '../data/appearance'
import { LOOT_URLS } from '../data/lootModels'
import { CHESTS, regionAt, type ChestDef } from '../data/world'
import { hero } from '../game/combat/state'
import { progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { interactWith, interactables, type Interactable } from '../game/story'
import { isTouch } from '../systems/mobile'
import { findPath } from '../systems/pathfinding'
import { inTown } from '../world/maps'
import { isLoaded } from '../world/stream'
import { CharacterModel } from './characters/CharacterModel'
import { ChestModel, type ChestState } from './ChestModel'
import { LoadBoundary } from './ErrorBoundary'
import { prepareProp, withMeshopt } from './gltf'

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

/** 月光石碑：長滿青苔的石板，刻文在發光 */
function Stele({ active }: { active: boolean }) {
  const rune = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state) => {
    rune.current.opacity = (active ? 0.75 : 0.45) + Math.sin(state.clock.elapsedTime * 2.2) * 0.2
  })
  return (
    <group>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.24, 0.9]} />
        <meshLambertMaterial color="#9aa39c" flatShading />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[1.05, 1.7, 0.3]} />
        <meshLambertMaterial color="#b6bdb4" flatShading />
      </mesh>
      <mesh position={[0, 1.95, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.74, 0.74, 0.3]} />
        <meshLambertMaterial color="#b6bdb4" flatShading />
      </mesh>
      {/* 青苔 */}
      <mesh position={[-0.32, 0.4, 0.17]} scale={[0.45, 0.3, 0.08]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshLambertMaterial color="#6fae6a" />
      </mesh>
      <mesh position={[0, 1.15, 0.16]}>
        <planeGeometry args={[0.7, 1.1]} />
        <meshBasicMaterial ref={rune} color="#bfe9ff" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

/** 星晶簇：中央懸浮的大星晶，任務進行中會發亮 */
function GroveCore({ active }: { active: boolean }) {
  const gem = useRef<THREE.Group>(null!)
  useFrame((state) => {
    gem.current.position.y = 1.6 + Math.sin(state.clock.elapsedTime * 1.4) * 0.12
    gem.current.rotation.y = state.clock.elapsedTime * 0.6
  })
  return (
    <group ref={gem} position={[0, 1.6, 0]}>
      <mesh scale={[0.5, 1.2, 0.5]}>
        <octahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color="#9fe0ff" emissive="#8fd8ff" emissiveIntensity={active ? 0.9 : 0.4} flatShading transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/** 月泉中央：任務進行中浮現一枚月形光球 */
function SpringOrb({ active }: { active: boolean }) {
  const orb = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    orb.current.visible = active
    orb.current.position.y = 1.1 + Math.sin(state.clock.elapsedTime * 2) * 0.1
  })
  return (
    <mesh ref={orb} position={[0, 1.1, 0]}>
      <sphereGeometry args={[0.3, 16, 12]} />
      <meshBasicMaterial color="#e8f6ff" />
    </mesh>
  )
}

/** 吊橋絞盤：木架上一個可以轉的輪子 */
function Lever() {
  return (
    <group>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.55, 0]} castShadow>
          <boxGeometry args={[0.14, 1.1, 0.14]} />
          <meshLambertMaterial color="#7d5532" />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.95, 10]} />
        <meshLambertMaterial color="#a8743f" />
      </mesh>
      <mesh position={[0.52, 0.85, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.32, 0.05, 6, 14]} />
        <meshLambertMaterial color="#5d5a63" />
      </mesh>
    </group>
  )
}

/** 告示牌 */
function Notice() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.1, 1.2, 0.1]} />
        <meshLambertMaterial color="#7d5532" />
      </mesh>
      <mesh position={[0, 1.15, 0.05]} castShadow>
        <boxGeometry args={[0.9, 0.55, 0.06]} />
        <meshLambertMaterial color="#e6c58f" />
      </mesh>
    </group>
  )
}

/** 城鎮建築的門口：地上一圈淡淡發光的門墊（建築沒有室內，在這裡互動） */
function DoorMat() {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state) => {
    mat.current.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 2.4) * 0.12
  })
  return (
    <group>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.68, 32]} />
        <meshBasicMaterial ref={mat} color="#ffe9a8" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* 點擊用的隱形範圍 */}
      <mesh position={[0, 0.6, 0]} visible={false}>
        <cylinderGeometry args={[0.7, 0.7, 1.2, 10]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

const POTION_SHELF = [
  { url: LOOT_URLS.potion, x: -0.17 },
  { url: LOOT_URLS.potionBlue, x: 0.01 },
  { url: LOOT_URLS.potionGreen, x: 0.19 },
]

function PotionBottles() {
  const gltfs = useLoader(
    GLTFLoader,
    POTION_SHELF.map((p) => p.url),
    withMeshopt,
  )
  const bottles = useMemo(() => gltfs.map((g) => prepareProp(g.scene).clone(true)), [gltfs])
  return (
    <>
      {bottles.map((b, i) => (
        <primitive key={i} object={b} position={[POTION_SHELF[i].x, 0.5, 0.02]} rotation={[0, (i - 1) * 0.35, 0]} scale={0.85} />
      ))}
    </>
  )
}

/** 商人旁邊的木箱，上面擺著紅、藍、綠三瓶藥水（擺設；藥水店只賣生命藥水） */
function PotionCrate() {
  return (
    <group position={[0.95, 0, -0.25]} rotation={[0, -0.35, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.5, 0.42]} />
        <meshToonMaterial color="#b07a46" />
      </mesh>
      <mesh position={[0, 0.25, 0.212]}>
        <boxGeometry args={[0.64, 0.08, 0.01]} />
        <meshToonMaterial color="#7d5532" />
      </mesh>
      <LoadBoundary>
        <Suspense fallback={null}>
          <PotionBottles />
        </Suspense>
      </LoadBoundary>
    </group>
  )
}

/** 有擺藥水箱的商人：村子的商人、城裡的雜貨商人 */
const POTION_SELLERS = new Set(['merchant', 'town-npc-general-vendor'])

const MARKER_Y: Partial<Record<Interactable['kind'], number>> = { altar: 2.2, stele: 2.7, grove: 3.2, spring: 1.9, lever: 1.6, notice: 1.8 }

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
    // 太遠就先走過去（門口直接走到門墊上）
    const path = findPath(runtime.player, it.kind === 'door' ? { x: it.x, z: it.z } : { x: it.x, z: it.z + 1.3 })
    if (path) {
      runtime.path = path
      runtime.approach = false
      // 點 NPC 就是要走過去：取消先前鎖定的怪物與排隊的技能，一次點擊就走，不會被附近的戰鬥拉回去
      runtime.queuedSkill = null
      hero().targetId = null
    }
  }

  return (
    <group position={[it.x, 0, it.z]} onClick={onClick}>
      <group ref={root} rotation={[0, it.facing, 0]}>
        {person && <CharacterModel appearance={appearance} />}
        {it.kind === 'chest' && <ChestModel state="closed" fallback={<Chest />} />}
        {it.kind === 'altar' && <Altar active={it.marker} />}
        {it.kind === 'stele' && <Stele active={it.marker} />}
        {it.kind === 'grove' && <GroveCore active={it.marker} />}
        {it.kind === 'spring' && <SpringOrb active={it.marker} />}
        {it.kind === 'lever' && <Lever />}
        {it.kind === 'notice' && <Notice />}
        {it.kind === 'door' && <DoorMat />}
      </group>
      {POTION_SELLERS.has(it.id) && (
        <group rotation={[0, it.facing, 0]}>
          <PotionCrate />
        </group>
      )}
      {it.marker && <Marker y={MARKER_Y[it.kind] ?? 1.9} />}
    </group>
  )
}

interface OpenedChest {
  def: ChestDef
  state: ChestState
}

/** 打開過的寶箱留在原地（碰撞也還在），不能再互動 */
function OpenedChestItem({ c }: { c: OpenedChest }) {
  return (
    <group position={[c.def.x, 0, c.def.z]} rotation={[0, c.def.rot, 0]}>
      <ChestModel state={c.state} />
    </group>
  )
}

export function Interactables() {
  const [list, setList] = useState<Interactable[]>(() => interactables())
  const [opened, setOpened] = useState<OpenedChest[]>([])
  const signature = useRef('')
  const openedSig = useRef('')
  const timer = useRef(0)

  useFrame((_, dt) => {
    const g = useGame.getState()
    // 物件清單每 0.2 秒檢查一次（招募、開寶箱、任務推進後會變）
    timer.current -= dt
    if (timer.current <= 0) {
      timer.current = 0.2
      // 只畫所在區塊已載入的物件（互動判斷仍用完整清單）；城鎮不分區塊
      const town = inTown()
      const next = interactables().filter((i) => town || isLoaded(i.x, i.z))
      const sig = next.map((i) => i.id + (i.marker ? '!' : '')).join('|')
      if (sig !== signature.current) {
        signature.current = sig
        setList(next)
      }
      // 打開過的寶箱：剛在旁邊打開的播放開箱動作，其他（讀檔、走回來）直接是打開的樣子
      const done = town ? [] : CHESTS.filter((c) => progress.story.chests.includes(c.id) && isLoaded(c.x, c.z))
      const osig = done.map((c) => c.id).join('|')
      if (osig !== openedSig.current) {
        openedSig.current = osig
        setOpened((prev) =>
          done.map((def) => ({
            def,
            state:
              prev.find((p) => p.def.id === def.id)?.state ??
              (Math.hypot(runtime.player.x - def.x, runtime.player.z - def.z) < 5 ? 'opening' : 'open'),
          })),
        )
      }
    }
    if (g.phase !== 'playing' || g.paused) return
    const { x, z } = runtime.player
    if (!inTown()) g.setRegion(regionAt(x, z))

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
    // 手機上提示會變成可以點的互動按鈕，所以不寫「按 F」
    g.setHint(best && !g.dialog ? `${isTouch ? '' : '按 F '}${best.verb}「${best.name}」` : null)
  })

  return (
    <>
      {list.map((it) => (
        <Item key={it.id} it={it} />
      ))}
      {opened.map((c) => (
        <OpenedChestItem key={c.def.id} c={c} />
      ))}
    </>
  )
}
