// 粒子層：一個 InstancedBufferGeometry 畫完全部粒子（一次繪製呼叫）。
// 資料用結構化陣列存，死掉的粒子用最後一個補位，更新只跑活著的數量。
import * as THREE from 'three'
import { particleMaterial } from './shaders'

export interface ParticleSpawn {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  life: number
  /** 開始 / 結束大小（公尺） */
  size: number
  size1?: number
  color: THREE.Color
  /** 結束顏色（預設和開始一樣） */
  color2?: THREE.Color
  alpha?: number
  gravity?: number
  drag?: number
  /** > 0 時沿速度方向拉長（倍率） */
  stretch?: number
}

export class ParticleLayer {
  readonly mesh: THREE.Mesh
  count = 0
  /** 超過預算而沒有產生的粒子數 */
  dropped = 0
  private readonly geo: THREE.InstancedBufferGeometry
  private readonly P: Float32Array
  private readonly V: Float32Array
  private readonly C0: Float32Array
  private readonly C1: Float32Array
  private readonly L: Float32Array
  private readonly D: Float32Array
  private readonly S0: Float32Array
  private readonly S1: Float32Array
  private readonly A: Float32Array
  private readonly G: Float32Array
  private readonly R: Float32Array
  private readonly T: Float32Array
  private readonly aPos: THREE.InstancedBufferAttribute
  private readonly aColor: THREE.InstancedBufferAttribute
  private readonly aSA: THREE.InstancedBufferAttribute
  private readonly aVel: THREE.InstancedBufferAttribute

  constructor(
    readonly cap: number,
    public budget: number,
    blending: THREE.Blending,
    core: number,
    renderOrder: number,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    geo.setAttribute('uv', quad.getAttribute('uv'))
    const dyn = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.aPos = dyn(3)
    this.aColor = dyn(3)
    this.aSA = dyn(2)
    this.aVel = dyn(4)
    geo.setAttribute('iPos', this.aPos)
    geo.setAttribute('iColor', this.aColor)
    geo.setAttribute('iSA', this.aSA)
    geo.setAttribute('iVel', this.aVel)
    geo.instanceCount = 0
    this.geo = geo
    this.mesh = new THREE.Mesh(geo, particleMaterial(blending, core))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = renderOrder
    this.mesh.visible = false
    this.P = new Float32Array(cap * 3)
    this.V = new Float32Array(cap * 3)
    this.C0 = new Float32Array(cap * 3)
    this.C1 = new Float32Array(cap * 3)
    this.L = new Float32Array(cap)
    this.D = new Float32Array(cap)
    this.S0 = new Float32Array(cap)
    this.S1 = new Float32Array(cap)
    this.A = new Float32Array(cap)
    this.G = new Float32Array(cap)
    this.R = new Float32Array(cap)
    this.T = new Float32Array(cap)
  }

  spawn(o: ParticleSpawn) {
    if (this.count >= Math.min(this.budget, this.cap)) {
      this.dropped++
      return
    }
    const i = this.count++
    const i3 = i * 3
    this.P[i3] = o.x
    this.P[i3 + 1] = o.y
    this.P[i3 + 2] = o.z
    this.V[i3] = o.vx ?? 0
    this.V[i3 + 1] = o.vy ?? 0
    this.V[i3 + 2] = o.vz ?? 0
    const c1 = o.color2 ?? o.color
    this.C0[i3] = o.color.r
    this.C0[i3 + 1] = o.color.g
    this.C0[i3 + 2] = o.color.b
    this.C1[i3] = c1.r
    this.C1[i3 + 1] = c1.g
    this.C1[i3 + 2] = c1.b
    this.L[i] = this.D[i] = Math.max(0.01, o.life)
    this.S0[i] = o.size
    this.S1[i] = o.size1 ?? o.size * 0.2
    this.A[i] = o.alpha ?? 1
    this.G[i] = o.gravity ?? 0
    this.R[i] = o.drag ?? 0
    this.T[i] = o.stretch ?? 0
  }

  private move(from: number, to: number) {
    const f3 = from * 3
    const t3 = to * 3
    for (let k = 0; k < 3; k++) {
      this.P[t3 + k] = this.P[f3 + k]
      this.V[t3 + k] = this.V[f3 + k]
      this.C0[t3 + k] = this.C0[f3 + k]
      this.C1[t3 + k] = this.C1[f3 + k]
    }
    this.L[to] = this.L[from]
    this.D[to] = this.D[from]
    this.S0[to] = this.S0[from]
    this.S1[to] = this.S1[from]
    this.A[to] = this.A[from]
    this.G[to] = this.G[from]
    this.R[to] = this.R[from]
    this.T[to] = this.T[from]
  }

  update(dt: number) {
    const { P, V, L } = this
    const pos = this.aPos.array as Float32Array
    const col = this.aColor.array as Float32Array
    const sa = this.aSA.array as Float32Array
    const vel = this.aVel.array as Float32Array
    let i = 0
    while (i < this.count) {
      L[i] -= dt
      if (L[i] <= 0) {
        this.count--
        if (i !== this.count) this.move(this.count, i)
        continue
      }
      const i3 = i * 3
      V[i3 + 1] -= this.G[i] * dt
      const k = Math.max(0, 1 - this.R[i] * dt)
      V[i3] *= k
      V[i3 + 1] *= k
      V[i3 + 2] *= k
      P[i3] += V[i3] * dt
      P[i3 + 1] += V[i3 + 1] * dt
      P[i3 + 2] += V[i3 + 2] * dt
      if (P[i3 + 1] < 0.02 && this.G[i] > 0) {
        // 落地：停在地面上滑行
        P[i3 + 1] = 0.02
        V[i3 + 1] = 0
        V[i3] *= 0.6
        V[i3 + 2] *= 0.6
      }
      const t = 1 - L[i] / this.D[i]
      pos[i3] = P[i3]
      pos[i3 + 1] = P[i3 + 1]
      pos[i3 + 2] = P[i3 + 2]
      col[i3] = this.C0[i3] + (this.C1[i3] - this.C0[i3]) * t
      col[i3 + 1] = this.C0[i3 + 1] + (this.C1[i3 + 1] - this.C0[i3 + 1]) * t
      col[i3 + 2] = this.C0[i3 + 2] + (this.C1[i3 + 2] - this.C0[i3 + 2]) * t
      sa[i * 2] = this.S0[i] + (this.S1[i] - this.S0[i]) * t
      // 很快淡入、最後 40% 淡出
      sa[i * 2 + 1] = this.A[i] * Math.min(1, t * 14 + 0.15) * Math.min(1, (1 - t) * 2.5)
      const i4 = i * 4
      vel[i4] = V[i3]
      vel[i4 + 1] = V[i3 + 1]
      vel[i4 + 2] = V[i3 + 2]
      vel[i4 + 3] = this.T[i]
      i++
    }
    const n = this.count
    for (const [a, size] of [
      [this.aPos, 3],
      [this.aColor, 3],
      [this.aSA, 2],
      [this.aVel, 4],
    ] as const) {
      a.clearUpdateRanges()
      if (n > 0) {
        a.addUpdateRange(0, n * size)
        a.needsUpdate = true
      }
    }
    this.geo.instanceCount = n
    this.mesh.visible = n > 0
  }

  clear() {
    this.count = 0
    this.geo.instanceCount = 0
    this.mesh.visible = false
  }

  dispose() {
    this.geo.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
