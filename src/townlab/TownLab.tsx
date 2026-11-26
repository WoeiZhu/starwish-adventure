// 城鎮場景測試頁（town-lab.html）：A／B 配置切換、建築與人物比例、鏡頭高度與角度即時調整、
// 碰撞體顯示、效能數字。和遊戲共用 data/townLayout.ts 與 scene/town2/TownView.tsx。
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MERCHANT_APPEARANCE, NPC_ELDER_APPEARANCE, buildAppearance } from '../data/appearance'
import { HERO_CLASSES as CLASS_ORDER } from '../data/classes'
import { WORLD_GATE, WORLD_SCALE, collidersOf, doorOf, getLayout, type TownLayout } from '../data/townLayout'
import { runtime } from '../game/runtime'
import { CharacterModel, charScale } from '../scene/characters/CharacterModel'
import { TownView } from '../scene/town2/TownView'
import { Vista } from '../scene/Vista'

type Shot = { name: string; fx: number; fz: number; yaw: number; pitch: number; dist: number }
const deg = (d: number) => (d * Math.PI) / 180

/** 七個驗收鏡頭（本地座標；yaw 是鏡頭在主角的哪一側：0 = 南邊，往城裡看） */
function shotsOf(L: TownLayout): Shot[] {
  const g = L.gate ?? { x: L.arch!.x, z: L.arch!.z }
  const plaza = L.plaza ?? { x: 0, z: 0, r: 8 }
  const shop = L.shops.find((s) => s.id === 'weapon-shop')!
  const door = doorOf(shop.piece)
  return [
    { name: '城外遠望', fx: g.x, fz: g.z + 46, yaw: 0, pitch: 14, dist: 12 },
    { name: '接近城門', fx: g.x, fz: g.z + 13, yaw: 0.15, pitch: 22, dist: 9 },
    { name: '穿越城門', fx: g.x, fz: g.z - 0.5, yaw: 0, pitch: 20, dist: 7 },
    { name: '中央廣場', fx: plaza.x + 2, fz: plaza.z + plaza.r - 2, yaw: 0.5, pitch: 30, dist: 14 },
    { name: '商店門口', fx: door.x, fz: door.z, yaw: door.facing + 0.5, pitch: 22, dist: 7.5 },
    { name: '高角度俯視', fx: plaza.x, fz: plaza.z + 6, yaw: 0.35, pitch: 58, dist: 78 },
  ]
}

interface Cam {
  mode: 'game' | 'orbit'
  fx: number
  fz: number
  yaw: number
  pitch: number
  dist: number
  fov: number
}

function Lights({ cam }: { cam: Cam }) {
  const sun = useRef<THREE.DirectionalLight>(null!)
  useEffect(() => {
    const c = sun.current.shadow.camera
    Object.assign(c, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 })
    c.updateProjectionMatrix()
    sun.current.shadow.mapSize.set(2048, 2048)
  }, [])
  useFrame(() => {
    sun.current.position.set(cam.fx + 24, 50, cam.fz + 16)
    sun.current.target.position.set(cam.fx, 0, cam.fz)
    sun.current.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9e3a0', 1.05]} />
      <directionalLight ref={sun} color="#fff1d6" intensity={1.7} castShadow shadow-bias={-0.0006} shadow-normalBias={0.03} />
    </>
  )
}

/** 遊戲鏡頭（和 CameraRig 一樣：注視主角頭部、依俯角與距離擺放）或自由旋轉 */
function CameraCtl({ cam }: { cam: Cam }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const orbit = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    orbit.current = c
    return () => c.dispose()
  }, [camera, gl])
  useFrame(() => {
    runtime.player.x = cam.fx
    runtime.player.z = cam.fz
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov
      camera.updateProjectionMatrix()
    }
    const o = orbit.current!
    o.enabled = cam.mode === 'orbit'
    if (cam.mode === 'orbit') {
      o.update()
      return
    }
    const p = deg(cam.pitch)
    const ty = 0.95
    camera.position.set(cam.fx + Math.sin(cam.yaw) * Math.cos(p) * cam.dist, ty + Math.sin(p) * cam.dist, cam.fz + Math.cos(cam.yaw) * Math.cos(p) * cam.dist)
    camera.lookAt(cam.fx, ty, cam.fz)
    o.target.set(cam.fx, ty, cam.fz)
  })
  return null
}

/** 參考人物：主角四人在焦點、NPC 在配置的位置 */
function People({ L, cam, scaleKey }: { L: TownLayout; cam: Cam; scaleKey: number }) {
  const party = useMemo(() => CLASS_ORDER.map((c, i) => ({ c, look: buildAppearance(i % 2 ? 'boy' : 'girl', c) })), [])
  return (
    <group key={scaleKey}>
      {party.map((p, i) => (
        <group key={p.c} position={[cam.fx + (i === 0 ? 0 : (i - 2) * 1.1), 0, cam.fz + (i === 0 ? 0 : 1.6)]} rotation={[0, cam.yaw + Math.PI, 0]}>
          <CharacterModel appearance={p.look} />
        </group>
      ))}
      {L.npcs.map((n, i) => (
        <group key={i} position={[n.x, 0, n.z]} rotation={[0, n.rot, 0]}>
          <CharacterModel appearance={n.model === 'merchant' ? MERCHANT_APPEARANCE : NPC_ELDER_APPEARANCE} />
        </group>
      ))}
    </group>
  )
}

/** 碰撞體（紅框）：確認牆、建築、門洞與互動位置 */
function Colliders({ L }: { L: TownLayout }) {
  const geo = useMemo(() => {
    const pts: number[] = []
    for (const c of collidersOf(L)) {
      if (c.kind === 'box') {
        const y = 0.15
        const q = [
          [c.minX, c.minZ],
          [c.maxX, c.minZ],
          [c.maxX, c.maxZ],
          [c.minX, c.maxZ],
        ]
        for (let i = 0; i < 4; i++) pts.push(q[i][0], y, q[i][1], q[(i + 1) % 4][0], y, q[(i + 1) % 4][1])
      } else {
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2
          const a1 = ((i + 1) / 12) * Math.PI * 2
          pts.push(c.x + Math.cos(a0) * c.r, 0.15, c.z + Math.sin(a0) * c.r, c.x + Math.cos(a1) * c.r, 0.15, c.z + Math.sin(a1) * c.r)
        }
      }
    }
    for (const s of L.shops) {
      const d = doorOf(s.piece)
      pts.push(d.x - 0.5, 0.2, d.z, d.x + 0.5, 0.2, d.z, d.x, 0.2, d.z - 0.5, d.x, 0.2, d.z + 0.5)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [L])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#ff3355" depthTest={false} />
    </lineSegments>
  )
}

export const labStats = { fps: 0, calls: 0, tris: 0, geos: 0, tex: 0 }
function Stats() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ t: 0, n: 0 })
  useFrame((_, dt) => {
    acc.current.t += dt
    acc.current.n++
    if (acc.current.t > 0.5) {
      labStats.fps = Math.round(acc.current.n / acc.current.t)
      acc.current = { t: 0, n: 0 }
    }
    labStats.calls = gl.info.render.calls
    labStats.tris = gl.info.render.triangles
    labStats.geos = gl.info.memory.geometries
    labStats.tex = gl.info.memory.textures
  })
  return null
}

function Slider({ label, v, min, max, step, onChange, unit = '' }: { label: string; v: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="tl-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(+e.target.value)} />
      <b>
        {Math.round(v * 100) / 100}
        {unit}
      </b>
    </label>
  )
}

const SCALE_KEYS: [keyof typeof WORLD_SCALE, string][] = [
  ['building', '建築'],
  ['gate', '城門'],
  ['wall', '城牆'],
  ['tree', '樹'],
  ['char', '人物'],
]

export function TownLab() {
  const [id, setId] = useState<'A' | 'B'>('B')
  const [quality, setQuality] = useState<'high' | 'saver'>(() => (matchMedia('(pointer: coarse)').matches ? 'saver' : 'high'))
  const [scales, setScales] = useState({ ...WORLD_SCALE })
  const [surround, setSurround] = useState(true)
  const [showCol, setShowCol] = useState(false)
  const [panel, setPanel] = useState(true)
  const [, tick] = useState(0)
  const L = useMemo(() => {
    Object.assign(WORLD_SCALE, scales)
    charScale.value = scales.char
    return getLayout(id)
  }, [id, scales])
  const shots = useMemo(() => shotsOf(L), [L])
  const cam = useRef<Cam>({ mode: 'game', fx: 0, fz: 0, yaw: 0, pitch: 30, dist: 14, fov: 40 }).current
  const [shot, setShot] = useState(3)
  const applyShot = (i: number) => {
    setShot(i)
    Object.assign(cam, shots[i], { mode: 'game' })
    tick((n) => n + 1)
  }
  useEffect(() => applyShot(Math.min(shot, shots.length - 1)), [shots]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    ;(window as unknown as { __townlab: unknown }).__townlab = { cam, shots, applyShot, setId, setQuality, setScales, stats: labStats, setShowCol, setPanel }
  })
  const set = (k: keyof Cam, v: number) => {
    ;(cam as unknown as Record<string, number>)[k] = v
    tick((n) => n + 1)
  }
  const gx = L.gate?.x ?? L.arch?.x ?? 0
  const gz = L.gate?.z ?? L.arch?.z ?? 0

  return (
    <div className={'tl' + (panel ? ' open' : '')}>
      <div className="tl-canvas">
        <Canvas shadows={quality === 'high'} flat dpr={quality === 'high' ? [1, 2] : 1} camera={{ fov: 40, near: 0.1, far: 500, position: [0, 30, 60] }} gl={{ antialias: true }}>
          <color attach="background" args={['#d6eefa']} />
          <fog attach="fog" args={['#d6eefa', 60, 170]} />
          <Lights cam={cam} />
          <CameraCtl cam={cam} />
          <Suspense fallback={null}>
            <TownView key={id + JSON.stringify(scales)} layout={L} mode="interior" quality={quality} showSurroundings={surround} allGuards />
            <People L={L} cam={cam} scaleKey={scales.char} />
          </Suspense>
          {/* 遠景：和遊戲一樣，主線世界的山脈轉到城鎮的方位 */}
          <group position={[WORLD_GATE.x + gx, 0, WORLD_GATE.z + gz]} rotation={[0, Math.PI, 0]}>
            <Vista />
          </group>
          {showCol && <Colliders L={L} />}
          <Stats />
        </Canvas>
      </div>
      <div className="tl-top">
        <b className="tl-title">城鎮測試場</b>
        <div className="tl-seg">
          {(['B', 'A'] as const).map((x) => (
            <button key={x} className={id === x ? 'on' : ''} onClick={() => setId(x)}>
              {x === 'B' ? 'B 城牆城鎮' : 'A 開放村莊'}
            </button>
          ))}
        </div>
        <button className="tl-toggle" onClick={() => setPanel((v) => !v)}>
          {panel ? '收起' : '設定'}
        </button>
      </div>
      <div className="tl-shots">
        {shots.map((s, i) => (
          <button key={s.name} className={shot === i && cam.mode === 'game' ? 'on' : ''} onClick={() => applyShot(i)}>
            {s.name}
          </button>
        ))}
        <button className={cam.mode === 'orbit' ? 'on' : ''} onClick={() => ((cam.mode = 'orbit'), tick((n) => n + 1))}>
          自由視角
        </button>
      </div>
      {panel && (
        <aside className="tl-panel">
          <h3>{L.name}</h3>
          <section>
            <h4>比例（世界尺寸規範）</h4>
            {SCALE_KEYS.map(([k, label]) => (
              <Slider key={k} label={label} v={scales[k]} min={k === 'char' ? 0.7 : 0.8} max={k === 'char' ? 1.1 : 2.4} step={0.02} unit="×" onChange={(v) => setScales((s) => ({ ...s, [k]: v }))} />
            ))}
            <p className="tl-note">人物 {(1.4 * scales.char).toFixed(2)} m、城牆 {(1.8 * scales.wall).toFixed(1)} m、城門 {(6 * scales.gate).toFixed(1)} m、商店約 {(5.3 * scales.building).toFixed(1)} m 高</p>
          </section>
          <section>
            <h4>鏡頭</h4>
            <div className="tl-seg small">
              {[
                ['探索', 52, 16],
                ['沉浸', 28, 9],
                ['交談', 12, 4.5],
              ].map(([n, p, d]) => (
                <button key={n} onClick={() => ((cam.mode = 'game'), set('pitch', p as number), set('dist', d as number))}>
                  {n}
                </button>
              ))}
            </div>
            <Slider label="俯角" v={cam.pitch} min={5} max={80} step={1} unit="°" onChange={(v) => set('pitch', v)} />
            <Slider label="距離" v={cam.dist} min={3} max={100} step={0.5} unit=" m" onChange={(v) => set('dist', v)} />
            <Slider label="水平角" v={cam.yaw} min={-3.2} max={3.2} step={0.05} onChange={(v) => set('yaw', v)} />
            <Slider label="視角 FOV" v={cam.fov} min={25} max={70} step={1} unit="°" onChange={(v) => set('fov', v)} />
          </section>
          <section>
            <h4>顯示</h4>
            <div className="tl-seg small">
              <button className={quality === 'high' ? 'on' : ''} onClick={() => setQuality('high')}>
                高畫質
              </button>
              <button className={quality === 'saver' ? 'on' : ''} onClick={() => setQuality('saver')}>
                省電
              </button>
            </div>
            <label className="tl-check">
              <input type="checkbox" checked={surround} onChange={(e) => setSurround(e.target.checked)} /> 中景（森林、丘陵、河）
            </label>
            <label className="tl-check">
              <input type="checkbox" checked={showCol} onChange={(e) => setShowCol(e.target.checked)} /> 顯示碰撞體與門口
            </label>
          </section>
          <section className="tl-stats">
            FPS {labStats.fps}　繪製 {labStats.calls}　三角形 {(labStats.tris / 1000).toFixed(0)}k
            <br />
            幾何 {labStats.geos}　貼圖 {labStats.tex}
          </section>
        </aside>
      )}
    </div>
  )
}
