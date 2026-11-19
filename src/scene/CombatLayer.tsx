// 戰鬥畫面層：驅動戰鬥模擬，並繪製隊友、血條、鎖定圈、投射物、範圍效果與飄字。
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { buildAppearance } from '../data/appearance'
import type { ClassId } from '../data/classes'
import { ENEMY_SLOTS, FLOATER_POOL, allyId, combat, enemyAt, hero, unitById } from '../game/combat/state'
import { updateCombat } from '../game/combat/sim'
import { weaponTint } from '../game/gear'
import { progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { CharacterModel } from './characters/CharacterModel'
import { CombatFx } from './CombatFx'
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
    () => buildAppearance('girl', classId, weaponTint(classId)),
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

const HAZARD_POOL = 6

/** 怪物範圍重擊的預兆：紅色外圈標出範圍，內圈隨倒數填滿 */
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
      g.children[0].scale.setScalar(z.radius)
      g.children[2].scale.setScalar(z.radius)
      fill.scale.setScalar(Math.max(0.01, z.radius * k))
      ;(fill.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(state.clock.elapsedTime * 18) * 0.1
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

function Projectiles() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const list = combat.projectiles
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      const m = refs.current[i]
      if (!m) continue
      const p = list[i]
      m.visible = !!p && p.delay <= 0
      if (!p || !m.visible) continue
      const arrow = p.owner.classId === 'archer'
      m.geometry = arrow ? ARROW_GEO : ORB_GEO
      m.position.set(p.x, 0.75, p.z)
      m.rotation.y = Math.atan2(p.dirX, p.dirZ)
      m.scale.setScalar(p.big ? 1.7 : 1)
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
    </>
  )
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

/** 地上的掉落物：金幣旋轉、藥水與裝備上下浮動，裝備有品質顏色的光柱 */
function Drops() {
  const refs = useRef<(THREE.Group | null)[]>([])
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
      g.position.set(d.x, 0, d.z)
      body.geometry = d.kind === 'gold' ? COIN_GEO : d.kind === 'potion' ? POTION_GEO : BAG_GEO
      body.position.y = 0.35 + Math.sin(t * 3 + i) * 0.08 + (1 - pop) * 0.8
      body.rotation.y = t * (d.kind === 'gold' ? 4 : 1.5) + i
      body.scale.setScalar(pop)
      mat.color.set(d.color)
      mat.emissive.set(d.color)
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
        </group>
      ))}
    </>
  )
}

/** 傷害數字與技能名稱：每個飄字一張小畫布貼圖，循環重用 */
function Floaters() {
  const slots = useMemo(
    () =>
      Array.from({ length: FLOATER_POOL }, () => {
        const canvas = document.createElement('canvas')
        canvas.width = 256
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
      const pop = 1 + Math.max(0, f.life - 0.85) * 2
      s.sprite.position.set(f.x, f.y + (k - 1) * 0.4, f.z)
      s.sprite.scale.set(1.5 * k * pop, 0.375 * k * pop, 1)
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
      <Projectiles />
      <Zones />
      <Drops />
      <CombatFx />
      <Floaters />
    </>
  )
}
