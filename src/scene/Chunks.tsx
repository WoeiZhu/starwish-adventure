// 分區塊畫出世界：每個區塊有自己的地面、道路與河流片段、草花石頭蕨類（InstancedMesh）、
// 樹木、星晶與蘑菇、山脊與邊界岩壁。區塊卸載時只丟掉自己建立的網格與材質，
// 所有區塊共用的幾何體與材質放在模組層，永遠不會被丟棄。
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { RIVER, groundHeight, type Boulder } from '../data/terrain'
import { ROADS, TREES, type Tuft } from '../data/world'
import { runtime } from '../game/runtime'
import { CS, chunkContent, chunkKey, type ChunkContent } from '../world/chunks'
import { activeKeys, markReady, pumpStream, subscribe, updateStream } from '../world/stream'
import { RIVER_POINTS, buildGround, buildRibbon, roadColor, waterTexture } from './terrainMeshes'
import type { P2 } from '../data/terrain'

// ── 共用資源（所有區塊共用，不會被卸載） ──
const MAT = {
  vcol: new THREE.MeshLambertMaterial({ vertexColors: true }),
  inst: new THREE.MeshLambertMaterial(),
  instFlat: new THREE.MeshLambertMaterial({ flatShading: true }),
  water: (() => {
    const t = waterTexture()
    t.repeat.set(1, 0.35)
    return new THREE.MeshLambertMaterial({ map: t, transparent: true, opacity: 0.88, emissive: '#2f8fc0', emissiveIntensity: 0.18 })
  })(),
  bark: new THREE.MeshLambertMaterial({ color: '#9a6b45' }),
  birch: new THREE.MeshLambertMaterial({ color: '#f1ece2' }),
  stem: new THREE.MeshLambertMaterial({ color: '#f4ead8' }),
}
const GEO = {
  grass: new THREE.ConeGeometry(0.06, 0.24, 4),
  flower: new THREE.SphereGeometry(0.07, 8, 6),
  rock: new THREE.DodecahedronGeometry(1, 0),
  pine: new THREE.ConeGeometry(1.6, 5, 7),
  fern: new THREE.ConeGeometry(0.42, 0.55, 5),
  boulder: new THREE.DodecahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.17, 0.26, 1.6, 8),
  birchTrunk: new THREE.CylinderGeometry(0.12, 0.17, 2.6, 8),
  crown: new THREE.SphereGeometry(1, 14, 10),
  pineTier: new THREE.ConeGeometry(1, 1, 8),
  gem: new THREE.OctahedronGeometry(1, 0).scale(0.38, 1.25, 0.38),
  stem: new THREE.CylinderGeometry(0.16, 0.24, 1, 10),
  cap: new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1),
}
/** 星晶與蘑菇：每種顏色一份發光材質，所有區塊共用 */
const glowMats = new Map<string, THREE.MeshLambertMaterial>()
const glow = (color: string, intensity: number, flat: boolean) => {
  const k = `${color}|${intensity}|${flat}`
  let m = glowMats.get(k)
  if (!m) glowMats.set(k, (m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: flat })))
  return m
}
/** 測試用：所有區塊共用的資源（卸載時不能被丟棄） */
export const SHARED_RESOURCES = { MAT, GEO, glowMats }

type Shape = (t: Tuft) => [number, number, number]
const SHAPE = {
  grass: ((t) => [0.12 * t.s, t.s, t.s]) as Shape,
  flower: ((t) => [0.1, t.s, t.s * 0.7]) as Shape,
  rock: ((t) => [t.s * 0.45, t.s, t.s * 0.7]) as Shape,
  pine: ((t) => [groundHeight(t.x, t.z) + 2.5 * t.s - 0.3, t.s, t.s]) as Shape,
  fern: ((t) => [0.2 * t.s, t.s * 1.1, t.s * 0.75]) as Shape,
}

function Inst({ items, geometry, material, shape, castShadow }: { items: Tuft[]; geometry: THREE.BufferGeometry; material: THREE.Material; shape: Shape; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    if (!ref.current) return // 沒有物件時不建立 InstancedMesh
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
    ref.current.computeBoundingSphere()
  }, [items, shape])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={!castShadow} />
}

function Boulders({ items, sink }: { items: Boulder[]; sink: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    if (!ref.current) return // 沒有物件時不建立 InstancedMesh
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
    ref.current.computeBoundingSphere()
  }, [items, sink])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[GEO.boulder, MAT.instFlat, items.length]} castShadow receiveShadow />
}

/** 區塊內的樹：擋在相機與主角之間時樹冠淡出（樹冠材質由區塊自己建立、卸載時丟棄） */
function ChunkTrees({ idx }: { idx: number[] }) {
  const mats = useMemo(() => idx.map((i) => new THREE.MeshLambertMaterial({ color: TREES[i].color, flatShading: TREES[i].kind !== 'round' })), [idx])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  useFrame(({ camera }, dt) => {
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    const sx = runtime.player.x - cx
    const sz = runtime.player.z - cz
    const len2 = sx * sx + sz * sz || 1
    const k = 1 - Math.exp(-dt * 8)
    idx.forEach((ti, n) => {
      const t = TREES[ti]
      const u = ((t.x - cx) * sx + (t.z - cz) * sz) / len2
      let target = 1
      if (u > 0.02 && u < 1.05) {
        const d = Math.hypot(cx + sx * u - t.x, cz + sz * u - t.z)
        const rayY = cy + (0.8 - cy) * u
        if (d < 1.5 * t.s && rayY < 4.6 * t.s) target = 0.18
      }
      const m = mats[n]
      if (Math.abs(m.opacity - target) < 0.002) return
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
      {idx.map((ti, n) => {
        const t = TREES[ti]
        const m = mats[n]
        return (
          <group key={ti} position={[t.x, 0, t.z]} rotation={[0, t.rot, 0]} scale={t.s}>
            <mesh geometry={t.kind === 'birch' ? GEO.birchTrunk : GEO.trunk} material={t.kind === 'birch' ? MAT.birch : MAT.bark} position={[0, t.kind === 'birch' ? 1.3 : 0.8, 0]} castShadow />
            {t.kind === 'round' ? (
              <>
                <mesh geometry={GEO.crown} material={m} position={[0, 2.3, 0]} scale={1.15} castShadow />
                <mesh geometry={GEO.crown} material={m} position={[0.6, 2.95, 0.2]} scale={0.8} castShadow />
                <mesh geometry={GEO.crown} material={m} position={[-0.55, 2.8, -0.25]} scale={0.75} castShadow />
              </>
            ) : t.kind === 'birch' ? (
              <>
                <mesh geometry={GEO.crown} material={m} position={[0, 3, 0]} scale={[0.95, 1.25, 0.95]} castShadow />
                <mesh geometry={GEO.crown} material={m} position={[0.35, 3.9, 0.1]} scale={[0.6, 0.8, 0.6]} castShadow />
              </>
            ) : (
              <>
                <mesh geometry={GEO.pineTier} material={m} position={[0, 2, 0]} scale={[1.25, 1.9, 1.25]} castShadow />
                <mesh geometry={GEO.pineTier} material={m} position={[0, 3, 0]} scale={[0.95, 1.7, 0.95]} castShadow />
                <mesh geometry={GEO.pineTier} material={m} position={[0, 3.9, 0]} scale={[0.62, 1.4, 0.62]} castShadow />
              </>
            )}
          </group>
        )
      })}
    </>
  )
}

/** 月光山谷的星晶與大蘑菇（共用幾何與依顏色共用的發光材質） */
function GlowProps({ crystals, shrooms }: { crystals: Tuft[]; shrooms: Tuft[] }) {
  return (
    <>
      {crystals.map((c, i) => (
        <group key={`c${i}`} position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]} scale={c.s}>
          <mesh geometry={GEO.gem} material={glow(c.color, 0.55, true)} position={[0, 1.1, 0]} castShadow />
          <mesh geometry={GEO.gem} material={glow(c.color, 0.5, true)} position={[0.45, 0.6, 0.1]} rotation={[0, 0, -0.5]} scale={0.55} castShadow />
          <mesh geometry={GEO.gem} material={glow(c.color, 0.5, true)} position={[-0.35, 0.5, -0.2]} rotation={[0.3, 0, 0.6]} scale={0.45} />
        </group>
      ))}
      {shrooms.map((m, i) => (
        <group key={`m${i}`} position={[m.x, 0, m.z]} rotation={[0, m.rot, 0]} scale={m.s}>
          <mesh geometry={GEO.stem} material={MAT.stem} position={[0, 0.5, 0]} castShadow />
          <mesh geometry={GEO.cap} material={glow(m.color, 0.18, false)} position={[0, 0.95, 0]} castShadow />
        </group>
      ))}
    </>
  )
}

/** 把一條曲線上落在區塊範圍（多留 1 公尺）內的點切成幾段（曲線可能進出區塊好幾次） */
function runsInside(points: P2[], x0: number, z0: number, pad: number): P2[][] {
  const runs: P2[][] = []
  let cur: P2[] | null = null
  const inside = (p: P2) => p.x >= x0 - pad && p.x <= x0 + CS + pad && p.z >= z0 - pad && p.z <= z0 + CS + pad
  points.forEach((p, i) => {
    if (inside(p)) {
      if (!cur) {
        cur = i > 0 ? [points[i - 1]] : []
        runs.push(cur)
      }
      cur.push(p)
    } else if (cur) {
      cur.push(p)
      cur = null
    }
  })
  return runs.filter((r) => r.length >= 2)
}
const ROAD_POINTS = ROADS.map((r) => ({
  width: r.width,
  pts: r.curve.getSpacedPoints(Math.ceil(r.curve.getLength() / 0.7)).map((p) => ({ x: p.x, z: p.z })),
}))

function useChunkGeometry(c: ChunkContent) {
  const geo = useMemo(() => {
    const x0 = c.cx * CS
    const z0 = c.cz * CS
    const list: { geo: THREE.BufferGeometry; mat: THREE.Material; y?: number }[] = []
    ROAD_POINTS.forEach((r, i) => {
      for (const run of runsInside(r.pts, x0, z0, r.width)) {
        list.push({ geo: buildRibbon(run, r.width + 0.55, 0.022 + i * 0.002, roadColor(true)), mat: MAT.vcol })
        list.push({ geo: buildRibbon(run, r.width, 0.03 + i * 0.002, roadColor(false)), mat: MAT.vcol })
      }
    })
    for (const run of runsInside(RIVER_POINTS, x0, z0, RIVER.hw + 1.5)) {
      list.push({ geo: buildRibbon(run, RIVER.hw * 2 + 2.4, 0.02, (_, col) => col.set('#d8c99a')), mat: MAT.vcol })
      list.push({ geo: buildRibbon(run, RIVER.hw * 2 + 0.7, 0.03, (_, col) => col.set('#4fa3c9')), mat: MAT.vcol })
      list.push({ geo: buildRibbon(run, RIVER.hw * 2 + 0.1, 0.05), mat: MAT.water })
    }
    return { ground: buildGround(x0, z0, CS, 2), strips: list }
  }, [c])
  // 卸載時丟掉這個區塊自己建立的網格（共用的幾何體與材質不動）
  useEffect(
    () => () => {
      geo.ground.dispose()
      for (const s of geo.strips) s.geo.dispose()
    },
    [geo],
  )
  return geo
}

function Chunk({ chunkK, onGroundClick }: { chunkK: string; onGroundClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const t0 = performance.now()
  const [cx, cz] = chunkK.split(',').map(Number)
  const c = chunkContent(cx, cz)
  const geo = useChunkGeometry(c)
  useLayoutEffect(() => {
    markReady(chunkK, performance.now() - t0)
    // 只在第一次掛載時記錄
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkK])
  return (
    <group name={`chunk ${chunkK}`}>
      <mesh geometry={geo.ground} material={MAT.vcol} receiveShadow onClick={onGroundClick} />
      {geo.strips.map((s, i) => (
        <mesh key={i} geometry={s.geo} material={s.mat} receiveShadow />
      ))}
      <Inst items={c.grass} geometry={GEO.grass} material={MAT.inst} shape={SHAPE.grass} />
      <Inst items={c.flowers} geometry={GEO.flower} material={MAT.inst} shape={SHAPE.flower} />
      <Inst items={c.rocks} geometry={GEO.rock} material={MAT.instFlat} shape={SHAPE.rock} castShadow />
      <Inst items={c.ferns} geometry={GEO.fern} material={MAT.instFlat} shape={SHAPE.fern} />
      <Inst items={c.borderTrees} geometry={GEO.pine} material={MAT.instFlat} shape={SHAPE.pine} />
      <Boulders items={c.boulders} sink={0.25} />
      <Boulders items={c.cliffs} sink={0.3} />
      <GlowProps crystals={c.crystals} shrooms={c.shrooms} />
      {c.trees.length > 0 && <ChunkTrees idx={c.trees} />}
    </group>
  )
}

// ── 目前載入的區塊（給 InChunk 判斷要不要畫地標） ──
const LoadedCtx = createContext<Set<string>>(new Set())
let snapshot = new Set<string>()
const getSnapshot = () => snapshot
const sub = (fn: () => void) =>
  subscribe(() => {
    snapshot = new Set(activeKeys())
    fn()
  })

/** 地標與建築：所在區塊載入時才畫出來 */
export function InChunk({ x, z, children }: { x: number; z: number; children: ReactNode }) {
  const loaded = useContext(LoadedCtx)
  return loaded.has(chunkKey(Math.floor(x / CS), Math.floor(z / CS))) ? <>{children}</> : null
}

/** 依主角位置串流區塊；children（地標、建築）透過 InChunk 決定要不要畫 */
export function StreamedWorld({ onGroundClick, children }: { onGroundClick: (e: ThreeEvent<MouseEvent>) => void; children?: ReactNode }) {
  const loaded = useSyncExternalStore(sub, getSnapshot)
  useFrame((_, dt) => {
    updateStream(runtime.player.x, runtime.player.z)
    pumpStream()
    const w = MAT.water.map!
    w.offset.y -= dt * 0.12
  })
  return (
    <LoadedCtx.Provider value={loaded}>
      {[...loaded].map((k) => (
        <Chunk key={k} chunkK={k} onGroundClick={onGroundClick} />
      ))}
      {children}
    </LoadedCtx.Provider>
  )
}
