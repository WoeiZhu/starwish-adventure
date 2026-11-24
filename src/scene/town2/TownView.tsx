// 新版城鎮的畫面：依配置表（data/townLayout.ts）擺放 Meshy 單體模型與程序化物件。
//   mode = 'interior'：城鎮地圖本身（含城外中景：森林、丘陵、河流、農田）
//   mode = 'shell'   ：主線世界看到的城外外觀（城牆、塔、城門、屋頂、守衛），旋轉 180° 接在南方街道盡頭
// 效能：同一種模組用 InstancedMesh，近處用完整模型、遠處換 .lod 版本；程序化物件合併成少數網格；
//       建築擋住鏡頭時淡出（不拉近鏡頭），城牆與塔則由鏡頭防穿模處理。
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildAppearance, modelUrl } from '../../data/appearance'
import { MODULE_DIMS, WORLD_SCALE, blockersOf, type ModuleId, type Piece, type TownLayout } from '../../data/townLayout'
import { runtime } from '../../game/runtime'
import { CharacterModel } from '../characters/CharacterModel'
import { useGateFade, withMeshopt } from '../gltf'
import type { GateVolume } from '../../data/town'

const NO_MATS: THREE.Material[] = []
const NO_VOLUME: GateVolume = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 0 }
import {
  FLAG_CLOTH,
  LAMP_GLASS,
  archGeometry,
  bedsGeometry,
  benchesGeometry,
  buntingGeometry,
  propsGeometry,
  cobbleTexture,
  dirtTexture,
  fencesGeometry,
  fieldsGeometry,
  flagMaterial,
  forestRing,
  grassTexture,
  hillsGeometry,
  houseGeometry,
  lampGeometry,
  lowRoundTreeGeometry,
  lowTreeGeometry,
  plazaTexture,
  poleGeometry,
  riverGeometry,
  roadGeometry,
  signTexture,
  stallsGeometry,
  towersGeometry,
} from './procedural'

const DIR = 'starwish-town-meshy-20261123-v001/'
export const moduleUrl = (a: ModuleId, lod: boolean) => modelUrl(`${DIR}${a}${lod ? '.lod' : ''}.web.glb`)

export const town2Stats = { drawables: 0, instances: 0 }

/** 用到的模組（完整＋遠景版本） */
function usedModules(L: TownLayout): ModuleId[] {
  const set = new Set<ModuleId>()
  for (const s of L.shops) set.add(s.piece.asset)
  if (L.gate) set.add('town-gate')
  if (L.fountain) set.add('star-fountain')
  if (L.walls.length) set.add('town-wall')
  if (L.trees.length) set.add('town-tree')
  return [...set]
}
const HAS_LOD: ModuleId[] = ['weapon-shop', 'general-store', 'adventurers-guild', 'town-inn', 'town-gate', 'town-wall', 'town-tree']

interface ModuleGeo {
  geo: THREE.BufferGeometry
  mat: THREE.MeshStandardMaterial
}
/** 從 GLB 取出唯一的網格：把節點變換烘進幾何，材質一律非金屬 */
function extract(gltf: GLTF): ModuleGeo {
  gltf.scene.updateMatrixWorld(true)
  let found: THREE.Mesh | null = null
  gltf.scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh
  })
  const mesh = found as unknown as THREE.Mesh
  const geo = mesh.geometry.clone()
  // 壓縮過的頂點是正規化的 Int16（-1～1），直接套變換會被夾在 ±1：先轉成 Float32
  for (const name of ['position', 'normal'] as const) {
    const at = geo.getAttribute(name) as THREE.BufferAttribute
    if (!at || at.array instanceof Float32Array) continue
    const f = new Float32Array(at.count * 3)
    for (let i = 0; i < at.count; i++) {
      f[i * 3] = at.getX(i)
      f[i * 3 + 1] = at.getY(i)
      f[i * 3 + 2] = at.getZ(i)
    }
    geo.setAttribute(name, new THREE.BufferAttribute(f, 3))
  }
  geo.applyMatrix4(mesh.matrixWorld)
  const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
  mat.metalness = 0
  return { geo, mat }
}

/** 載入配置表用到的模組；回傳 asset → { full, lod } */
function useModules(L: TownLayout, shell: boolean) {
  const ids = usedModules(L)
  // 城外外觀：建築與樹只用遠景版本（隔著城牆遠看）
  const want = ids.flatMap((a) => {
    const lodOnly = shell && HAS_LOD.includes(a) && a !== 'town-gate' && a !== 'town-wall'
    const list: [ModuleId, boolean][] = []
    if (!lodOnly) list.push([a, false])
    if (HAS_LOD.includes(a)) list.push([a, true])
    return list
  })
  const urls = want.map(([a, l]) => moduleUrl(a, l))
  const gltfs = useLoader(GLTFLoader, urls, withMeshopt) as GLTF[]
  const out = useMemo(() => {
    const out = {} as Record<ModuleId, { full: ModuleGeo; lod: ModuleGeo }>
    want.forEach(([a, l], i) => {
      const m = extract(gltfs[i])
      out[a] = out[a] ?? ({} as { full: ModuleGeo; lod: ModuleGeo })
      out[a][l ? 'lod' : 'full'] = m
    })
    for (const a of ids) {
      out[a].full = out[a].full ?? out[a].lod
      out[a].lod = out[a].lod ?? out[a].full
    }
    return out
    // gltfs 是快取裡的物件，網址不變就不會變
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs])
  // 複製出來的幾何與材質在卸載時釋放（貼圖屬於載入快取，不在這裡釋放）
  useEffect(
    () => () => {
      for (const m of Object.values(out)) {
        for (const x of new Set([m.full, m.lod])) {
          x.geo.dispose()
          x.mat.dispose()
        }
      }
    },
    [out],
  )
  return out
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpV = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const pieceMatrix = (p: Piece, sx = 1) => tmpM.compose(tmpV.set(p.x, 0, p.z), tmpQ.setFromAxisAngle(UP, p.rot), tmpS.set(p.s * sx, p.s, p.s))

/**
 * 同一種模組的所有擺放：近的用完整模型、遠的用 LOD（每 0.25 秒依鏡頭距離重新分配）。
 * stretch：城牆要稍微拉長才能剛好鋪滿一段牆。
 */
function ModuleInstances({
  pieces,
  m,
  lodDist,
  shadows,
  stretch,
}: {
  pieces: Piece[]
  m: { full: ModuleGeo; lod: ModuleGeo }
  lodDist: number
  shadows: boolean
  stretch?: number[]
}) {
  const group = useRef<THREE.Group>(null!)
  const meshes = useMemo(() => {
    const full = new THREE.InstancedMesh(m.full.geo, m.full.mat, pieces.length)
    const lod = new THREE.InstancedMesh(m.lod.geo, m.lod.mat, pieces.length)
    for (const x of [full, lod]) {
      x.castShadow = shadows
      x.receiveShadow = true
    }
    return { full, lod }
  }, [m, pieces.length, shadows])
  useEffect(() => () => (meshes.full.dispose(), meshes.lod.dispose()), [meshes])
  const world = useRef<THREE.Vector3[]>([])
  const timer = useRef(0)
  const assign = (cam: THREE.Vector3 | null) => {
    let nf = 0
    let nl = 0
    pieces.forEach((p, i) => {
      const near = cam ? world.current[i].distanceTo(cam) < lodDist : true
      const mat = pieceMatrix(p, stretch?.[i] ?? 1)
      if (near || m.full === m.lod) meshes.full.setMatrixAt(nf++, mat)
      else meshes.lod.setMatrixAt(nl++, mat)
    })
    meshes.full.count = nf
    meshes.lod.count = nl
    for (const x of [meshes.full, meshes.lod]) {
      x.instanceMatrix.needsUpdate = true
      x.computeBoundingSphere()
      x.visible = x.count > 0
    }
  }
  useLayoutEffect(() => {
    group.current.updateWorldMatrix(true, false)
    world.current = pieces.map((p) => new THREE.Vector3(p.x, 2, p.z).applyMatrix4(group.current.matrixWorld))
    assign(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes, pieces])
  useFrame((state, dt) => {
    timer.current -= dt
    if (timer.current > 0) return
    timer.current = 0.25
    assign(state.camera.position)
  })
  return (
    <group ref={group}>
      <primitive object={meshes.full} />
      <primitive object={meshes.lod} />
    </group>
  )
}

/** 單棟建築（商店、城門）：各自一份材質，擋住鏡頭時可以淡出；遠的換 LOD */
function Single({
  piece,
  m,
  lodDist,
  shadows,
  fade,
  fadeKey,
  gateVolume,
}: {
  piece: Piece
  m: { full: ModuleGeo; lod: ModuleGeo }
  lodDist: number
  shadows: boolean
  fade: FadeRegistry | null
  fadeKey: string
  /** 主線世界的城門：用世界座標的範圍判斷擋住鏡頭就淡出 */
  gateVolume?: GateVolume
}) {
  const mats = useMemo(() => ({ full: m.full.mat.clone(), lod: m.lod === m.full ? null : m.lod.mat.clone() }), [m])
  useEffect(() => () => (mats.full.dispose(), mats.lod?.dispose()), [mats])
  useGateFade(gateVolume ? [mats.full, ...(mats.lod ? [mats.lod] : [])] : NO_MATS, gateVolume ?? NO_VOLUME)
  const full = useRef<THREE.Mesh>(null!)
  const lod = useRef<THREE.Mesh>(null!)
  useEffect(() => {
    if (!fade) return
    const list = [mats.full, ...(mats.lod ? [mats.lod] : [])]
    fade.set(fadeKey, list)
    return () => void fade.delete(fadeKey)
  }, [fade, fadeKey, mats])
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current -= dt
    if (t.current > 0 || !mats.lod) return
    t.current = 0.25
    full.current.getWorldPosition(tmpV)
    const near = tmpV.distanceTo(state.camera.position) < lodDist
    full.current.visible = near
    lod.current.visible = !near
  })
  return (
    <group position={[piece.x, 0, piece.z]} rotation={[0, piece.rot, 0]} scale={piece.s}>
      <mesh ref={full} geometry={m.full.geo} material={mats.full} castShadow={shadows} receiveShadow />
      {mats.lod && <mesh ref={lod} geometry={m.lod.geo} material={mats.lod} castShadow={shadows} receiveShadow visible={false} />}
    </group>
  )
}

// ── 淡出：建築擋在鏡頭與主角之間時半透明 ──
type FadeRegistry = Map<string, THREE.Material[]>
function useBuildingFade(L: TownLayout, reg: FadeRegistry, enabled: boolean) {
  const blockers = useMemo(() => blockersOf(L), [L])
  const cur = useRef(new Map<string, number>())
  useFrame((state, dtRaw) => {
    if (!enabled) return
    const cam = state.camera.position
    const p = runtime.player
    const k = 1 - Math.exp(-Math.min(dtRaw, 0.05) * 8)
    for (const b of blockers) {
      if (!b.fade) continue
      let hit = false
      for (let i = 1; i <= 20 && !hit; i++) {
        const t = i / 20
        const x = p.x + (cam.x - p.x) * t
        const y = 1.1 + (cam.y - 1.1) * t
        const z = p.z + (cam.z - p.z) * t
        hit = x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.h
      }
      const want = hit ? 0.25 : 1
      const now = (cur.current.get(b.key) ?? 1) + (want - (cur.current.get(b.key) ?? 1)) * k
      cur.current.set(b.key, now)
      const o = now > 0.995 ? 1 : now
      for (const m of reg.get(b.key) ?? []) {
        const fading = o < 1
        if (m.transparent !== fading) {
          m.transparent = fading
          m.depthWrite = !fading
          m.needsUpdate = true
        }
        m.opacity = o
      }
    }
  })
}

/** 一棟民房（各自一份材質，可淡出） */
function HouseMesh({ h, i, shadows, fade }: { h: TownLayout['houses'][number]; i: number; shadows: boolean; fade: FadeRegistry | null }) {
  const geo = useMemo(() => houseGeometry(h), [h])
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), [])
  useEffect(() => {
    if (!fade) return
    fade.set('house-' + i, [mat])
    return () => void fade.delete('house-' + i)
  }, [fade, i, mat])
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat])
  return <mesh geometry={geo} material={mat} position={[h.x, 0, h.z]} rotation={[0, h.rot, 0]} castShadow={shadows} receiveShadow />
}

/** 合併好的靜態幾何（頂點色），卸載時釋放 */
function Static({ geo, shadows = false, y = 0 }: { geo: THREE.BufferGeometry | null; shadows?: boolean; y?: number }) {
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), [])
  useEffect(() => () => (geo?.dispose(), mat.dispose()), [geo, mat])
  if (!geo) return null
  return <mesh geometry={geo} material={mat} position-y={y} castShadow={shadows} receiveShadow />
}

function Lamps({ lamps, shadows }: { lamps: TownLayout['lamps']; shadows: boolean }) {
  const { pole, glass } = useMemo(() => {
    const pole = new THREE.InstancedMesh(lampGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), lamps.length)
    const glass = new THREE.InstancedMesh(LAMP_GLASS, new THREE.MeshBasicMaterial({ color: '#ffe6a0' }), lamps.length)
    lamps.forEach((l, i) => {
      tmpM.makeTranslation(l.x, 0, l.z)
      pole.setMatrixAt(i, tmpM)
      glass.setMatrixAt(i, tmpM)
    })
    pole.castShadow = shadows
    pole.computeBoundingSphere()
    glass.computeBoundingSphere()
    return { pole, glass }
  }, [lamps, shadows])
  useEffect(
    () => () => {
      pole.geometry.dispose()
      ;(pole.material as THREE.Material).dispose()
      ;(glass.material as THREE.Material).dispose()
      pole.dispose()
      glass.dispose()
    },
    [pole, glass],
  )
  if (!lamps.length) return null
  return (
    <>
      <primitive object={pole} />
      <primitive object={glass} />
    </>
  )
}

function Flags({ flags }: { flags: TownLayout['flags'] }) {
  const { poles, cloth, uniforms } = useMemo(() => {
    const parts = flags.map((f) => {
      const h = f.y > 0 ? 2.6 : 5.4
      return poleGeometry(h).translate(f.x, f.y, f.z)
    })
    const { material, uniforms } = flagMaterial()
    const cloth = new THREE.InstancedMesh(FLAG_CLOTH, material, flags.length)
    flags.forEach((f, i) => {
      const h = f.y > 0 ? 2.6 : 5.4
      tmpM.compose(tmpV.set(f.x, f.y + h - 0.6, f.z), tmpQ.setFromAxisAngle(UP, f.rot + 0.4), tmpS.set(1, 1, 1))
      cloth.setMatrixAt(i, tmpM)
      cloth.setColorAt(i, new THREE.Color(f.color))
    })
    cloth.computeBoundingSphere()
    for (const g of parts) g.dispose()
    return { poles: parts.length ? mergeAll(parts) : null, cloth, uniforms }
  }, [flags])
  useEffect(() => () => ((cloth.material as THREE.Material).dispose(), cloth.dispose()), [cloth])
  useFrame((s) => (uniforms.uTime.value = s.clock.elapsedTime))
  if (!flags.length) return null
  return (
    <>
      <Static geo={poles} />
      <primitive object={cloth} />
    </>
  )
}
function mergeAll(list: THREE.BufferGeometry[]) {
  // 小工具：合併同屬性的幾何（旗桿）
  let n = 0
  for (const g of list) n += g.getAttribute('position').count
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  let o = 0
  for (const g of list) {
    const p = g.getAttribute('position')
    pos.set(p.array as Float32Array, o * 3)
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3)
    col.set(g.getAttribute('color').array as Float32Array, o * 3)
    o += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

function Signs({ signs, wood }: { signs: TownLayout['signs']; wood: boolean }) {
  const tex = useMemo(() => signTexture('星光鎮', 'STARLIGHT TOWN'), [])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <>
      {signs.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} rotation={[0, s.rot, 0]}>
          {wood && (
            <mesh position={[0, 0, -0.08]}>
              <boxGeometry args={[4.4, 2.1, 0.12]} />
              <meshLambertMaterial color="#6b4a2e" />
            </mesh>
          )}
          <mesh>
            <planeGeometry args={[4.6, 2.3]} />
            <meshLambertMaterial map={tex} transparent alphaTest={0.1} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** 守衛：程序化 Q 版人物（紅金制服），和隊伍裡的戰士模型區分開，面數也少很多 */
const GUARD_LOOK = {
  ...buildAppearance('boy', 'knight'),
  modelUrl: undefined,
  outfit: { primary: '#c8463d', secondary: '#f2c14e', accent: '#4a3b52' },
  hair: '#6b4a2e',
}
/** 守衛：角色模型一個約 3 萬面，鏡頭 30 m 外就不畫（手機省很多） */
function Guards({ guards }: { guards: TownLayout['guards'] }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const t = useRef(0)
  useFrame((state, dt) => {
    t.current -= dt
    if (t.current > 0) return
    t.current = 0.3
    for (const g of refs.current) {
      if (!g) continue
      g.getWorldPosition(tmpV)
      g.visible = tmpV.distanceTo(state.camera.position) < 30
      // 程序化人物是很多小零件：不投影，繪製次數少一半（腳下的影子交給地面的接收陰影）
      if (!g.userData.noShadow) {
        let n = 0
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = false
            n++
          }
        })
        if (n > 0) g.userData.noShadow = true
      }
    }
  })
  return (
    <>
      {guards.map((g, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)} position={[g.x, 0, g.z]} rotation={[0, g.rot, 0]}>
          <CharacterModel appearance={GUARD_LOOK} />
        </group>
      ))}
    </>
  )
}

/** 地面：大片草地（貼圖＋大範圍深淺變化），城外一圈慢慢接到遠景 */
function Ground({ L, shell, onClick }: { L: TownLayout; shell: boolean; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const { geo, mat } = useMemo(() => {
    const tex = grassTexture()
    const f = L.footprint
    const size = shell ? Math.max(f.maxX - f.minX, f.maxZ - f.minZ) : 520
    const seg = shell ? 24 : 64
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2)
    const cx = shell ? (f.minX + f.maxX) / 2 : 0
    const cz = shell ? (f.minZ + f.maxZ) / 2 : (f.minZ + f.maxZ) / 2
    g.translate(cx, 0, cz)
    const pos = g.getAttribute('position')
    const uv = g.getAttribute('uv')
    const col = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const a = new THREE.Color('#8cc46f')
    const b = new THREE.Color('#c4e39a')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      uv.setXY(i, x / 7, z / 7)
      const n = Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.038 - 0.6) * 0.5 + Math.sin(x * 0.13 + z * 0.09) * 0.25 + 0.5
      c.copy(a).lerp(b, Math.min(1, Math.max(0, n)))
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })
    return { geo: g, mat }
  }, [L, shell])
  useEffect(() => () => (geo.dispose(), mat.map?.dispose(), mat.dispose()), [geo, mat])
  return <mesh geometry={geo} material={mat} position-y={shell ? 0.012 : 0} receiveShadow onClick={onClick} />
}

function Roads({ L, shell }: { L: TownLayout; shell: boolean }) {
  const gateZ = (L.gate?.z ?? L.arch?.z ?? 0) + 2.4
  const parts = useMemo(() => {
    // 城外外觀不畫城門外的土路（主線世界有自己的道路）；城內的石板路要畫，從城門看得進去
    const roads = shell ? L.roads.filter((r) => r.pts.every(([, z]) => z <= gateZ + 1)) : L.roads
    const cobble = roads.filter((r) => r.kind === 'cobble')
    const dirt = roads.filter((r) => r.kind === 'dirt')
    return {
      cobble: cobble.length ? { geo: roadGeometry(cobble, 0.03), mat: new THREE.MeshLambertMaterial({ map: cobbleTexture(true), alphaTest: 0.5 }) } : null,
      dirt: dirt.length ? { geo: roadGeometry(dirt, 0.022), mat: new THREE.MeshLambertMaterial({ map: dirtTexture(), alphaTest: 0.35 }) } : null,
      plaza: L.plaza ? { geo: new THREE.CircleGeometry(L.plaza.r, 48).rotateX(-Math.PI / 2), mat: new THREE.MeshLambertMaterial({ map: plazaTexture() }) } : null,
    }
  }, [L, shell, gateZ])
  useEffect(
    () => () => {
      for (const p of Object.values(parts)) if (p) (p.geo.dispose(), p.mat.map?.dispose(), p.mat.dispose())
    },
    [parts],
  )
  return (
    <>
      {parts.dirt && <mesh geometry={parts.dirt.geo} material={parts.dirt.mat} receiveShadow />}
      {parts.cobble && <mesh geometry={parts.cobble.geo} material={parts.cobble.mat} receiveShadow />}
      {parts.plaza && L.plaza && <mesh geometry={parts.plaza.geo} material={parts.plaza.mat} position={[L.plaza.x, 0.04, L.plaza.z]} receiveShadow />}
    </>
  )
}

/** 城外中景：森林一圈、遠處丘陵、城後的河、岩石 */
function Surroundings({ L, quality }: { L: TownLayout; quality: 'high' | 'saver' }) {
  const data = useMemo(() => {
    const f = L.footprint
    const gx = L.gate?.x ?? L.arch?.x ?? 0
    const keep = [
      // 城門外道路兩側留空，從城外遠望時鏡頭前不會有樹擋住
      { minX: gx - 16, maxX: gx + 16, minZ: f.maxZ - 2, maxZ: f.maxZ + 200 },
      ...L.fields.map((x) => ({ minX: x.x - x.w / 2 - 2, maxX: x.x + x.w / 2 + 2, minZ: x.z - x.d / 2 - 2, maxZ: x.z + x.d / 2 + 2 })),
    ]
    const trees = forestRing(f, keep, quality === 'high' ? 520 : 300, L.walls.length ? 5 : 2, 78)
    const cone = trees.filter((t) => !t.round)
    const round = trees.filter((t) => t.round)
    const mk = (geo: THREE.BufferGeometry, list: typeof trees) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), list.length)
      list.forEach((t, i) => {
        tmpM.compose(tmpV.set(t.x, 0, t.z), tmpQ.setFromAxisAngle(UP, t.rot), tmpS.setScalar(t.s))
        m.setMatrixAt(i, tmpM)
        m.setColorAt(i, t.color)
      })
      m.computeBoundingSphere()
      return m
    }
    const river = riverGeometry(f)
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#b5b0a4' }), 40)
    let seed = 31
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2
      const d = 12 + rnd() * 50
      const x = (f.minX + f.maxX) / 2 + Math.sin(a) * ((f.maxX - f.minX) / 2 + d)
      const z = (f.minZ + f.maxZ) / 2 + Math.cos(a) * ((f.maxZ - f.minZ) / 2 + d)
      tmpM.compose(tmpV.set(x, 0.2, z), tmpQ.setFromAxisAngle(UP, rnd() * 6), tmpS.set(0.6 + rnd() * 1.4, 0.5 + rnd(), 0.6 + rnd() * 1.4))
      rocks.setMatrixAt(i, tmpM)
    }
    rocks.computeBoundingSphere()
    return {
      cone: mk(lowTreeGeometry(), cone),
      round: mk(lowRoundTreeGeometry(), round),
      hills: hillsGeometry(f),
      water: river.water,
      bank: river.bank,
      rocks,
    }
  }, [L, quality])
  useEffect(
    () => () => {
      for (const m of [data.cone, data.round, data.rocks]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
        m.dispose()
      }
      data.water.dispose()
      data.bank.dispose()
    },
    [data],
  )
  return (
    <>
      <primitive object={data.cone} />
      <primitive object={data.round} />
      <Static geo={data.hills} />
      <mesh geometry={data.bank}>
        <meshLambertMaterial color="#e3d3a4" />
      </mesh>
      <mesh geometry={data.water}>
        <meshLambertMaterial color="#7cc6e8" emissive="#2a6f9a" emissiveIntensity={0.25} />
      </mesh>
      <primitive object={data.rocks} />
    </>
  )
}

/** 城牆：每段牆用 8 m 的模組鋪滿（稍微拉長補齊），轉角留給瞭望塔 */
function wallPieces(L: TownLayout) {
  const len = MODULE_DIMS['town-wall'][0] * WORLD_SCALE.wall
  const pieces: Piece[] = []
  const stretch: number[] = []
  for (const w of L.walls) {
    const dx = w.x2 - w.x1
    const dz = w.z2 - w.z1
    const L0 = Math.hypot(dx, dz)
    const n = Math.max(1, Math.round(L0 / len))
    const rot = Math.atan2(dz, dx) * -1
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      pieces.push({ asset: 'town-wall', x: w.x1 + dx * t, z: w.z1 + dz * t, rot, s: WORLD_SCALE.wall })
      stretch.push(L0 / n / len)
    }
  }
  return { pieces, stretch }
}

export interface TownViewProps {
  layout: TownLayout
  mode: 'interior' | 'shell'
  quality: 'high' | 'saver'
  /** 測試頁：開關中景、顯示守衛 */
  showSurroundings?: boolean
  onGroundClick?: (e: ThreeEvent<MouseEvent>) => void
  onReady?: () => void
  gateVolume?: GateVolume
  /** 測試頁：城門內外的守衛都畫（遊戲裡城內只畫內側、城外外觀只畫外側，同時最多 2 位） */
  allGuards?: boolean
}

export function TownView({ layout: L, mode, quality, showSurroundings = true, onGroundClick, onReady, gateVolume, allGuards = false }: TownViewProps) {
  const shell = mode === 'shell'
  const shadows = quality === 'high'
  const modules = useModules(L, shell)
  const fade = useMemo<FadeRegistry>(() => new Map(), [])
  useBuildingFade(L, fade, !shell)
  const walls = useMemo(() => wallPieces(L), [L])
  const gateZ = (L.gate?.z ?? L.arch?.z ?? 0) + 2.4
  const geos = useMemo(
    () => ({
      towers: L.towers.length ? towersGeometry(L.towers) : null,
      stalls: L.stalls.length ? stallsGeometry(L.stalls) : null,
      benches: shell ? null : benchesGeometry(L.benches),
      beds: shell ? null : bedsGeometry(L.beds),
      fences: fencesGeometry(shell ? [] : L.fences),
      fields: shell ? null : fieldsGeometry(L.fields),
      arch: L.arch ? archGeometry(L.arch) : null,
      props: shell ? null : propsGeometry(L.props),
      bunting: L.bunting.length ? buntingGeometry(L.bunting) : null,
    }),
    [L, shell],
  )
  useEffect(() => onReady?.(), [onReady])
  // 彩旗的幾何直接掛在 mesh 上，要自己釋放（其他的交給 Static）
  useEffect(() => () => geos.bunting?.dispose(), [geos])
  const trees = useMemo(() => L.trees, [L])
  const lamps = useMemo(() => (shell ? L.lamps.filter((l) => l.z > gateZ - 6) : L.lamps), [L, shell, gateZ])
  const guards = useMemo(() => (allGuards ? L.guards : L.guards.filter((g) => g.outside === shell)), [L, shell, allGuards])
  town2Stats.instances = walls.pieces.length + trees.length

  return (
    <group>
      <Ground L={L} shell={shell} onClick={onGroundClick} />
      <Roads L={L} shell={shell} />
      {L.gate && (
        <Single piece={L.gate} m={modules['town-gate']} lodDist={shell ? 60 : 70} shadows={shadows} fade={shell ? null : fade} fadeKey="gate" gateVolume={gateVolume} />
      )}
      {walls.pieces.length > 0 && (
        <ModuleInstances pieces={walls.pieces} stretch={walls.stretch} m={modules['town-wall']} lodDist={30} shadows={shadows} />
      )}
      <Static geo={geos.towers} shadows={shadows} />
      {L.shops.map((s) => (
        <Single key={s.id} piece={s.piece} m={modules[s.piece.asset]} lodDist={shell ? 0 : 55} shadows={shadows} fade={shell ? null : fade} fadeKey={s.id} />
      ))}
      {L.fountain && <Single piece={L.fountain} m={modules['star-fountain']} lodDist={999} shadows={shadows} fade={null} fadeKey="fountain" />}
      {L.houses.map((h, i) => (
        <HouseMesh key={i} h={h} i={i} shadows={shadows} fade={shell ? null : fade} />
      ))}
      {trees.length > 0 && <ModuleInstances pieces={trees} m={modules['town-tree']} lodDist={shell ? 0 : 22} shadows={shadows} />}
      <Lamps lamps={lamps} shadows={shadows} />
      <Flags flags={L.flags} />
      <Static geo={geos.stalls} shadows={shadows} />
      <Static geo={geos.benches} />
      <Static geo={geos.beds} />
      <Static geo={geos.fences} shadows={shadows} />
      <Static geo={geos.fields} />
      <Static geo={geos.arch} shadows={shadows} />
      <Static geo={geos.props} shadows={shadows} />
      {geos.bunting && (
        <mesh geometry={geos.bunting}>
          <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
      )}
      <Signs signs={shell ? L.signs.filter((s) => s.rot === 0) : L.signs} wood={!L.gate} />
      <Guards guards={guards} />
      {!shell && showSurroundings && <Surroundings L={L} quality={quality} />}
    </group>
  )
}
