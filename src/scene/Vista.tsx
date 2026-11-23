// 遠景：漸層天空、環繞的山脈，以及三個遠方地標（北方星見塔、東方古堡遺跡、西方世界巨樹）。
// 遠景用簡化的低面數模型、不吃霧（顏色事先混入天空色當作空氣遠近感），整圈山脈合併成一個網格。
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PEAKS, VISTA, mulberry32 } from '../data/terrain'

const SKY_TOP = new THREE.Color('#7fc3f2')
const SKY_HORIZON = new THREE.Color('#d6eefa')
/** 遠景顏色往天空色偏，越遠越淡 */
const HAZE = new THREE.Color('#cfe8f7')

function haze(c: THREE.Color, k: number) {
  return c.lerp(HAZE, k)
}

/** 整圈山脈合併成一個網格：每座山是一個有雜訊的圓錐，高的山有雪頂 */
function buildMountains() {
  const geos: THREE.BufferGeometry[] = []
  const rock = new THREE.Color()
  for (const p of PEAKS) {
    const g = new THREE.ConeGeometry(p.r, p.h, 7, 4).toNonIndexed()
    const rnd = mulberry32(p.seed)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)
    // 同一個頂點位置要有相同的偏移，才不會裂開：用位置當 key
    const jitter = new Map<string, [number, number]>()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`
      if (!jitter.has(key)) jitter.set(key, [(rnd() - 0.5) * p.r * 0.28, (rnd() - 0.5) * p.h * 0.1])
      const [j, jy] = jitter.get(key)!
      const top = y > p.h / 2 - 0.01
      pos.setXYZ(i, x + (top ? 0 : j), y + (top ? 0 : jy), z + (top ? 0 : j * 0.7))
      const t = (y + p.h / 2) / p.h
      if (p.snow && t > 0.68) rock.set('#f7fbff')
      else rock.set(t < 0.3 ? '#7fa88c' : '#8f9fb4').lerp(new THREE.Color('#a7b3c6'), t)
      haze(rock, 0.42)
      cols[i * 3] = rock.r
      cols[i * 3 + 1] = rock.g
      cols[i * 3 + 2] = rock.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    g.translate(p.x, p.h / 2 - 4, p.z)
    g.computeVertexNormals()
    geos.push(g)
  }
  return mergeGeometries(geos)
}

/** 簡單的幾何合併（只合併 position / normal / color） */
function mergeGeometries(list: THREE.BufferGeometry[]) {
  let n = 0
  for (const g of list) n += g.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  let o = 0
  for (const g of list) {
    pos.set(g.getAttribute('position').array as Float32Array, o)
    nor.set(g.getAttribute('normal').array as Float32Array, o)
    col.set(g.getAttribute('color').array as Float32Array, o)
    o += g.getAttribute('position').count * 3
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

/** 漸層天空：跟著相機移動的大圓球（只畫內側） */
function SkyDome() {
  const ref = useRef<THREE.Mesh>(null!)
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(380, 32, 16)
    const pos = g.getAttribute('position')
    const cols = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 380)
      c.copy(SKY_HORIZON).lerp(SKY_TOP, Math.pow(t, 0.6))
      cols[i * 3] = c.r
      cols[i * 3 + 1] = c.g
      cols[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    return g
  }, [])
  useFrame(({ camera }) => {
    ref.current.position.copy(camera.position)
  })
  return (
    <mesh ref={ref} geometry={geo} renderOrder={-10}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  )
}

const vmat = (color: string, k = 0.35, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color: haze(new THREE.Color(color), k), fog: false, flatShading: true, ...extra })

/** 北方高山上的星見塔：塔頂的星晶會發光，從村子往北看得到 */
function StarTower() {
  const t = VISTA.tower
  const gem = useRef<THREE.Mesh>(null!)
  const mats = useMemo(
    () => ({
      rock: vmat('#8e9cb0', 0.4),
      wall: vmat('#e8e2f2', 0.3),
      roof: vmat('#6f7fd0', 0.3),
      gem: new THREE.MeshBasicMaterial({ color: '#d8f2ff', fog: false }),
    }),
    [],
  )
  useFrame((s) => {
    gem.current.rotation.y = s.clock.elapsedTime * 0.5
    gem.current.scale.setScalar(1.8 + Math.sin(s.clock.elapsedTime * 1.4) * 0.2)
  })
  // 底座台地高 10、塔身 24，塔頂的星晶會發光
  const top = 10 + t.h
  return (
    <group position={[t.x, 0, t.z]}>
      <mesh material={mats.rock} position={[0, 4, 0]} scale={[t.base, 12, t.base]}>
        <cylinderGeometry args={[0.6, 1, 1, 7]} />
      </mesh>
      <mesh material={mats.wall} position={[0, 10 + t.h / 2, 0]} scale={[2.4, t.h, 2.4]}>
        <cylinderGeometry args={[0.7, 1, 1, 10]} />
      </mesh>
      {[0.4, 0.75].map((k) => (
        <mesh key={k} material={mats.roof} position={[0, 10 + t.h * k, 0]} scale={[2.8 - k, 0.7, 2.8 - k]}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </mesh>
      ))}
      <mesh material={mats.roof} position={[0, top + 2.5, 0]} scale={[2.2, 5, 2.2]}>
        <coneGeometry args={[1, 1, 10]} />
      </mesh>
      <mesh ref={gem} material={mats.gem} position={[0, top + 7, 0]}>
        <octahedronGeometry args={[1, 0]} />
      </mesh>
    </group>
  )
}

/** 東方的古堡遺跡：幾座高低不一、塔頂殘缺的圓塔與城牆 */
function Castle() {
  const c = VISTA.castle
  const mats = useMemo(() => ({ hill: vmat('#8fb08a', 0.45), wall: vmat('#c4bba8', 0.42), dark: vmat('#9a8f7e', 0.42) }), [])
  const towers: [number, number, number, number][] = [
    [-14, 0, 22, 3.6],
    [0, -8, 30, 4.4],
    [13, 3, 17, 3.2],
    [4, 12, 24, 3.8],
  ]
  return (
    <group position={[c.x, 0, c.z]} rotation={[0, -1.3, 0]}>
      <mesh material={mats.hill} position={[0, 0, 0]} scale={[38, 16, 30]}>
        <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {towers.map(([x, z, h, r], i) => (
        <group key={i} position={[x, 12, z]}>
          <mesh material={mats.wall} position={[0, h / 2, 0]} scale={[r, h, r]}>
            <cylinderGeometry args={[0.9, 1, 1, 9]} />
          </mesh>
          {/* 殘缺的塔頂：缺一角的牆垛 */}
          {[0, 1, 2, 3, 4, 5].map((k) =>
            k === i % 6 ? null : (
              <mesh key={k} material={mats.dark} position={[Math.cos(k) * r * 0.9, h + 0.8, Math.sin(k) * r * 0.9]} scale={[1.2, 1.6 + (k % 2), 1.2]}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
            ),
          )}
        </group>
      ))}
      <mesh material={mats.wall} position={[-7, 18, -4]} rotation={[0, 0.5, 0]} scale={[18, 9, 2]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={mats.wall} position={[8, 17, 7]} rotation={[0, -0.8, 0]} scale={[14, 6, 2]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </group>
  )
}

/** 西方的世界巨樹：遠遠就能看到的巨大樹冠 */
function GiantTree() {
  const t = VISTA.giantTree
  const mats = useMemo(() => ({ bark: vmat('#8a6a52', 0.4), leaf: vmat('#4f9a6a', 0.38), leaf2: vmat('#64ad74', 0.38) }), [])
  return (
    <group position={[t.x, 0, t.z]}>
      <mesh material={mats.bark} position={[0, t.h * 0.35, 0]} scale={[7, t.h * 0.7, 7]}>
        <cylinderGeometry args={[0.6, 1.1, 1, 9]} />
      </mesh>
      {[
        [0, t.h * 0.85, 0, 26],
        [16, t.h * 0.72, 6, 17],
        [-15, t.h * 0.75, -5, 18],
        [3, t.h * 0.7, -15, 16],
        [-4, t.h * 1.02, 4, 15],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} material={i % 2 ? mats.leaf2 : mats.leaf} position={[x, y, z]} scale={[r, r * 0.65, r]}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
      ))}
    </group>
  )
}

export function Vista() {
  const mountains = useMemo(buildMountains, [])
  return (
    <>
      <SkyDome />
      <mesh geometry={mountains}>
        <meshLambertMaterial vertexColors flatShading fog={false} />
      </mesh>
      <StarTower />
      <Castle />
      <GiantTree />
    </>
  )
}
