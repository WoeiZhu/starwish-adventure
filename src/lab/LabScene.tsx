// 技能測試頁的 3D 場景：施放者（遊戲同款角色模型）、木樁、範圍標示、特效世界與飄字。
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildAppearance } from '../data/appearance'
import type { ClassId } from '../data/classes'
import { ARROW_LENGTH } from '../data/weaponModels'
import { DEMO_SKILLS } from '../skills/demoSkills'
import { CharacterModel } from '../scene/characters/CharacterModel'
import type { CharacterMotion } from '../scene/characters/types'
import { LoadBoundary } from '../scene/ErrorBoundary'
import { prepareProp, withMeshopt } from '../scene/gltf'
import type { VfxQuality } from '../vfx/quality'
import { VfxWorld } from '../vfx/VfxWorld'
import { lab, updateLab } from './labSim'

export const labStats = { fps: 0, calls: 0, triangles: 0, frameMs: 0, geometries: 0, textures: 0, programs: 0 }

const THEMES = {
  day: { sky: '#d6eefa', ground: '#a6db8f', grid: '#ffffff', hemi: 1.05, sun: 1.7 },
  night: { sky: '#151b30', ground: '#36405c', grid: '#8d9ac4', hemi: 0.45, sun: 0.6 },
}
export type LabTheme = keyof typeof THEMES

function Ground({ theme }: { theme: LabTheme }) {
  const t = THEMES[theme]
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 64]} />
        <meshToonMaterial color={t.ground} />
      </mesh>
      {[2, 4, 6, 8, 10, 12].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[r - 0.015, r + 0.015, 96]} />
          <meshBasicMaterial color={t.grid} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/** 範圍標示：施放者周圍是射程，目標周圍是作用半徑 */
function RangeMarkers() {
  const rangeRef = useRef<THREE.Mesh>(null!)
  const radiusRef = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const sk = DEMO_SKILLS[lab.skillId]
    const p = lab.params[lab.skillId]
    rangeRef.current.position.set(lab.caster.x, 0.02, lab.caster.z)
    rangeRef.current.scale.setScalar(Math.max(0.1, p.range))
    const shape = sk.hit.shape
    const show = shape === 'splash' || shape === 'heal'
    radiusRef.current.visible = show
    if (show) {
      const t = lab.dummies.find((d) => d.id === (shape === 'heal' ? 'ally' : 'far'))
      if (t) radiusRef.current.position.set(t.x, 0.025, t.z)
      radiusRef.current.scale.setScalar(Math.max(0.1, p.radius))
    }
  })
  return (
    <>
      <mesh ref={rangeRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.985, 1, 96]} />
        <meshBasicMaterial color="#ffef9a" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh ref={radiusRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.97, 1, 72]} />
        <meshBasicMaterial color="#ff9a7a" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </>
  )
}

function Caster({ classId }: { classId: ClassId }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const motion = useRef<CharacterMotion>({ speed: 0, attack: 0 })
  const appearance = useMemo(() => buildAppearance('girl', classId), [classId])
  useFrame(() => {
    const c = lab.caster
    group.current.position.set(c.x, 0, c.z)
    group.current.rotation.y = c.facing
    motion.current.attack = c.attack
    const ranged = classId !== 'knight'
    body.current.position.z = Math.sin(c.attack * Math.PI) * (ranged ? -0.1 : 0.35)
  })
  return (
    <group ref={group}>
      <group ref={body}>
        <CharacterModel key={classId} appearance={appearance} motion={motion} />
      </group>
    </group>
  )
}

const POST_GEO = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8).translate(0, 0.6, 0)
const BODY_GEO = new THREE.CylinderGeometry(0.34, 0.4, 0.9, 14).translate(0, 0.95, 0)
const HEAD_GEO = new THREE.SphereGeometry(0.26, 16, 12).translate(0, 1.65, 0)
const BAR_GEO = new THREE.PlaneGeometry(1, 1)

function DummyMesh({ index }: { index: number }) {
  const g = useRef<THREE.Group>(null!)
  const mat = useRef<THREE.MeshToonMaterial>(null!)
  const bar = useRef<THREE.Group>(null!)
  const fill = useRef<THREE.Mesh>(null!)
  const d = lab.dummies[index]
  const base = d.team === 'ally' ? '#9fd7ff' : '#d9a066'
  useFrame(({ camera, clock }) => {
    const u = lab.dummies[index]
    g.current.position.set(u.x, 0, u.z)
    g.current.rotation.z = Math.sin(clock.elapsedTime * 30) * 0.12 * u.wobble
    mat.current.emissive.set(u.flash > 0 ? '#ffffff' : '#000000')
    mat.current.emissiveIntensity = u.flash > 0 ? 0.9 : 0
    bar.current.quaternion.copy(camera.quaternion)
    const r = u.hp / u.maxHp
    fill.current.scale.x = Math.max(0.001, r) * 0.9
    fill.current.position.x = (-0.9 * (1 - r)) / 2
  })
  return (
    <group ref={g}>
      <mesh geometry={POST_GEO} castShadow>
        <meshToonMaterial color="#7a5638" />
      </mesh>
      <mesh geometry={BODY_GEO} castShadow>
        <meshToonMaterial ref={mat} color={base} />
      </mesh>
      <mesh geometry={HEAD_GEO} castShadow>
        <meshToonMaterial color={base} />
      </mesh>
      <group ref={bar} position={[0, 2.15, 0]}>
        <mesh geometry={BAR_GEO} scale={[0.96, 0.12, 1]} renderOrder={10}>
          <meshBasicMaterial color="#3b2f45" transparent opacity={0.8} depthTest={false} />
        </mesh>
        <mesh ref={fill} geometry={BAR_GEO} scale={[0.9, 0.07, 1]} position={[0, 0, 0.001]} renderOrder={11}>
          <meshBasicMaterial color={d.team === 'ally' ? '#5fe08a' : '#ff5d6c'} transparent depthTest={false} />
        </mesh>
      </group>
    </group>
  )
}

/** 傷害與治療數字：畫布貼圖的精靈，循環重用 */
function Floaters() {
  const slots = useMemo(
    () =>
      lab.floaters.map(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 64
        const texture = new THREE.CanvasTexture(canvas)
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 40
        sprite.visible = false
        return { canvas, texture, material, sprite, seq: -1 }
      }),
    [],
  )
  useEffect(
    () => () => {
      for (const s of slots) {
        s.texture.dispose()
        s.material.dispose()
      }
    },
    [slots],
  )
  useFrame(() => {
    slots.forEach((s, i) => {
      const f = lab.floaters[i]
      s.sprite.visible = f.life > 0
      if (f.life <= 0) return
      if (s.seq !== f.seq) {
        s.seq = f.seq
        const ctx = s.canvas.getContext('2d')!
        ctx.clearRect(0, 0, 256, 64)
        ctx.font = `900 ${f.big ? 46 : 38}px "Microsoft JhengHei", "PingFang TC", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 8
        ctx.strokeStyle = 'rgba(60,40,70,0.9)'
        ctx.strokeText(f.text, 128, 34)
        ctx.fillStyle = f.color
        ctx.fillText(f.text, 128, 34)
        s.texture.needsUpdate = true
      }
      s.sprite.position.set(f.x, f.y, f.z)
      s.sprite.scale.set(1.5, 0.375, 1)
      s.material.opacity = Math.min(1, f.life * 3)
    })
  })
  return (
    <>
      {slots.map((s, i) => (
        <primitive key={i} object={s.sprite} />
      ))}
    </>
  )
}

/** 把 GLB 模型登記到特效世界（箭）；載入失敗時特效系統用程序化外觀 */
function ModelSlots({ world }: { world: VfxWorld }) {
  const slots = Object.values(DEMO_SKILLS).flatMap((s) => (s.projectile?.model ? [s.projectile.model] : []))
  const gltfs = useLoader(GLTFLoader, slots.map((m) => m.url), withMeshopt)
  useEffect(() => {
    slots.forEach((m, i) => {
      // 箭的原點在箭尾：移到中間，讓拖尾從箭身中段拉出
      const holder = new THREE.Group()
      const inner = prepareProp(gltfs[i].scene as THREE.Object3D, false).clone(true)
      inner.position.z = -ARROW_LENGTH / 2
      holder.add(inner)
      world.registerModel(m.key, holder, gltfs[i].animations)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs, world])
  return null
}

function VfxHost({ quality, world }: { quality: VfxQuality; world: VfxWorld }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    scene.add(world.root)
    world.prewarm(gl, scene, camera)
    lab.world = world
    return () => {
      lab.world = null
      world.root.removeFromParent()
    }
  }, [world, gl, scene, camera])
  useEffect(() => world.setQuality(quality), [world, quality])
  const fpsAcc = useRef({ t: 0, n: 0 })
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t0 = performance.now()
    updateLab(dt)
    world.update(dt, camera)
    labStats.frameMs = labStats.frameMs * 0.9 + (performance.now() - t0) * 0.1
    const a = fpsAcc.current
    a.t += dtRaw
    a.n++
    if (a.t >= 0.5) {
      labStats.fps = Math.round(a.n / a.t)
      a.t = 0
      a.n = 0
    }
    labStats.calls = gl.info.render.calls
    labStats.triangles = gl.info.render.triangles
    labStats.geometries = gl.info.memory.geometries
    labStats.textures = gl.info.memory.textures
    labStats.programs = gl.info.programs?.length ?? 0
  })
  return null
}

/** 滑鼠 / 手指拖曳轉視角、滾輪縮放；技能的鏡頭震動加在最後 */
function Controls() {
  const { camera, gl } = useThree()
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.target.set(0, 1, 3.8)
    c.enableDamping = true
    c.maxPolarAngle = Math.PI * 0.48
    c.minDistance = 3
    c.maxDistance = 30
    return c
  }, [camera, gl])
  useEffect(() => () => controls.dispose(), [controls])
  const offset = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    camera.position.sub(offset.current)
    controls.update()
    if (lab.shake > 0.001) {
      const s = lab.shake * 0.35
      offset.current.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
      lab.shake = Math.max(0, lab.shake - dt * 1.6)
    } else offset.current.set(0, 0, 0)
    camera.position.add(offset.current)
  })
  return null
}

function Lights({ theme }: { theme: LabTheme }) {
  const t = THEMES[theme]
  const sun = useRef<THREE.DirectionalLight>(null!)
  useEffect(() => {
    const cam = sun.current.shadow.camera
    cam.left = -14
    cam.right = 14
    cam.top = 14
    cam.bottom = -14
    cam.updateProjectionMatrix()
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', t.ground, t.hemi]} />
      <directionalLight ref={sun} position={[8, 16, 6]} intensity={t.sun} color="#fff1d6" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} />
    </>
  )
}

export function LabScene({ quality, theme, world, classId }: { quality: VfxQuality; theme: LabTheme; world: VfxWorld; classId: ClassId }) {
  const t = THEMES[theme]
  return (
    <Canvas shadows flat dpr={quality === 'high' ? [1, 2] : 1} camera={{ fov: 40, near: 0.1, far: 200, position: [9.5, 7, -1.5] }} gl={{ antialias: true }}>
      <color attach="background" args={[t.sky]} />
      <Lights theme={theme} />
      <Ground theme={theme} />
      <RangeMarkers />
      <Caster classId={classId} />
      {lab.dummies.map((d, i) => (
        <DummyMesh key={d.id} index={i} />
      ))}
      <LoadBoundary>
        <Suspense fallback={null}>
          <ModelSlots world={world} />
        </Suspense>
      </LoadBoundary>
      <VfxHost quality={quality} world={world} />
      <Floaters />
      <Controls />
    </Canvas>
  )
}
