// 第一階段的地形與地標：河流與三座橋（含可放下的吊橋）、北方隘口的山脊與石拱門、
// 草原風車、森林巨木、石環斷牆、村子路燈、邊界山壁與封閉的區域入口。
// 幾何體與材質都在模組層共用，卸載時不會被丟棄（第二階段分區塊載入時可直接重用）。
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  BRIDGES,
  CLIFFS,
  ELDER_TREE,
  ENTRANCES,
  LAMPS,
  PASS_ARCH,
  RIDGE_ROCKS,
  RIVER,
  RUIN_PIECES,
  WINDMILL,
  groundHeight,
  type BridgeDef,
  type Boulder,
} from '../data/terrain'
import { progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { RIVER_POINTS, buildRibbon, waterTexture } from './terrainMeshes'

// ── 共用幾何與材質 ──
const BOULDER_GEO = new THREE.DodecahedronGeometry(1, 0)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8)
const SPHERE = new THREE.SphereGeometry(1, 14, 10)
const CONE = new THREE.ConeGeometry(1, 1, 8)
const mat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const M = {
  stone: mat('#c9c2b2', { flatShading: true }),
  stoneDark: mat('#a59e90', { flatShading: true }),
  wood: mat('#a8743f'),
  woodDark: mat('#7d5532'),
  plank: mat('#c48c55'),
  rope: mat('#d9c49a'),
  white: mat('#fbf4e6'),
  roofRed: mat('#d9654f'),
  sail: mat('#fff7e8', { side: THREE.DoubleSide }),
  bark: mat('#7a5b3e'),
  leafDeep: mat('#3f7d4f'),
  leafMid: mat('#4f9460'),
  lamp: mat('#ffe6a8', { emissive: '#ffcf6a', emissiveIntensity: 0.9 }),
  iron: mat('#5d5a63'),
  sign: mat('#d9a066'),
}

/** 一組岩石（山脊、邊界山壁）：共用一個 InstancedMesh，每顆有自己的顏色 */
function Boulders({ items, sink = 0.25 }: { items: Boulder[]; sink?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Object3D()
    const c = new THREE.Color()
    items.forEach((b, i) => {
      m.position.set(b.x, groundHeight(b.x, b.z) + b.h * (0.5 - sink), b.z)
      m.rotation.set(0, b.rot, 0)
      m.scale.set(b.r, b.h / 2 + sink * b.h, b.r * 0.9)
      m.updateMatrix()
      ref.current.setMatrixAt(i, m.matrix)
      ref.current.setColorAt(i, c.set(b.color))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items, sink])
  return (
    <instancedMesh ref={ref} args={[BOULDER_GEO, undefined, items.length]} castShadow receiveShadow>
      <meshLambertMaterial flatShading />
    </instancedMesh>
  )
}

// ── 河流 ──
function River() {
  const water = useMemo(() => {
    const t = waterTexture()
    t.repeat.set(1, 0.35)
    return t
  }, [])
  const geos = useMemo(
    () => ({
      bank: buildRibbon(RIVER_POINTS, RIVER.hw * 2 + 2.4, 0.02, (_, c) => c.set('#d8c99a')),
      bed: buildRibbon(RIVER_POINTS, RIVER.hw * 2 + 0.7, 0.03, (_, c) => c.set('#4fa3c9')),
      water: buildRibbon(RIVER_POINTS, RIVER.hw * 2 + 0.1, 0.05),
    }),
    [],
  )
  useFrame((_, dt) => {
    water.offset.y -= dt * 0.12
  })
  return (
    <group>
      <mesh geometry={geos.bank} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={geos.bed}>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={geos.water}>
        <meshLambertMaterial map={water} transparent opacity={0.88} emissive="#2f8fc0" emissiveIntensity={0.18} />
      </mesh>
    </group>
  )
}

// ── 橋 ──
function StoneBridge({ b }: { b: BridgeDef }) {
  const w = b.hw * 2
  return (
    <group>
      <mesh geometry={BOX} material={M.stone} position={[0, 0.03, 0]} scale={[w + 0.2, 0.06, b.len]} receiveShadow />
      {/* 橋身：從河岸側面看得到 */}
      <mesh geometry={BOX} material={M.stoneDark} position={[0, -0.28, 0]} scale={[w + 0.1, 0.5, b.len * 0.8]} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (b.hw + 0.22), 0, 0]}>
          <mesh geometry={BOX} material={M.stone} position={[0, 0.32, 0]} scale={[0.32, 0.55, b.len]} castShadow />
          {[-1, 1].map((e) => (
            <mesh geometry={BOX} key={e} material={M.stoneDark} position={[0, 0.5, e * (b.len / 2 - 0.15)]} scale={[0.42, 1, 0.42]} castShadow />
          ))}
        </group>
      ))}
    </group>
  )
}

function WoodDeck({ b }: { b: BridgeDef }) {
  const n = Math.round(b.len / 0.42)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh geometry={BOX} key={i} material={i % 2 ? M.plank : M.wood} position={[0, 0.035, -b.len / 2 + (i + 0.5) * (b.len / n)]} scale={[b.hw * 2 + 0.3, 0.07, b.len / n - 0.04]} receiveShadow castShadow />
      ))}
    </>
  )
}

function WoodBridge({ b }: { b: BridgeDef }) {
  return (
    <group>
      <WoodDeck b={b} />
      {[-1, 1].map((s) =>
        [-1, 0, 1].map((e) => (
          <mesh geometry={CYL8} key={`${s}${e}`} material={M.woodDark} position={[s * (b.hw + 0.18), 0.4, e * (b.len / 2 - 0.2)]} scale={[0.09, 0.8, 0.09]} castShadow />
        )),
      )}
      {[-1, 1].map((s) => (
        <mesh geometry={CYL8} key={s} material={M.rope} position={[s * (b.hw + 0.18), 0.7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.035, b.len - 0.3, 0.035]} />
      ))}
    </group>
  )
}

/** 吊橋：還沒放下時橋面在北端豎起來；放下後平躺成為捷徑 */
function DrawBridge({ b }: { b: BridgeDef }) {
  const deck = useRef<THREE.Group>(null!)
  // 橋的本地座標 +Z 是道路前進方向（往北），鉸鏈在 +Z 端
  useFrame((_, dt) => {
    const open = progress.unlocks.includes(b.id)
    const target = open ? 0 : 1.25
    deck.current.rotation.x += (target - deck.current.rotation.x) * (1 - Math.exp(-dt * 2.5))
  })
  return (
    <group>
      <group ref={deck} position={[0, 0, b.len / 2]} rotation={[1.25, 0, 0]}>
        <group position={[0, 0, -b.len / 2]}>
          <WoodDeck b={b} />
        </group>
      </group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (b.hw + 0.35), 0, b.len / 2 + 0.2]}>
          <mesh geometry={BOX} material={M.woodDark} position={[0, 1.6, 0]} scale={[0.22, 3.2, 0.22]} castShadow />
          <mesh geometry={BOX} material={M.iron} position={[0, 3.25, 0]} scale={[0.32, 0.18, 0.32]} />
        </group>
      ))}
      <mesh geometry={BOX} material={M.woodDark} position={[0, 3.1, b.len / 2 + 0.2]} scale={[b.hw * 2 + 0.9, 0.2, 0.2]} castShadow />
    </group>
  )
}

function Bridges() {
  return (
    <>
      {BRIDGES.map((b) => (
        <group key={b.id} position={[b.x, 0, b.z]} rotation={[0, b.rot, 0]}>
          {b.style === 'stone' ? <StoneBridge b={b} /> : b.style === 'wood' ? <WoodBridge b={b} /> : <DrawBridge b={b} />}
        </group>
      ))}
    </>
  )
}

/** 北方隘口的石拱門：兩根石柱與橫樑；從村子往北看，遠方的星見塔剛好框在拱門中間 */
function PassArch() {
  const a = PASS_ARCH
  // 拱門自己的材質：鏡頭隔著拱門看主角時淡出，避免橫樑擋住畫面
  const am = useMemo(() => ({ stone: M.stone.clone(), dark: M.stoneDark.clone() }), [])
  useFrame((s, dt) => {
    const p = runtime.player
    const cz = s.camera.position.z
    const between = (p.z - a.z) * (cz - a.z) < 0 && Math.abs(p.x - a.x) < a.span + 1.5 && Math.abs(p.z - a.z) < 10
    const target = between ? 0.22 : 1
    for (const m of [am.stone, am.dark]) {
      m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 8))
      const tr = m.opacity < 0.98
      if (m.transparent !== tr) {
        m.transparent = tr
        m.needsUpdate = true
      }
    }
  })
  return (
    <group position={[a.x, 0, a.z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * a.span) / 2, 0, 0]}>
          <mesh geometry={CYL8} material={am.stone} position={[0, a.h / 2, 0]} scale={[0.55, a.h, 0.55]} castShadow receiveShadow />
          <mesh geometry={BOX} material={am.dark} position={[0, 0.2, 0]} scale={[0.85, 0.4, 0.85]} />
          <mesh geometry={SPHERE} material={M.lamp} position={[0, a.h - 0.9, 0.45]} scale={0.16} />
        </group>
      ))}
      <mesh geometry={BOX} material={am.dark} position={[0, a.h + 0.2, 0]} scale={[a.span + 1.4, 0.5, 0.8]} castShadow />
      <mesh geometry={BOX} material={am.stone} position={[0, a.h + 0.6, 0]} scale={[a.span * 0.5, 0.35, 0.6]} castShadow />
    </group>
  )
}

/** 翠綠草原的風車（從村子東邊遠遠就看得到） */
function Windmill() {
  const blades = useRef<THREE.Group>(null!)
  useFrame((_, dt) => {
    blades.current.rotation.z += dt * 0.6
  })
  return (
    <group position={[WINDMILL.x, 0, WINDMILL.z]} rotation={[0, WINDMILL.rot, 0]}>
      <mesh material={M.white} position={[0, 3, 0]} scale={[1.35, 6, 1.35]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 1, 1, 8]} />
      </mesh>
      <mesh geometry={CONE} material={M.roofRed} position={[0, 6.8, 0]} scale={[1.55, 1.8, 1.55]} castShadow />
      <mesh geometry={BOX} material={M.woodDark} position={[0, 0.75, 1.3]} scale={[0.75, 1.5, 0.1]} />
      <group ref={blades} position={[0, 5.6, 1.15]}>
        <mesh geometry={CYL8} material={M.woodDark} rotation={[Math.PI / 2, 0, 0]} scale={[0.22, 0.4, 0.22]} />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh geometry={BOX} material={M.woodDark} position={[0, 2.1, 0.1]} scale={[0.12, 4.2, 0.08]} castShadow />
            <mesh material={M.sail} position={[0.42, 2.4, 0.12]} scale={[0.7, 3.2, 1]}>
              <planeGeometry args={[1, 1]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/** 迷霧森林深處的古老巨木：粗大的樹幹、樹根與層層樹冠 */
function ElderTree() {
  return (
    <group position={[ELDER_TREE.x, 0, ELDER_TREE.z]}>
      <mesh material={M.bark} position={[0, 3, 0]} scale={[1.25, 6, 1.25]} castShadow>
        <cylinderGeometry args={[0.75, 1.15, 1, 10]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh geometry={CYL8} key={i} material={M.bark} position={[Math.cos(a) * 1.4, 0.3, Math.sin(a) * 1.4]} rotation={[Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]} scale={[0.35, 1.6, 0.35]} castShadow />
        )
      })}
      {[
        [0, 7.6, 0, 3.6],
        [2.3, 6.6, 0.8, 2.5],
        [-2.2, 6.9, -0.9, 2.7],
        [0.5, 6.4, -2.3, 2.3],
        [-0.6, 9.4, 0.4, 2.4],
      ].map(([x, y, z, r], i) => (
        <mesh geometry={SPHERE} key={i} material={i % 2 ? M.leafMid : M.leafDeep} position={[x, y, z]} scale={[r, r * 0.8, r]} castShadow />
      ))}
    </group>
  )
}

/** 古代石環一帶的斷牆與倒下的石柱 */
function RuinPieces() {
  return (
    <>
      {RUIN_PIECES.map((p, i) =>
        p.kind === 'wall' ? (
          <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]}>
            <mesh geometry={BOX} material={M.stone} position={[0, p.h / 2, 0]} scale={[p.len, p.h, 0.5]} castShadow receiveShadow />
            <mesh geometry={BOX} material={M.stoneDark} position={[p.len * 0.22, p.h + 0.3, 0]} scale={[p.len * 0.45, 0.6, 0.5]} castShadow />
          </group>
        ) : (
          <group key={i} position={[p.x, 0.42, p.z]} rotation={[0, p.rot, 0]}>
            <mesh geometry={CYL8} material={M.stone} rotation={[0, 0, Math.PI / 2]} scale={[0.42, p.len, 0.42]} castShadow receiveShadow />
          </group>
        ),
      )}
    </>
  )
}

function Lamps() {
  return (
    <>
      {LAMPS.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh geometry={CYL8} material={M.woodDark} position={[0, 1.1, 0]} scale={[0.07, 2.2, 0.07]} castShadow />
          <mesh geometry={BOX} material={M.iron} position={[0, 2.25, 0]} scale={[0.26, 0.08, 0.26]} />
          <mesh geometry={BOX} material={M.lamp} position={[0, 2.05, 0]} scale={[0.18, 0.3, 0.18]} />
        </group>
      ))}
    </>
  )
}

/** 封閉的區域入口：石柱、木頭路障與告示牌（之後接上新區域時拆掉） */
function Entrances() {
  return (
    <>
      {ENTRANCES.map((g) => (
        <group key={g.id} position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]}>
          {[-1, 1].map((s) => (
            <mesh geometry={BOX} key={s} material={M.stone} position={[s * 2.3, 1.2, 0]} scale={[0.7, 2.4, 0.7]} castShadow />
          ))}
          {[-0.5, 0.5].map((r) => (
            <mesh geometry={BOX} key={r} material={M.wood} position={[0, 0.75, 0.1]} rotation={[0, 0, r]} scale={[4.2, 0.22, 0.12]} castShadow />
          ))}
          <mesh geometry={BOX} material={M.woodDark} position={[0, 1.35, 0.15]} scale={[4.4, 0.18, 0.12]} />
          <mesh geometry={BOX} material={M.sign} position={[1.4, 1.6, -0.35]} rotation={[0, Math.PI, 0]} scale={[1.2, 0.5, 0.08]} />
        </group>
      ))}
    </>
  )
}

export function Landmarks() {
  return (
    <>
      <River />
      <Bridges />
      <Boulders items={RIDGE_ROCKS} />
      <PassArch />
      <Windmill />
      <ElderTree />
      <RuinPieces />
      <Lamps />
      <Entrances />
      <Boulders items={CLIFFS} sink={0.3} />
    </>
  )
}
