// 主線世界場景（分區塊串流）：
//   - 遠景地面（低解析度、永遠存在）＋各區塊的細節地面、道路、草木（Chunks.tsx，依距離載入／卸載）
//   - 建築與地標用 InChunk 包起來：所在區塊載入時才畫
//   - 雲永遠存在；天空、遠景山脈與遠方地標（Vista）放在 GameScene，主線世界與城鎮共用
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { WORLD_CENTER, groundHeight } from '../data/terrain'
import { GROVE, SPRING, RUINS, RUIN_PILLARS, HOUSES, PLAZA, SIGN, WELL, type HouseDef } from '../data/world'
import { Landmarks } from './Landmarks'
import { LAYOUT } from '../data/town'
import { TownShell } from './town2/TownMaps'
import { InChunk, StreamedWorld } from './Chunks'
import { handleGroundClick } from './groundClick'
import { buildGround } from './terrainMeshes'

const ROAD_COLOR = '#efdcae'

/** 遠景地面：整個世界一張低解析度網格（每 6 公尺一格），略低於區塊地面；區塊還沒載入的地方由它補上 */
function FarGround() {
  const geo = useMemo(() => {
    const g = buildGround(WORLD_CENTER.x - 210, WORLD_CENTER.z - 210, 420, 6)
    // 往下沉一點：可行走範圍內沉 5 公分，丘陵沉多一點，避免從細節地面下方穿出來
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) - 0.05 - Math.min(0.6, groundHeight(pos.getX(i), pos.getZ(i)) * 0.1))
    g.computeVertexNormals()
    return g
  }, [])
  // 進城時整個主線世界會卸下：自己建的網格要自己釋放
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} receiveShadow onClick={handleGroundClick}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

/** 村子廣場（石板地＋路肩） */
function Plaza() {
  return (
    <>
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
  // 區塊卸載或進城時房子會卸下：屋頂網格是自己建的，要自己釋放
  useEffect(() => () => roof.dispose(), [roof])
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

/** 星晶林：淡紫色石地（星晶本身在區塊裡） */
function GroveFloor() {
  return (
    <mesh position={[GROVE.x, 0.03, GROVE.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[GROVE.r + 1, 32]} />
      <meshLambertMaterial color="#b8b4d8" />
    </mesh>
  )
}

/** 月泉：石砌泉邊、發光的泉水、漂浮的光點 */
function Spring() {
  const spring = useRef<THREE.Mesh>(null!)
  const orbs = useRef<THREE.Group>(null!)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    ;(spring.current.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.55 + Math.sin(t * 1.6) * 0.12
    orbs.current.children.forEach((o, i) => {
      const a = t * 0.35 + i * 1.7
      o.position.set(Math.cos(a) * (2 + (i % 3)), 0.7 + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * (2 + (i % 3)))
    })
  })
  return (
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
          <mesh key={i} position={[Math.cos(a) * (SPRING.r + 0.5), 0.18, Math.sin(a) * (SPRING.r + 0.5)]} rotation={[0, a, 0]} scale={[0.55, 0.3, 0.4]} castShadow>
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
      <FarGround />
      {/* 新版城鎮：南方街道盡頭的城牆、塔、城門與屋頂（不分區塊，遠遠就看得到） */}
      {LAYOUT && <TownShell />}
      <StreamedWorld onGroundClick={handleGroundClick}>
        <InChunk {...PLAZA}>
          <Plaza />
        </InChunk>
        {HOUSES.map((h, i) => (
          <InChunk key={i} x={h.x} z={h.z}>
            <House h={h} />
          </InChunk>
        ))}
        <InChunk {...WELL}>
          <Well />
        </InChunk>
        <InChunk {...SIGN}>
          <Signpost />
        </InChunk>
        <InChunk x={-27} z={0}>
          <Forest />
        </InChunk>
        <InChunk {...RUINS}>
          <Ruins />
        </InChunk>
        <InChunk {...GROVE}>
          <GroveFloor />
        </InChunk>
        <InChunk {...SPRING}>
          <Spring />
        </InChunk>
        <Landmarks />
      </StreamedWorld>
      <Backdrop />
    </>
  )
}
