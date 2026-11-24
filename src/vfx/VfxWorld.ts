// 特效世界：持有所有特效物件池，提供「放一個刀光」「放一個魔法陣」之類的方法，每幀更新。
// 只依賴 three：遊戲（scene/SkillVfx.tsx）和技能測試頁（src/lab）各自建立一份。
import * as THREE from 'three'
import { ParticleLayer, type ParticleSpawn } from './particles'
import { SlotPool, type Pooled } from './pool'
import { BUDGETS, MAX_ADD_PARTICLES, MAX_ALPHA_PARTICLES, MAX_TRAIL_POINTS, type VfxQuality } from './quality'
import { circleMaterial, haloMaterial, pillarMaterial, ringMaterial, slashMaterial, trailMaterial } from './shaders'
import type { FxParams } from './types'

const colorCache = new Map<string, THREE.Color>()
/** 字串顏色 → 線性空間的 THREE.Color（快取，不要修改回傳值） */
export function col(c: string) {
  let v = colorCache.get(c)
  if (!v) {
    v = new THREE.Color(c)
    colorCache.set(c, v)
  }
  return v
}

// ── 共用幾何體 ──
// 刀光掃過的角度：從右手側掃到左手側（太大會繞到背後）
const SLASH_ARC = THREE.MathUtils.degToRad(150)
function slashGeometry(inner = 0.45, segs = 40) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const u = i / segs
    const a = -SLASH_ARC / 2 + u * SLASH_ARC
    for (const v of [0, 1]) {
      const r = inner + (1 - inner) * v
      // 弧以 +Z（前方）為中心，u = 0 在角色的右手側（面向 +Z 時是 -X）
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r)
      uv.push(u, v)
    }
    if (i < segs) {
      const k = i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
const SLASH_GEO = slashGeometry()
const FLAT_GEO = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
const PILLAR_GEO = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0)
const QUAD_GEO = new THREE.PlaneGeometry(2, 2)
const CORE_GEO = new THREE.SphereGeometry(1, 16, 12)

// ── 池裡的物件 ──
interface MeshItem extends Pooled {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  dur: number
}
interface SlashItem extends MeshItem {}
interface CircleItem extends MeshItem {
  radius: number
}
interface RingItem extends MeshItem {
  r0: number
}
interface PillarItem extends MeshItem {
  radius: number
  height: number
}
interface TrailItem extends Pooled {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  geo: THREE.BufferGeometry
  pts: Float32Array
  n: number
  width: number
  following: boolean
  shrink: number
}
interface OrbItem extends Pooled {
  group: THREE.Group
  core: THREE.Mesh
  coreMat: THREE.MeshBasicMaterial
  halo: THREE.Mesh
  haloMat: THREE.ShaderMaterial
}
interface ModelItem extends Pooled {
  holder: THREE.Group
  mixer: THREE.AnimationMixer | null
  life: number
  tracked: boolean
}
interface ModelKind {
  template: THREE.Object3D
  clips: THREE.AnimationClip[]
  pool: SlotPool<ModelItem>
}

export type TrackStyle = 'arrow' | 'fireball'

/** 跟著投射物飛的特效：拖尾＋（可選）本體，release 後拖尾自然縮短消失 */
export interface Tracker {
  alive: boolean
  style: TrackStyle
  p: FxParams
  x: number
  y: number
  z: number
  yaw: number
  trail: TrailItem | null
  orb: OrbItem | null
  model: ModelItem | null
  emit: number
}

export interface SlashOpts {
  x: number
  y: number
  z: number
  facing: number
  reach: number
  color: string
  color2: string
  duration: number
  /** 刀光平面的傾斜（弧度）：0 = 水平橫劈 */
  tilt?: number
  /** 由左往右掃 */
  flip?: boolean
  /** 刀身寬度：內半徑比例（0.45 = 預設） */
  opacity?: number
}

export interface BurstOpts {
  x: number
  y: number
  z: number
  count: number
  speed: number
  color: string
  color2?: string
  size: number
  life: number
  /** 往上的初速 */
  up?: number
  gravity?: number
  drag?: number
  stretch?: number
  /** 出生位置的隨機半徑 */
  spread?: number
  add?: boolean
  /** 只往這個方向噴（弧度）與錐角 */
  dir?: number
  cone?: number
  alpha?: number
}

export class VfxWorld {
  readonly root = new THREE.Group()
  quality: VfxQuality = 'high'
  /** 加亮與一般混合的粒子層 */
  readonly add: ParticleLayer
  readonly soft: ParticleLayer
  private readonly slashes: SlotPool<SlashItem>
  private readonly trails: SlotPool<TrailItem>
  private readonly circles: SlotPool<CircleItem>
  private readonly rings: SlotPool<RingItem>
  private readonly pillars: SlotPool<PillarItem>
  private readonly orbs: SlotPool<OrbItem>
  private readonly models = new Map<string, ModelKind>()
  private readonly trackers: Tracker[] = []
  private time = 0
  private readonly ownMaterials: THREE.Material[] = []
  private readonly ownGeometries: THREE.BufferGeometry[] = []
  private readonly tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), cam: new THREE.Vector3() }

  constructor(quality: VfxQuality = 'high') {
    this.root.name = 'VfxWorld'
    const b = BUDGETS[quality]
    this.soft = new ParticleLayer(MAX_ALPHA_PARTICLES, b.alphaParticles, THREE.NormalBlending, 0.35, 30)
    this.add = new ParticleLayer(MAX_ADD_PARTICLES, b.addParticles, THREE.AdditiveBlending, 0.8, 31)
    this.root.add(this.soft.mesh, this.add.mesh)

    const meshItem = <T extends MeshItem>(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, order: number, extra: Omit<T, keyof MeshItem>) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.renderOrder = order
      this.root.add(mesh)
      this.ownMaterials.push(mat)
      return { alive: false, age: 0, mesh, mat, dur: 1, ...extra } as unknown as T
    }
    this.slashes = new SlotPool(() => meshItem<SlashItem>(SLASH_GEO, slashMaterial(), 26, {}), b.slashes)
    this.circles = new SlotPool(() => meshItem<CircleItem>(FLAT_GEO, circleMaterial(), 20, { radius: 1 }), b.circles)
    this.rings = new SlotPool(() => meshItem<RingItem>(FLAT_GEO, ringMaterial(), 21, { r0: 0 }), b.rings)
    this.pillars = new SlotPool(() => meshItem<PillarItem>(PILLAR_GEO, pillarMaterial(), 24, { radius: 1, height: 1 }), b.pillars)
    this.trails = new SlotPool(() => this.makeTrail(), b.trails)
    this.orbs = new SlotPool(() => this.makeOrb(), b.orbs)
  }

  setQuality(q: VfxQuality) {
    this.quality = q
    const b = BUDGETS[q]
    this.soft.budget = b.alphaParticles
    this.add.budget = b.addParticles
    this.slashes.cap = b.slashes
    this.trails.cap = b.trails
    this.circles.cap = b.circles
    this.rings.cap = b.rings
    this.pillars.cap = b.pillars
    this.orbs.cap = b.orbs
    for (const m of this.models.values()) m.pool.cap = b.models
  }

  get spawnScale() {
    return BUDGETS[this.quality].spawnScale
  }
  color(c: string) {
    return col(c)
  }
  /** 依畫質換算粒子數量（至少 1 個） */
  n(count: number) {
    return Math.max(1, Math.round(count * this.spawnScale))
  }

  // ── 粒子 ──
  particle(o: ParticleSpawn, add = false) {
    ;(add ? this.add : this.soft).spawn(o)
  }

  burst(o: BurstOpts) {
    const n = this.n(o.count)
    const c0 = col(o.color)
    const c1 = col(o.color2 ?? o.color)
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.cone ?? 1) : Math.random() * Math.PI * 2
      const s = o.speed * (0.35 + Math.random() * 0.85)
      const r = (o.spread ?? 0) * Math.sqrt(Math.random())
      const ra = Math.random() * Math.PI * 2
      this.particle(
        {
          x: o.x + Math.cos(ra) * r,
          y: o.y,
          z: o.z + Math.sin(ra) * r,
          // 方向角和遊戲一致：0 = +Z
          vx: Math.sin(a) * s,
          vz: Math.cos(a) * s,
          vy: (o.up ?? 0) * (0.3 + Math.random() * 0.9),
          life: o.life * (0.6 + Math.random() * 0.6),
          size: o.size * (0.6 + Math.random() * 0.8),
          color: c0,
          color2: c1,
          gravity: o.gravity ?? 0,
          drag: o.drag ?? 2,
          stretch: o.stretch,
          alpha: o.alpha,
        },
        o.add,
      )
    }
  }

  /** 往中心收束的粒子（集氣） */
  converge(x: number, y: number, z: number, count: number, radius: number, life: number, color: string, size: number, add = true) {
    const n = this.n(count)
    const c0 = col(color)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const dx = Math.cos(a) * s
      const dy = u
      const dz = Math.sin(a) * s
      const r = radius * (0.7 + Math.random() * 0.5)
      const l = life * (0.7 + Math.random() * 0.3)
      this.particle(
        { x: x + dx * r, y: y + dy * r, z: z + dz * r, vx: (-dx * r) / l, vy: (-dy * r) / l, vz: (-dz * r) / l, life: l, size, size1: size * 0.3, color: c0, color2: col('#ffffff'), stretch: 1.5 },
        add,
      )
    }
  }

  /** 球形閃光：一顆很大、很短命的粒子 */
  flash(x: number, y: number, z: number, color: string, size: number, life = 0.16, add = true) {
    this.particle({ x, y, z, life, size: size * 0.5, size1: size, color: col(color), alpha: 1 }, add)
  }

  // ── 形狀 ──
  slash(o: SlashOpts) {
    const it = this.slashes.acquire()
    it.alive = true
    it.age = 0
    it.dur = Math.max(0.05, o.duration)
    it.mesh.visible = true
    it.mesh.position.set(o.x, o.y, o.z)
    it.mesh.rotation.set(0, o.facing, o.tilt ?? 0, 'YXZ')
    it.mesh.scale.set(o.flip ? -o.reach : o.reach, o.reach, o.reach)
    it.mat.uniforms.uColor.value.copy(col(o.color))
    it.mat.uniforms.uColor2.value.copy(col(o.color2))
    it.mat.uniforms.uOpacity.value = o.opacity ?? 1
    it.mat.uniforms.uProgress.value = 0
  }

  /** 地面魔法陣 */
  circle(x: number, y: number, z: number, radius: number, color: string, color2: string, duration: number) {
    const it = this.circles.acquire()
    it.alive = true
    it.age = 0
    it.dur = Math.max(0.1, duration)
    it.radius = radius
    it.mesh.visible = true
    it.mesh.position.set(x, y + 0.035, z)
    it.mesh.rotation.set(0, 0, 0)
    it.mat.uniforms.uColor.value.copy(col(color))
    it.mat.uniforms.uColor2.value.copy(col(color2))
  }

  /** 地面衝擊波：半徑 r0 → r1 */
  shockwave(x: number, y: number, z: number, r0: number, r1: number, color: string, duration: number, width = 0.12) {
    const it = this.rings.acquire()
    it.alive = true
    it.age = 0
    it.dur = Math.max(0.05, duration)
    it.r0 = r0 / Math.max(0.01, r1)
    it.mesh.visible = true
    it.mesh.position.set(x, y + 0.045, z)
    it.mesh.scale.setScalar(r1)
    it.mat.uniforms.uColor.value.copy(col(color))
    it.mat.uniforms.uWidth.value = width
  }

  /** 從地面升起的光柱 */
  pillar(x: number, z: number, radius: number, height: number, color: string, color2: string, duration: number) {
    const it = this.pillars.acquire()
    it.alive = true
    it.age = 0
    it.dur = Math.max(0.1, duration)
    it.radius = radius
    it.height = height
    it.mesh.visible = true
    it.mesh.position.set(x, 0.02, z)
    it.mat.uniforms.uColor.value.copy(col(color))
    it.mat.uniforms.uColor2.value.copy(col(color2))
  }

  // ── 拖尾 ──
  private makeTrail(): TrailItem {
    const N = MAX_TRAIL_POINTS
    const geo = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)
    pos.setUsage(THREE.DynamicDrawUsage)
    const uv = new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2)
    uv.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', pos)
    geo.setAttribute('uv', uv)
    const idx: number[] = []
    for (let i = 0; i < N - 1; i++) {
      const k = i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
    geo.setIndex(idx)
    geo.setDrawRange(0, 0)
    const mat = trailMaterial()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = 25
    this.root.add(mesh)
    this.ownMaterials.push(mat)
    this.ownGeometries.push(geo)
    return { alive: false, age: 0, mesh, mat, geo, pts: new Float32Array(N * 3), n: 0, width: 0.2, following: false, shrink: 0 }
  }

  trailStart(x: number, y: number, z: number, width: number, color: string, color2: string, opacity = 1) {
    const it = this.trails.acquire()
    it.alive = true
    it.age = 0
    it.following = true
    it.width = width
    it.shrink = 0
    it.n = 1
    it.pts[0] = x
    it.pts[1] = y
    it.pts[2] = z
    it.mesh.visible = false
    it.mat.uniforms.uColor.value.copy(col(color))
    it.mat.uniforms.uColor2.value.copy(col(color2))
    it.mat.uniforms.uOpacity.value = opacity
    return it
  }

  trailPush(it: TrailItem, x: number, y: number, z: number) {
    const max = BUDGETS[this.quality].trailPoints
    const p = it.pts
    const dx = x - p[0]
    const dy = y - p[1]
    const dz = z - p[2]
    // 移動很少時只更新頭的位置，點的間距保持均勻
    if (it.n > 1 && dx * dx + dy * dy + dz * dz < 0.0225) {
      p[0] = x
      p[1] = y
      p[2] = z
      return
    }
    const n = Math.min(it.n + 1, max)
    p.copyWithin(3, 0, (n - 1) * 3)
    p[0] = x
    p[1] = y
    p[2] = z
    it.n = n
  }

  trailEnd(it: TrailItem) {
    it.following = false
  }

  private buildTrail(it: TrailItem, cam: THREE.Vector3) {
    const { a, b, c } = this.tmp
    const p = it.pts
    const n = it.n
    if (n < 2) {
      it.mesh.visible = false
      return
    }
    const pos = it.geo.getAttribute('position') as THREE.BufferAttribute
    const uv = it.geo.getAttribute('uv') as THREE.BufferAttribute
    const P = pos.array as Float32Array
    const U = uv.array as Float32Array
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1) * 3
      const i1 = Math.min(n - 1, i + 1) * 3
      a.set(p[i0] - p[i1], p[i0 + 1] - p[i1 + 1], p[i0 + 2] - p[i1 + 2]) // 切線
      b.set(cam.x - p[i * 3], cam.y - p[i * 3 + 1], cam.z - p[i * 3 + 2]) // 往鏡頭
      c.crossVectors(a, b)
      const len = c.length() || 1
      const h = 1 - i / (n - 1)
      const w = (it.width * Math.pow(h, 0.6)) / 2 / len
      const k = i * 6
      P[k] = p[i * 3] + c.x * w
      P[k + 1] = p[i * 3 + 1] + c.y * w
      P[k + 2] = p[i * 3 + 2] + c.z * w
      P[k + 3] = p[i * 3] - c.x * w
      P[k + 4] = p[i * 3 + 1] - c.y * w
      P[k + 5] = p[i * 3 + 2] - c.z * w
      U[i * 4] = h
      U[i * 4 + 1] = 0
      U[i * 4 + 2] = h
      U[i * 4 + 3] = 1
    }
    pos.needsUpdate = true
    uv.needsUpdate = true
    it.geo.setDrawRange(0, (n - 1) * 6)
    it.mesh.visible = true
  }

  // ── 火球本體（核心球＋光暈） ──
  private makeOrb(): OrbItem {
    const group = new THREE.Group()
    const coreMat = new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false, fog: false })
    const core = new THREE.Mesh(CORE_GEO, coreMat)
    const haloMat = haloMaterial()
    const halo = new THREE.Mesh(QUAD_GEO, haloMat)
    halo.renderOrder = 27
    halo.frustumCulled = false
    group.add(core, halo)
    group.visible = false
    this.root.add(group)
    this.ownMaterials.push(coreMat, haloMat)
    return { alive: false, age: 0, group, core, coreMat, halo, haloMat }
  }

  // ── GLB 模型特效（Meshy / Blender 產生的投射物、爆炸碎片等） ──
  /** 登記一個模型；之後投射物或 spawnModel 可以用 key 取用。沒有登記時自動退回程序化外觀 */
  registerModel(key: string, template: THREE.Object3D, clips: THREE.AnimationClip[] = []) {
    if (this.models.has(key)) return
    const pool = new SlotPool<ModelItem>(() => {
      const holder = new THREE.Group()
      const inst = template.clone(true)
      holder.add(inst)
      holder.visible = false
      this.root.add(holder)
      return { alive: false, age: 0, holder, mixer: clips.length ? new THREE.AnimationMixer(inst) : null, life: 0, tracked: false }
    }, BUDGETS[this.quality].models)
    this.models.set(key, { template, clips, pool })
  }
  hasModel(key: string) {
    return this.models.has(key)
  }

  /** 放一個模型特效；clip 是 GLB 裡的動畫名稱（沒有就不播） */
  spawnModel(key: string, x: number, y: number, z: number, yaw: number, scale: number, life: number, clip?: string) {
    const kind = this.models.get(key)
    if (!kind) return null
    const it = kind.pool.acquire()
    it.alive = true
    it.age = 0
    it.life = life
    it.tracked = false
    it.holder.visible = true
    it.holder.position.set(x, y, z)
    it.holder.rotation.set(0, yaw, 0)
    it.holder.scale.setScalar(scale)
    if (it.mixer) {
      it.mixer.stopAllAction()
      const c = clip ? kind.clips.find((k) => k.name === clip) : kind.clips[0]
      if (c) {
        const action = it.mixer.clipAction(c)
        action.reset().play()
      }
    }
    return it
  }

  // ── 投射物追蹤 ──
  /**
   * 開始追蹤一個投射物。body = false 時只畫拖尾與粒子（本體由別處畫，例如遊戲裡的箭矢模型）。
   * 有登記 modelKey 的模型時，本體用模型。
   */
  track(style: TrackStyle, p: FxParams, x: number, y: number, z: number, yaw: number, body: boolean, modelKey?: string, modelScale = 1): Tracker {
    const s = p.size
    let tr = this.trackers.find((t) => !t.alive)
    if (!tr) {
      tr = { alive: false, style, p, x, y, z, yaw, trail: null, orb: null, model: null, emit: 0 }
      this.trackers.push(tr)
    }
    tr.alive = true
    tr.style = style
    tr.p = p
    tr.x = x
    tr.y = y
    tr.z = z
    tr.yaw = yaw
    tr.emit = 0
    tr.trail =
      style === 'fireball'
        ? this.trailStart(x, y, z, 0.42 * s, p.color, p.color2, 0.9)
        : this.trailStart(x, y, z, 0.17 * s, p.color2, p.color, 1)
    tr.orb = null
    tr.model = null
    if (body) {
      if (modelKey && this.models.has(modelKey)) {
        tr.model = this.spawnModel(modelKey, x, y, z, yaw, modelScale * s, 999)
        if (tr.model) tr.model.tracked = true
      } else {
        const orb = this.orbs.acquire()
        orb.alive = true
        orb.age = 0
        orb.group.visible = true
        const fire = style === 'fireball'
        orb.core.scale.set(fire ? 0.13 * s : 0.03 * s, fire ? 0.13 * s : 0.03 * s, fire ? 0.13 * s : 0.42 * s)
        orb.coreMat.color.copy(col(fire ? '#ffe7a0' : p.color2))
        orb.haloMat.uniforms.uColor.value.copy(col(p.color))
        orb.haloMat.uniforms.uSize.value = (fire ? 0.72 : 0.22) * s
        orb.haloMat.uniforms.uAlpha.value = fire ? 0.95 : 0.7
        tr.orb = orb
      }
    }
    this.placeTracker(tr)
    return tr
  }

  move(tr: Tracker, x: number, y: number, z: number) {
    if (!tr.alive) return
    const dx = x - tr.x
    const dz = z - tr.z
    if (dx * dx + dz * dz > 1e-6) tr.yaw = Math.atan2(dx, dz)
    tr.x = x
    tr.y = y
    tr.z = z
    if (tr.trail) this.trailPush(tr.trail, x, y, z)
    this.placeTracker(tr)
  }

  untrack(tr: Tracker) {
    if (!tr.alive) return
    tr.alive = false
    if (tr.trail) this.trailEnd(tr.trail)
    if (tr.orb) {
      tr.orb.alive = false
      tr.orb.group.visible = false
    }
    if (tr.model) {
      tr.model.alive = false
      tr.model.holder.visible = false
    }
    tr.trail = tr.orb = tr.model = null
  }

  private placeTracker(tr: Tracker) {
    if (tr.orb) {
      tr.orb.group.position.set(tr.x, tr.y, tr.z)
      tr.orb.group.rotation.set(0, tr.yaw, 0)
    }
    if (tr.model) {
      tr.model.holder.position.set(tr.x, tr.y, tr.z)
      tr.model.holder.rotation.set(0, tr.yaw, 0)
    }
  }

  private updateTracker(tr: Tracker, dt: number) {
    const p = tr.p
    const s = p.size
    tr.emit += dt
    if (tr.style === 'fireball') {
      // 火球：持續噴出火星與少量煙
      const step = 1 / (70 * this.spawnScale)
      while (tr.emit > step) {
        tr.emit -= step
        const r = 0.12 * s
        this.particle(
          {
            x: tr.x + (Math.random() - 0.5) * r,
            y: tr.y + (Math.random() - 0.5) * r,
            z: tr.z + (Math.random() - 0.5) * r,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 0.6 + Math.random() * 0.9,
            vz: (Math.random() - 0.5) * 0.8,
            life: 0.35 + Math.random() * 0.25,
            size: 0.26 * s,
            size1: 0.05 * s,
            color: col(p.color2),
            color2: col(p.color),
            drag: 1.5,
          },
          true,
        )
        if (Math.random() < 0.25)
          this.particle({ x: tr.x, y: tr.y, z: tr.z, vy: 0.5, life: 0.7, size: 0.18 * s, size1: 0.5 * s, color: col('#8a7a74'), alpha: 0.35, drag: 1 })
      }
      if (tr.orb) {
        // 火焰閃爍
        const k = 1 + Math.sin(this.time * 38) * 0.08 + Math.sin(this.time * 23) * 0.06
        tr.orb.haloMat.uniforms.uSize.value = 0.72 * s * k
      }
    } else {
      // 箭：偶爾灑出一點光屑
      const step = 1 / (22 * this.spawnScale)
      while (tr.emit > step) {
        tr.emit -= step
        this.particle({ x: tr.x, y: tr.y, z: tr.z, vy: -0.2, life: 0.3, size: 0.07 * s, color: col(p.color2), color2: col(p.color), drag: 2 }, true)
      }
    }
  }

  // ── 每幀更新 ──
  update(dt: number, camera: THREE.Camera) {
    this.time += dt
    const cam = camera.getWorldPosition(this.tmp.cam)
    this.soft.update(dt)
    this.add.update(dt)
    this.slashes.forEachAlive((it) => {
      it.age += dt
      const t = it.age / it.dur
      if (t >= 1) return this.kill(it)
      it.mat.uniforms.uProgress.value = t
    })
    this.circles.forEachAlive((it) => {
      it.age += dt
      const t = it.age / it.dur
      if (t >= 1) return this.kill(it)
      // 出現時由小變大、最後 25% 淡出
      const grow = 1 - Math.pow(1 - Math.min(1, it.age / 0.18), 3)
      it.mesh.scale.setScalar(it.radius * (0.55 + 0.45 * grow))
      it.mesh.rotation.y += dt * 0.6
      it.mat.uniforms.uTime.value = this.time
      it.mat.uniforms.uAlpha.value = Math.min(1, it.age / 0.1) * Math.min(1, (1 - t) / 0.25)
    })
    this.rings.forEachAlive((it) => {
      it.age += dt
      const t = it.age / it.dur
      if (t >= 1) return this.kill(it)
      const e = 1 - Math.pow(1 - t, 2.4)
      it.mat.uniforms.uProgress.value = it.r0 + (1 - it.r0) * e
      it.mat.uniforms.uAlpha.value = 1 - t * t
    })
    this.pillars.forEachAlive((it) => {
      it.age += dt
      const t = it.age / it.dur
      if (t >= 1) return this.kill(it)
      const grow = 1 - Math.pow(1 - Math.min(1, t / 0.25), 3)
      const thin = 1 - Math.max(0, t - 0.6) * 1.2
      it.mesh.scale.set(it.radius * thin, it.height * (0.2 + 0.8 * grow), it.radius * thin)
      it.mat.uniforms.uTime.value = this.time
      it.mat.uniforms.uAlpha.value = Math.min(1, t * 8) * Math.min(1, (1 - t) / 0.35)
    })
    for (const tr of this.trackers) if (tr.alive) this.updateTracker(tr, dt)
    this.trails.forEachAlive((it) => {
      it.age += dt
      if (!it.following) {
        // 投射物消失後：從尾巴一點一點收掉
        it.shrink += dt * 60
        while (it.shrink >= 1 && it.n > 0) {
          it.shrink -= 1
          it.n--
        }
        if (it.n < 2) {
          it.alive = false
          it.mesh.visible = false
          return
        }
      }
      this.buildTrail(it, cam)
    })
    for (const kind of this.models.values()) {
      kind.pool.forEachAlive((it) => {
        it.age += dt
        it.mixer?.update(dt)
        if (!it.tracked && it.age >= it.life) {
          it.alive = false
          it.holder.visible = false
        }
      })
    }
  }

  private kill(it: MeshItem) {
    it.alive = false
    it.mesh.visible = false
  }

  /** 換地圖、重新開始時清掉所有特效 */
  clear() {
    this.soft.clear()
    this.add.clear()
    for (const pool of [this.slashes, this.circles, this.rings, this.pillars] as SlotPool<MeshItem>[]) pool.forEachAlive((it) => this.kill(it))
    for (const tr of this.trackers) this.untrack(tr)
    this.trails.forEachAlive((it) => {
      it.alive = false
      it.mesh.visible = false
    })
    for (const kind of this.models.values())
      kind.pool.forEachAlive((it) => {
        it.alive = false
        it.holder.visible = false
      })
  }

  /** 先把每種著色器編譯好：第一次放技能時才不會卡一下（手機特別明顯） */
  prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const temp: THREE.Object3D[] = []
    const show = (o: THREE.Object3D) => {
      o.visible = true
      temp.push(o)
    }
    show(this.soft.mesh)
    show(this.add.mesh)
    for (const pool of [this.slashes, this.circles, this.rings, this.pillars] as SlotPool<MeshItem>[]) {
      const it = pool.acquire()
      show(it.mesh)
    }
    show(this.trails.acquire().mesh)
    show(this.orbs.acquire().group)
    try {
      renderer.compile(scene, camera)
    } finally {
      for (const o of temp) o.visible = false
    }
  }

  stats() {
    const models = [...this.models.values()].reduce((s, m) => s + m.pool.active, 0)
    return {
      soft: this.soft.count,
      softBudget: this.soft.budget,
      add: this.add.count,
      addBudget: this.add.budget,
      dropped: this.soft.dropped + this.add.dropped,
      slashes: this.slashes.active,
      trails: this.trails.active,
      circles: this.circles.active,
      rings: this.rings.active,
      pillars: this.pillars.active,
      orbs: this.orbs.active,
      models,
      trackers: this.trackers.filter((t) => t.alive).length,
      /** 每種池目前建立了幾個（最多到上限） */
      created: {
        slashes: this.slashes.items.length,
        trails: this.trails.items.length,
        circles: this.circles.items.length,
        rings: this.rings.items.length,
        pillars: this.pillars.items.length,
        orbs: this.orbs.items.length,
      },
      stolen: this.slashes.stolen + this.trails.stolen + this.circles.stolen + this.rings.stolen + this.pillars.stolen + this.orbs.stolen,
    }
  }

  dispose() {
    this.clear()
    this.soft.dispose()
    this.add.dispose()
    for (const m of this.ownMaterials) m.dispose()
    for (const g of this.ownGeometries) g.dispose()
    for (const kind of this.models.values()) kind.pool.forEachAlive((it) => it.mixer?.stopAllAction())
    this.root.removeFromParent()
  }
}
