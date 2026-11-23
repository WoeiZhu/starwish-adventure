// 主線世界場景：依區域配色的地面、道路、草、花、樹、石頭、房屋、水井、路牌，
// 加上第一階段的地形地標（Landmarks）與遠景（Vista）。
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { WORLD_CENTER, groundHeight } from '../data/terrain'
import {
  BORDER_TREES,
  CRYSTALS,
  FERNS,
  GROVE,
  SHROOMS,
  SPRING,
  RUINS,
  RUIN_PILLARS,
  FLOWERS,
  GRASS,
  HOUSES,
  PLAZA,
  ROADS,
  ROCKS,
  SIGN,
  TREES,
  WELL,
  type HouseDef,
  type Tuft,
} from '../data/world'
import { findPath } from '../systems/pathfinding'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { Landmarks } from './Landmarks'
import { buildGround, buildRibbon, roadColor } from './terrainMeshes'
import { Vista } from './Vista'

const ROAD_COLOR = '#efdcae'

function handleGroundClick(e: ThreeEvent<MouseEvent>) {
  if (e.nativeEvent.button !== 0 || e.delta > 6) return
  // 手機剛拖曳或雙指縮放鏡頭：放開手指不算點地面
  if (performance.now() - runtime.gestureAt < 250) return
  const s = useGame.getState()
  if (s.phase !== 'playing' || s.paused || s.dialog) return
  const path = findPath(runtime.player, { x: e.point.x, z: e.point.z })
  if (!path) return
  runtime.path = path
  runtime.approach = false
  runtime.queuedSkill = null
  const end = path[path.length - 1]
  runtime.marker.x = end.x
  runtime.marker.z = end.z
  runtime.marker.life = 1
}

/** 地面：一整片依區域配色的網格；可行走範圍外慢慢隆起成丘陵，看不到地面的盡頭 */
function Ground() {
  const geo = useMemo(() => buildGround(WORLD_CENTER.x - 210, WORLD_CENTER.z - 210, 420, 3), [])
  return (
    <mesh geometry={geo} receiveShadow onClick={handleGroundClick}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

/** 道路：每條路有較寬的路肩當外框，顏色依所在區域（村子石板、森林泥土、山谷月白石） */
function Roads() {
  const geos = useMemo(
    () =>
      ROADS.map((road) => {
        const pts = road.curve.getSpacedPoints(Math.ceil(road.curve.getLength() / 0.7)).map((p) => ({ x: p.x, z: p.z }))
        return {
          edge: buildRibbon(pts, road.width + 0.55, 0.022, roadColor(true)),
          top: buildRibbon(pts, road.width, 0.03, roadColor(false)),
        }
      }),
    [],
  )
  return (
    <>
      {geos.map((g, i) => (
        <group key={i} position={[0, i * 0.002, 0]}>
          <mesh geometry={g.edge} receiveShadow>
            <meshLambertMaterial vertexColors />
          </mesh>
          <mesh geometry={g.top} receiveShadow>
            <meshLambertMaterial vertexColors />
          </mesh>
        </group>
      ))}
      <mesh position={[PLAZA.x, 0.026, PLAZA.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[PLAZA.r + 0.3, 40]} />
        <meshLambertMaterial color="#c9b88d" />
      </mesh>
      <mesh position={[PLAZA.x, 0.034, PLAZA.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[PLAZA.r, 40]} />
        <meshLambertMaterial color={ROAD_COLOR} />
      </mesh>
    </>
  )
}

interface InstancedProps {
  items: Tuft[]
  geometry: THREE.BufferGeometry
  /** 依 Tuft 回傳 [y 位置, x/z 縮放, y 縮放] */
  shape: (t: Tuft) => [number, number, number]
  castShadow?: boolean
  flat?: boolean
}
function Instanced({ items, geometry, shape, castShadow, flat }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const c = new THREE.Color()
    items.forEach((t, i) => {
      const [y, sxz, sy] = shape(t)
      m.position.set(t.x, y, t.z)
      m.rotation.set(0, t.rot, 0)
      m.scale.set(sxz, sy, sxz)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
      ref.current.setColorAt(i, c.set(t.color))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items, shape])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow={castShadow} receiveShadow={!castShadow}>
      <meshLambertMaterial flatShading={flat} />
    </instancedMesh>
  )
}

const GRASS_GEO = new THREE.ConeGeometry(0.06, 0.24, 4)
const FLOWER_GEO = new THREE.SphereGeometry(0.07, 8, 6)
const ROCK_GEO = new THREE.DodecahedronGeometry(1, 0)
const PINE_GEO = new THREE.ConeGeometry(1.6, 5, 7)
const grassShape = (t: Tuft): [number, number, number] => [0.12 * t.s, t.s, t.s]
const flowerShape = (t: Tuft): [number, number, number] => [0.1, t.s, t.s * 0.7]
const pineShape = (t: Tuft): [number, number, number] => [groundHeight(t.x, t.z) + 2.5 * t.s - 0.3, t.s, t.s]
const FERN_GEO = new THREE.ConeGeometry(0.42, 0.55, 5)
const fernShape = (t: Tuft): [number, number, number] => [0.2 * t.s, t.s * 1.1, t.s * 0.75]
const ROCK_ITEMS: Tuft[] = ROCKS.map((r, i) => ({ ...r, color: i % 2 ? '#b7bcc4' : '#a3a9b3' }))
const rockShape = (t: Tuft): [number, number, number] => [t.s * 0.45, t.s, t.s * 0.7]

// 樹木共用的幾何與樹幹材質（樹冠材質每棵一份，才能各自淡出）
const TRUNK = new THREE.CylinderGeometry(0.17, 0.26, 1.6, 8)
const BIRCH_TRUNK = new THREE.CylinderGeometry(0.12, 0.17, 2.6, 8)
const CROWN = new THREE.SphereGeometry(1, 14, 10)
const PINE_TIER = new THREE.ConeGeometry(1, 1, 8)
const BARK = new THREE.MeshLambertMaterial({ color: '#9a6b45' })
const BIRCH_BARK = new THREE.MeshLambertMaterial({ color: '#f1ece2' })

/** 樹：擋在相機與主角之間時樹冠淡出，避免遮住角色 */
function Trees() {
  const mats = useMemo(
    () => TREES.map((t) => new THREE.MeshLambertMaterial({ color: t.color, flatShading: t.kind !== 'round' })),
    [],
  )
  useFrame(({ camera }, dt) => {
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    const px = runtime.player.x
    const pz = runtime.player.z
    const sx = px - cx
    const sz = pz - cz
    const len2 = sx * sx + sz * sz || 1
    const k = 1 - Math.exp(-dt * 8)
    TREES.forEach((t, i) => {
      const u = ((t.x - cx) * sx + (t.z - cz) * sz) / len2
      let target = 1
      if (u > 0.02 && u < 1.05) {
        const d = Math.hypot(cx + sx * u - t.x, cz + sz * u - t.z)
        const rayY = cy + (0.8 - cy) * u
        if (d < 1.5 * t.s && rayY < 4.6 * t.s) target = 0.18
      }
      const m = mats[i]
      m.opacity += (target - m.opacity) * k
      const transparent = m.opacity < 0.98
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.needsUpdate = true
      }
    })
  })
  return (
    <>
      {TREES.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} rotation={[0, t.rot, 0]} scale={t.s}>
          <mesh geometry={t.kind === 'birch' ? BIRCH_TRUNK : TRUNK} material={t.kind === 'birch' ? BIRCH_BARK : BARK} position={[0, t.kind === 'birch' ? 1.3 : 0.8, 0]} castShadow />
          {t.kind === 'round' ? (
            <>
              <mesh geometry={CROWN} position={[0, 2.3, 0]} scale={1.15} material={mats[i]} castShadow />
              <mesh geometry={CROWN} position={[0.6, 2.95, 0.2]} scale={0.8} material={mats[i]} castShadow />
              <mesh geometry={CROWN} position={[-0.55, 2.8, -0.25]} scale={0.75} material={mats[i]} castShadow />
            </>
          ) : t.kind === 'birch' ? (
            <>
              <mesh geometry={CROWN} position={[0, 3, 0]} scale={[0.95, 1.25, 0.95]} material={mats[i]} castShadow />
              <mesh geometry={CROWN} position={[0.35, 3.9, 0.1]} scale={[0.6, 0.8, 0.6]} material={mats[i]} castShadow />
            </>
          ) : (
            <>
              <mesh geometry={PINE_TIER} position={[0, 2, 0]} scale={[1.25, 1.9, 1.25]} material={mats[i]} castShadow />
              <mesh geometry={PINE_TIER} position={[0, 3, 0]} scale={[0.95, 1.7, 0.95]} material={mats[i]} castShadow />
              <mesh geometry={PINE_TIER} position={[0, 3.9, 0]} scale={[0.62, 1.4, 0.62]} material={mats[i]} castShadow />
            </>
          )}
        </group>
      ))}
    </>
  )
}

function House({ h }: { h: HouseDef }) {
  const roof = useMemo(() => {
    const o = 0.35
    const shape = new THREE.Shape()
    shape.moveTo(-h.w / 2 - o, 0)
    shape.lineTo(h.w / 2 + o, 0)
    shape.lineTo(0, h.roofH)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: h.d + o * 2, bevelEnabled: false })
  }, [h])
  const front = h.d / 2
  return (
    <group position={[h.x, 0, h.z]}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[h.w + 0.16, 0.3, h.d + 0.16]} />
        <meshLambertMaterial color="#b9b2a6" />
      </mesh>
      <mesh position={[0, h.wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[h.w, h.wallH, h.d]} />
        <meshLambertMaterial color={h.wall} />
      </mesh>
      <mesh geometry={roof} position={[0, h.wallH, -h.d / 2 - 0.35]} castShadow>
        <meshLambertMaterial color={h.roof} />
      </mesh>
      {/* 門 */}
      <mesh position={[0, 0.85, front + 0.02]}>
        <boxGeometry args={[0.95, 1.7, 0.08]} />
        <meshLambertMaterial color="#8a5a3c" />
      </mesh>
      <mesh position={[0.3, 0.85, front + 0.08]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshLambertMaterial color="#f4d35e" />
      </mesh>
      {/* 窗 */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (h.w / 2 - 0.95), 1.45, front + 0.02]}>
          <mesh>
            <boxGeometry args={[0.95, 0.85, 0.06]} />
            <meshLambertMaterial color="#8a5a3c" />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.78, 0.68, 0.06]} />
            <meshLambertMaterial color="#bfe9ff" emissive="#7fc8f0" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, -0.52, 0.12]}>
            <boxGeometry args={[1, 0.16, 0.24]} />
            <meshLambertMaterial color="#ff9eb5" />
          </mesh>
        </group>
      ))}
      {/* 煙囪 */}
      <mesh position={[h.w / 4, h.wallH + h.roofH * 0.75, -h.d / 5]} castShadow>
        <boxGeometry args={[0.5, 1.1, 0.5]} />
        <meshLambertMaterial color="#c98f6b" />
      </mesh>
    </group>
  )
}

function Well() {
  return (
    <group position={[WELL.x, 0, WELL.z]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.9, 0.8, 16]} />
        <meshLambertMaterial color="#b9b2a6" flatShading />
      </mesh>
      <mesh position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.68, 16]} />
        <meshLambertMaterial color="#5ab6e8" />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * 0.75, 1.2, 0]} castShadow>
          <boxGeometry args={[0.12, 1.7, 0.12]} />
          <meshLambertMaterial color="#8a5a3c" />
        </mesh>
      ))}
      <mesh position={[0, 2.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.25, 0.7, 4]} />
        <meshLambertMaterial color="#e8735a" />
      </mesh>
    </group>
  )
}

function Signpost() {
  return (
    <group position={[SIGN.x, 0, SIGN.z]} rotation={[0, -0.3, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.1, 1.2, 0.1]} />
        <meshLambertMaterial color="#8a5a3c" />
      </mesh>
      <mesh position={[0.12, 1.05, 0.04]} castShadow>
        <boxGeometry args={[0.8, 0.3, 0.06]} />
        <meshLambertMaterial color="#d9a066" />
      </mesh>
      <mesh position={[-0.1, 0.72, 0.04]} castShadow>
        <boxGeometry args={[0.7, 0.26, 0.06]} />
        <meshLambertMaterial color="#c98f5a" />
      </mesh>
    </group>
  )
}

/** 迷霧森林：一層低矮、緩慢飄動的霧氣（地面顏色由區域配色決定） */
function Forest() {
  const mist = useRef<THREE.Group>(null!)
  useFrame((state) => {
    mist.current.children.forEach((m, i) => {
      m.position.x = -34 + ((i * 5.3 + state.clock.elapsedTime * 0.35 * (1 + (i % 3) * 0.4)) % 16)
    })
  })
  return (
    <>
      <group ref={mist}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[-30, 0.5 + (i % 3) * 0.25, -34 + i * 8.5]} scale={[6, 0.5, 3.5]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color="#e8f6ef" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/** 古代石環：石板地面與八根石柱（祭壇本身是可互動物件） */
function Ruins() {
  return (
    <group>
      <mesh position={[RUINS.x, 0.035, RUINS.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[RUINS.r + 1.6, 32]} />
        <meshLambertMaterial color="#cfc8ba" />
      </mesh>
      <mesh position={[RUINS.x, 0.045, RUINS.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RUINS.r - 1.4, RUINS.r - 1.1, 48]} />
        <meshLambertMaterial color="#a89fd0" />
      </mesh>
      {RUIN_PILLARS.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, i % 3 === 0 ? 0.6 : 1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.42, 0.52, i % 3 === 0 ? 1.2 : 2, 8]} />
            <meshLambertMaterial color="#b9b2a6" flatShading />
          </mesh>
          <mesh position={[0, i % 3 === 0 ? 1.3 : 2.1, 0]} castShadow>
            <boxGeometry args={[1.1, 0.28, 1.1]} />
            <meshLambertMaterial color="#a39c90" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const GEM_GEO = new THREE.OctahedronGeometry(1, 0).scale(0.38, 1.25, 0.38)
const STEM_GEO = new THREE.CylinderGeometry(0.16, 0.24, 1, 10)
const CAP_GEO = new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1)

/** 月光山谷：發光星晶、大蘑菇、星晶林地面、月泉（地面的藍綠色由區域配色決定） */
function Valley() {
  const spring = useRef<THREE.Mesh>(null!)
  const orbs = useRef<THREE.Group>(null!)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    ;(spring.current.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.55 + Math.sin(t * 1.6) * 0.12
    // 月泉上方漂浮的光點
    orbs.current.children.forEach((o, i) => {
      const a = t * 0.35 + i * 1.7
      o.position.set(Math.cos(a) * (2 + (i % 3)), 0.7 + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * (2 + (i % 3)))
    })
  })
  return (
    <group>
      {CRYSTALS.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]} scale={c.s}>
          <mesh geometry={GEM_GEO} position={[0, 1.1, 0]} castShadow>
            <meshLambertMaterial color={c.color} emissive={c.color} emissiveIntensity={0.55} flatShading />
          </mesh>
          <mesh geometry={GEM_GEO} position={[0.45, 0.6, 0.1]} rotation={[0, 0, -0.5]} scale={0.55} castShadow>
            <meshLambertMaterial color={c.color} emissive={c.color} emissiveIntensity={0.5} flatShading />
          </mesh>
          <mesh geometry={GEM_GEO} position={[-0.35, 0.5, -0.2]} rotation={[0.3, 0, 0.6]} scale={0.45}>
            <meshLambertMaterial color={c.color} emissive={c.color} emissiveIntensity={0.5} flatShading />
          </mesh>
        </group>
      ))}
      {SHROOMS.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]} rotation={[0, m.rot, 0]} scale={m.s}>
          <mesh geometry={STEM_GEO} position={[0, 0.5, 0]} castShadow>
            <meshLambertMaterial color="#f4ead8" />
          </mesh>
          <mesh geometry={CAP_GEO} position={[0, 0.95, 0]} castShadow>
            <meshLambertMaterial color={m.color} emissive={m.color} emissiveIntensity={0.18} />
          </mesh>
        </group>
      ))}
      {/* 星晶林：淡紫色石地 */}
      <mesh position={[GROVE.x, 0.03, GROVE.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[GROVE.r + 1, 32]} />
        <meshLambertMaterial color="#b8b4d8" />
      </mesh>
      {/* 月泉：石砌泉邊、發光的泉水、漂浮的光點 */}
      <group position={[SPRING.x, 0, SPRING.z]}>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[SPRING.r + 1.6, 40]} />
          <meshLambertMaterial color="#cfd6d0" />
        </mesh>
        <mesh ref={spring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[SPRING.r - 0.4, 40]} />
          <meshLambertMaterial color="#8fdcff" emissive="#6fc8ff" emissiveIntensity={0.55} transparent opacity={0.85} />
        </mesh>
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * (SPRING.r + 0.5), 0.18, Math.sin(a) * (SPRING.r + 0.5)]}
              rotation={[0, a, 0]}
              scale={[0.55, 0.3, 0.4]}
              castShadow
            >
              <dodecahedronGeometry args={[1, 0]} />
              <meshLambertMaterial color="#a9b3ad" flatShading />
            </mesh>
          )
        })}
        <group ref={orbs}>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i}>
              <sphereGeometry args={[0.09, 8, 6]} />
              <meshBasicMaterial color="#e6fbff" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

/** 天上的雲（山丘改由地面起伏與遠景山脈取代） */
function Backdrop() {
  const clouds = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return { x: Math.cos(a) * (60 + (i % 3) * 14), y: 24 + (i % 4) * 4, z: -18 + Math.sin(a) * (75 + (i % 2) * 18) }
      }),
    [],
  )
  return (
    <>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          {[
            [0, 0, 0, 5],
            [5, -0.6, 1, 3.6],
            [-5, -0.8, -1, 3.8],
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} scale={[r, r * 0.55, r * 0.8]}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color="#ffffff" fog={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

export function World() {
  return (
    <>
      <Ground />
      <Roads />
      <Instanced items={GRASS} geometry={GRASS_GEO} shape={grassShape} />
      <Instanced items={FLOWERS} geometry={FLOWER_GEO} shape={flowerShape} />
      <Instanced items={ROCK_ITEMS} geometry={ROCK_GEO} shape={rockShape} castShadow flat />
      <Instanced items={BORDER_TREES} geometry={PINE_GEO} shape={pineShape} flat />
      <Instanced items={FERNS} geometry={FERN_GEO} shape={fernShape} flat />
      <Trees />
      {HOUSES.map((h, i) => (
        <House key={i} h={h} />
      ))}
      <Well />
      <Signpost />
      <Forest />
      <Ruins />
      <Valley />
      <Landmarks />
      <Backdrop />
      <Vista />
    </>
  )
}
