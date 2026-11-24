// 戰鬥畫面層：驅動戰鬥模擬，並繪製隊友、血條、鎖定圈、投射物、範圍效果與飄字。
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildAppearance } from '../data/appearance'
import type { ClassId } from '../data/classes'
import { LOOT_SCALE, LOOT_URLS } from '../data/lootModels'
import { ARROW_LENGTH, ARROW_URL } from '../data/weaponModels'
import { ENEMY_SLOTS, FLOATER_POOL, allyId, combat, enemyAt, hero, unitById } from '../game/combat/state'
import { updateCombat } from '../game/combat/sim'
import { gearLook } from '../game/gear'
import { progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { CharacterModel } from './characters/CharacterModel'
import { CombatFx } from './CombatFx'
import { LoadBoundary } from './ErrorBoundary'
import { prepareProp, withMeshopt } from './gltf'
import { enemyBarTop } from './Enemy'
import type { CharacterMotion } from './characters/types'

/** 遠景時把血條與飄字放大，保持可讀 */
const uiScale = () => THREE.MathUtils.clamp(runtime.cam.dist / 11, 0.75, 2.4)

function CombatDriver() {
  const acc = useRef(0)
  const saveTimer = useRef(0)
  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    if (g.phase !== 'playing' || g.paused) return
    let dt = Math.min(dtRaw, 0.05)
    // 頓幀：命中瞬間讓戰鬥時間短暫變慢
    if (combat.hitStop > 0) {
      combat.hitStop -= dt
      dt *= 0.08
    }
    updateCombat(dt)
    acc.current += Math.min(dtRaw, 0.05)
    // 每 10 秒自動存檔
    saveTimer.current += Math.min(dtRaw, 0.05)
    if (saveTimer.current > 10) {
      saveTimer.current = 0
      g.saveGame()
    }
    if (acc.current >= 0.1) {
      acc.current = 0
      useGame.setState({ tick: g.tick + 1 })
    }
  })
  return null
}

function Ally({ classId }: { classId: ClassId }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const motion = useRef<CharacterMotion>({ speed: 0, attack: 0 })
  const gearVersion = useGame((s) => s.gearVersion)
  const appearance = useMemo(
    () => buildAppearance('girl', classId, gearLook(classId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, gearVersion],
  )
  const id = allyId(classId)

  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    const u = unitById(id)
    group.current.visible = g.phase === 'playing' && !!u
    if (!u || g.paused || g.phase !== 'playing') return
    const dt = Math.min(dtRaw, 0.05)
    group.current.position.set(u.x, 0, u.z)
    group.current.rotation.y = u.facing
    motion.current.speed = u.alive ? u.speed : 0
    motion.current.attack = u.attackAnim
    const lie = u.alive ? 0 : -Math.PI / 2
    body.current.rotation.x += (lie - body.current.rotation.x) * (1 - Math.exp(-dt * 10))
    body.current.position.y = u.alive ? 0 : 0.25
    // 出招時近戰往前踏、遠程略為後座
    body.current.position.z = Math.sin(u.attackAnim * Math.PI) * (u.ranged ? -0.1 : 0.35)
  })

  return (
    <group ref={group} visible={false}>
      <group ref={body}>
        <CharacterModel appearance={appearance} motion={motion} />
      </group>
    </group>
  )
}

const BAR_GEO = new THREE.PlaneGeometry(1, 1)

/** 頭頂血條：永遠面向相機；怪物受傷或被鎖定時顯示，隊友受傷或戰鬥中顯示 */
function HpBar({ id, slot, height, width }: { id?: string; slot?: number; height: number; width: number }) {
  const group = useRef<THREE.Group>(null!)
  const fill = useRef<THREE.Mesh>(null!)
  const fillMat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(({ camera }) => {
    const g = useGame.getState()
    const u = slot !== undefined ? enemyAt(slot) : unitById(id ?? null)
    const ratio = u ? Math.max(0, u.hp / u.maxHp) : 0
    const show =
      !!u &&
      u.alive &&
      g.phase === 'playing' &&
      (u.team === 'enemy' ? ratio < 0.999 || hero().targetId === u.id : ratio < 0.999 || combat.inCombat)
    group.current.visible = show
    if (!show || !u) return
    const s = uiScale()
    // 怪物血條高度跟著體型（精英、Boss 比較大）
    const top = u.team === 'enemy' ? enemyBarTop(u) : height
    group.current.position.set(u.x, top + (s - 1) * 0.35, u.z)
    group.current.quaternion.copy(camera.quaternion)
    group.current.scale.setScalar(s)
    fill.current.scale.x = Math.max(0.001, ratio) * width
    fill.current.position.x = (-width * (1 - ratio)) / 2
    fillMat.current.color.set(u.team === 'enemy' ? '#ff5d6c' : ratio < 0.35 ? '#ffb347' : '#5fe08a')
  })
  return (
    <group ref={group} visible={false}>
      <mesh geometry={BAR_GEO} scale={[width + 0.06, 0.13, 1]} renderOrder={10}>
        <meshBasicMaterial color="#3b2f45" transparent opacity={0.8} depthTest={false} />
      </mesh>
      <mesh ref={fill} geometry={BAR_GEO} scale={[width, 0.075, 1]} position={[0, 0, 0.001]} renderOrder={11}>
        <meshBasicMaterial ref={fillMat} color="#ff5d6c" transparent depthTest={false} />
      </mesh>
    </group>
  )
}

const HAZARD_POOL = 12
const HAZARD_RED = '#ff3b3b'

/** 怪物範圍重擊的預兆：外圈標出範圍，內圈隨倒數填滿；毒霧生效後整圈變成淡綠色並慢慢淡出 */
function Hazards() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame((state) => {
    for (let i = 0; i < HAZARD_POOL; i++) {
      const g = refs.current[i]
      if (!g) continue
      const z = combat.hazards[i]
      g.visible = !!z
      if (!z) continue
      g.position.set(z.x, 0.1, z.z)
      const fill = g.children[1] as THREE.Mesh
      const k = 1 - Math.max(0, z.delay) / z.total
      const color = z.color ?? HAZARD_RED
      g.children[0].scale.setScalar(z.radius)
      g.children[2].scale.setScalar(z.radius)
      fill.scale.setScalar(Math.max(0.01, z.radius * k))
      for (const c of g.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(color)
      const lingering = z.delay <= 0 && z.linger !== undefined
      const fade = lingering ? Math.min(1, (z.linger ?? 0) * 2) : 1
      ;(fill.material as THREE.MeshBasicMaterial).opacity =
        (lingering ? 0.22 + Math.sin(state.clock.elapsedTime * 4) * 0.05 : 0.35 + Math.sin(state.clock.elapsedTime * 18) * 0.1) * fade
      ;(((g.children[2] as THREE.Mesh).material) as THREE.MeshBasicMaterial).opacity = 0.95 * fade
    }
  })
  return (
    <>
      {Array.from({ length: HAZARD_POOL }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={false}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial color="#ff3b3b" transparent opacity={0.16} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial color="#ff3b3b" transparent opacity={0.4} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.95, 1, 48]} />
            <meshBasicMaterial color="#ff3b3b" transparent opacity={0.95} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** 主角鎖定目標腳下的紅圈 */
function TargetRing() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const t = unitById(hero().targetId)
    ref.current.visible = !!t && t.alive && useGame.getState().phase === 'playing'
    if (!t || !ref.current.visible) return
    ref.current.position.set(t.x, 0.07, t.z)
    ref.current.rotation.z = state.clock.elapsedTime * 1.5
    ref.current.scale.setScalar((t.radius + 0.4) * (1 + Math.sin(state.clock.elapsedTime * 6) * 0.06))
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.85, 1, 6]} />
      <meshBasicMaterial color="#ff5d6c" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

const PROJECTILE_POOL = 40
const ARROW_GEO = new THREE.ConeGeometry(0.08, 1, 6).rotateX(Math.PI / 2)
const ORB_GEO = new THREE.SphereGeometry(0.22, 12, 10)
/** 箭矢模型放大一點，遠景也看得到 */
const ARROW_SCALE = 1.35

/** 投射物：法術是光球；弓箭手射出武器包的箭（模型載入前或失敗時用圓錐），技能箭再加一顆彩色光球 */
function Projectiles({ arrow }: { arrow?: THREE.Object3D }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const arrows = useMemo(
    () =>
      arrow
        ? Array.from({ length: PROJECTILE_POOL }, () => {
            const g = new THREE.Group()
            const c = arrow.clone(true)
            c.position.z = -ARROW_LENGTH / 2 // 原點在箭尾：移到箭的中間
            g.add(c)
            g.visible = false
            return g
          })
        : [],
    [arrow],
  )
  useFrame(() => {
    const list = combat.projectiles
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      const m = refs.current[i]
      if (!m) continue
      const p = list[i]
      // 火球的本體由技能特效系統（SkillVfx）畫
      const shown = !!p && p.delay <= 0 && p.vfx !== 'mage_fireball'
      const a = arrows[i]
      const isArrow = shown && p.owner.classId === 'archer'
      if (a) a.visible = isArrow
      // 有箭矢模型時，普通箭只畫模型；技能箭（big）另外畫一顆小光球表示屬性顏色
      m.visible = shown && (!a || !isArrow || p.big)
      if (!shown) continue
      const yaw = Math.atan2(p.dirX, p.dirZ)
      if (a && isArrow) {
        a.position.set(p.x, 0.75, p.z)
        a.rotation.y = yaw
        a.scale.setScalar(ARROW_SCALE * (p.big ? 1.4 : 1))
      }
      m.geometry = isArrow && !a ? ARROW_GEO : ORB_GEO
      m.position.set(p.x, 0.75, p.z)
      m.rotation.y = yaw
      m.scale.setScalar(isArrow && a ? 0.55 : p.big ? 1.7 : 1)
      ;(m.material as THREE.MeshBasicMaterial).color.set(p.color)
    }
  })
  return (
    <>
      {Array.from({ length: PROJECTILE_POOL }, (_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={ORB_GEO} visible={false}>
          <meshBasicMaterial />
        </mesh>
      ))}
      {arrows.map((a, i) => (
        <primitive key={`a${i}`} object={a} />
      ))}
    </>
  )
}

function ArrowProjectiles() {
  const gltf = useLoader(GLTFLoader, ARROW_URL, withMeshopt)
  return <Projectiles arrow={prepareProp(gltf.scene, false)} />
}

const ZONE_POOL = 8

function Zones() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame((state) => {
    for (let i = 0; i < ZONE_POOL; i++) {
      const g = refs.current[i]
      if (!g) continue
      const z = combat.zones[i]
      g.visible = !!z
      if (!z) continue
      g.position.set(z.x, 0.08, z.z)
      g.scale.setScalar(z.radius)
      const fade = Math.min(1, z.time * 6, (z.duration - z.time) * 4)
      const disc = g.children[0] as THREE.Mesh
      const ring = g.children[1] as THREE.Mesh
      const dm = disc.material as THREE.MeshBasicMaterial
      const rm = ring.material as THREE.MeshBasicMaterial
      dm.color.set(z.color)
      rm.color.set(z.color)
      dm.opacity = fade * (0.22 + Math.sin(state.clock.elapsedTime * 10) * 0.06)
      rm.opacity = fade * 0.9
      ring.rotation.z = state.clock.elapsedTime * 0.8
    }
  })
  return (
    <>
      {Array.from({ length: ZONE_POOL }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={false}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial transparent depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.94, 1, 48]} />
            <meshBasicMaterial transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

const DROP_POOL = 24
const COIN_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14).rotateX(Math.PI / 2)
const POTION_GEO = new THREE.SphereGeometry(0.16, 12, 10)
const BAG_GEO = new THREE.OctahedronGeometry(0.22, 0)
const BEAM_GEO = new THREE.CylinderGeometry(0.07, 0.16, 2.4, 10, 1, true).translate(0, 1.2, 0)

type DropModels = Record<'coin' | 'potion' | 'pouch' | 'bundle', THREE.Object3D>
const DROP_MODEL_KEYS = ['coin', 'potion', 'pouch', 'bundle'] as const
/** 模型底部到中心的高度（已乘上 LOOT_SCALE）：浮動時以中心對齊原本的程序化物件 */
const DROP_CENTER: Record<(typeof DROP_MODEL_KEYS)[number], number> = { coin: 0.17, potion: 0.18, pouch: 0.18, bundle: 0.2 }

/** 掉落物用哪個模型：金幣、藥水；飾品裝在小布袋，武器與防具是裝備包 */
function dropModel(d: (typeof combat.drops)[number]) {
  return d.kind === 'gold' ? 'coin' : d.kind === 'potion' ? 'potion' : d.item?.slot === 'accessory' ? 'pouch' : 'bundle'
}

/** 地上的掉落物：金幣旋轉、藥水與裝備上下浮動，裝備有品質顏色的光柱。有模型時用模型，載入前用程序化物件 */
function Drops({ models }: { models?: DropModels }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  // 每個欄位各複製一份四種模型，用顯示 / 隱藏切換（共用幾何體與材質）
  const slots = useMemo(
    () =>
      models
        ? Array.from({ length: DROP_POOL }, () =>
            Object.fromEntries(
              DROP_MODEL_KEYS.map((k) => {
                const g = new THREE.Group()
                g.add(models[k].clone(true))
                g.scale.setScalar(LOOT_SCALE[k] ?? 1)
                g.visible = false
                return [k, g]
              }),
            ) as Record<(typeof DROP_MODEL_KEYS)[number], THREE.Group>,
          )
        : [],
    [models],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < DROP_POOL; i++) {
      const g = refs.current[i]
      if (!g) continue
      const d = combat.drops[i]
      g.visible = !!d
      if (!d) continue
      const body = g.children[0] as THREE.Mesh
      const beam = g.children[1] as THREE.Mesh
      const mat = body.material as THREE.MeshToonMaterial
      const pop = Math.min(1, d.age * 4)
      const y = 0.35 + Math.sin(t * 3 + i) * 0.08 + (1 - pop) * 0.8
      const spin = t * (d.kind === 'gold' ? 4 : 1.5) + i
      g.position.set(d.x, 0, d.z)
      const slot = slots[i]
      body.visible = !slot
      if (slot) {
        const want = dropModel(d)
        for (const k of DROP_MODEL_KEYS) {
          const m = slot[k]
          m.visible = k === want
          if (k !== want) continue
          m.position.y = y - DROP_CENTER[k] * pop
          m.rotation.y = spin
          m.scale.setScalar((LOOT_SCALE[k] ?? 1) * pop)
        }
      } else {
        body.geometry = d.kind === 'gold' ? COIN_GEO : d.kind === 'potion' ? POTION_GEO : BAG_GEO
        body.position.y = y
        body.rotation.y = spin
        body.scale.setScalar(pop)
        mat.color.set(d.color)
        mat.emissive.set(d.color)
      }
      beam.visible = d.kind === 'item'
      ;(beam.material as THREE.MeshBasicMaterial).color.set(d.color)
    }
  })
  return (
    <>
      {Array.from({ length: DROP_POOL }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={false}>
          <mesh geometry={COIN_GEO} castShadow>
            <meshToonMaterial emissiveIntensity={0.35} />
          </mesh>
          <mesh geometry={BEAM_GEO}>
            <meshBasicMaterial transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {slots[i] && DROP_MODEL_KEYS.map((k) => <primitive key={k} object={slots[i][k]} />)}
        </group>
      ))}
    </>
  )
}

function DropModelsLoader() {
  const urls = DROP_MODEL_KEYS.map((k) => LOOT_URLS[k])
  const gltfs = useLoader(GLTFLoader, urls, withMeshopt)
  const models = useMemo(
    () => Object.fromEntries(DROP_MODEL_KEYS.map((k, i) => [k, prepareProp(gltfs[i].scene as THREE.Object3D)])) as DropModels,
    [gltfs],
  )
  return <Drops models={models} />
}

/** 模型載入前和失敗時都退回程序化的版本 */
function WithFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <LoadBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LoadBoundary>
  )
}

/** 飄字畫布寬度：夠放下 7～8 個字的裝備名稱（原本 256 會切掉長名稱） */
const FLOATER_W = 512

/** 傷害數字與技能名稱：每個飄字一張小畫布貼圖，循環重用 */
function Floaters() {
  const slots = useMemo(
    () =>
      Array.from({ length: FLOATER_POOL }, () => {
        const canvas = document.createElement('canvas')
        canvas.width = FLOATER_W
        canvas.height = 64
        const texture = new THREE.CanvasTexture(canvas)
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 20
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
    const k = uiScale()
    slots.forEach((s, i) => {
      const f = combat.floaters[i]
      s.sprite.visible = f.life > 0
      if (f.life <= 0) return
      if (s.seq !== f.seq) {
        s.seq = f.seq
        const ctx = s.canvas.getContext('2d')!
        ctx.clearRect(0, 0, FLOATER_W, 64)
        const face = '"Microsoft JhengHei", "PingFang TC", sans-serif'
        const base = f.big ? 46 : 38
        ctx.font = `900 ${base}px ${face}`
        // 名稱太長（例如「傳說的星輝聖劍」）就縮小字體，保證整行放得進畫布，不會被切掉
        const w = ctx.measureText(f.text).width
        const fit = FLOATER_W - 24
        if (w > fit) ctx.font = `900 ${Math.floor((base * fit) / w)}px ${face}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 8
        ctx.strokeStyle = 'rgba(60,40,70,0.9)'
        ctx.strokeText(f.text, FLOATER_W / 2, 34)
        ctx.fillStyle = f.color
        ctx.fillText(f.text, FLOATER_W / 2, 34)
        s.texture.needsUpdate = true
      }
      const pop = 1 + Math.max(0, f.life - 0.85) * 2
      s.sprite.position.set(f.x, f.y + (k - 1) * 0.4, f.z)
      s.sprite.scale.set((FLOATER_W / 256) * 1.5 * k * pop, 0.375 * k * pop, 1)
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

export function CombatLayer() {
  const partyVersion = useGame((s) => s.partyVersion)
  // 隊友名單依招募進度變動（partyVersion 在招募、開新局、讀檔時遞增）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allies = useMemo(() => [...progress.recruited], [partyVersion])
  return (
    <>
      <CombatDriver />
      {allies.map((c) => (
        <Ally key={c} classId={c} />
      ))}
      {allies.map((c) => (
        <HpBar key={c} id={allyId(c)} height={1.72} width={0.8} />
      ))}
      <HpBar id="hero" height={1.72} width={0.8} />
      {Array.from({ length: ENEMY_SLOTS }, (_, i) => (
        <HpBar key={i} slot={i} height={1.15} width={1} />
      ))}
      <Hazards />
      <TargetRing />
      <WithFallback fallback={<Projectiles />}>
        <ArrowProjectiles />
      </WithFallback>
      <Zones />
      <WithFallback fallback={<Drops />}>
        <DropModelsLoader />
      </WithFallback>
      <CombatFx />
      <Floaters />
    </>
  )
}
