// 地形網格產生器：地面（依區域配色、範圍外起伏）、道路與河流的帶狀網格。
// 純函式、可指定範圍，第二階段分區塊載入時每個區塊用同一套函式產生，接縫自然對齊。
import * as THREE from 'three'
import { REGIONS, regionAt } from '../data/regions'
import { RIVER, groundHeight, outsideWalk, type P2 } from '../data/terrain'

const tmp = new THREE.Color()
const tmp2 = new THREE.Color()
const BORDER_GREEN = new THREE.Color('#7fbf73')
const HILL_GREEN = new THREE.Color('#9acb88')

/** 簡單的平滑雜訊（數值固定，不消耗亂數） */
function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.21 + Math.cos(z * 0.17) * 1.7) * 0.5 +
    Math.sin(z * 0.23 + Math.cos(x * 0.13) * 2.1) * 0.35 +
    Math.sin((x + z) * 0.51) * 0.15
  )
}

/** 地面顏色：區域主色＋雜訊斑塊；區域交界用周圍取樣平均，避免硬邊 */
export function groundColor(x: number, z: number, out: THREE.Color) {
  out.setRGB(0, 0, 0)
  const R = 3.2
  const OFF = [
    [0, 0],
    [R, 0],
    [-R, 0],
    [0, R],
    [0, -R],
  ]
  const n = noise(x, z) * 0.5 + 0.5
  for (const [dx, dz] of OFF) {
    const p = REGIONS[regionAt(x + dx, z + dz)].palette.ground
    tmp.set(p[0]).lerp(tmp2.set(p[1]), n)
    out.r += tmp.r / OFF.length
    out.g += tmp.g / OFF.length
    out.b += tmp.b / OFF.length
  }
  // 範圍外：慢慢轉成邊界的深綠，再往外是丘陵的淺綠
  const o = outsideWalk(x, z)
  if (o > 0) out.lerp(BORDER_GREEN, Math.min(1, o / 10))
  if (o > 14) out.lerp(HILL_GREEN, Math.min(1, (o - 14) / 40))
  return out
}

/** 一塊方形地面：左上角 (x0, z0)、邊長 size、每 step 公尺一格 */
export function buildGround(x0: number, z0: number, size: number, step: number) {
  const n = Math.round(size / step)
  const pos = new Float32Array((n + 1) * (n + 1) * 3)
  const col = new Float32Array((n + 1) * (n + 1) * 3)
  const c = new THREE.Color()
  let k = 0
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * step
      const z = z0 + j * step
      pos[k] = x
      pos[k + 1] = groundHeight(x, z)
      pos[k + 2] = z
      groundColor(x, z, c)
      col[k] = c.r
      col[k + 1] = c.g
      col[k + 2] = c.b
      k += 3
    }
  }
  const idx: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      const b = a + 1
      const d = a + (n + 1)
      const e = d + 1
      idx.push(a, d, b, b, d, e)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * 沿曲線的帶狀網格。colorAt 回傳每個點的顏色（道路依所在區域上色）；
 * uv 的 v 沿長度增加，可以拿來捲動河水貼圖。
 */
export function buildRibbon(points: P2[], width: number, y: number, colorAt?: (p: P2, out: THREE.Color) => void) {
  const pos: number[] = []
  const col: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const c = new THREE.Color(1, 1, 1)
  let len = 0
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(points.length - 1, i + 1)]
    const tx = b.x - a.x
    const tz = b.z - a.z
    const tl = Math.hypot(tx, tz) || 1
    const nx = (-tz / tl) * (width / 2)
    const nz = (tx / tl) * (width / 2)
    if (i > 0) len += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z)
    pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz)
    if (colorAt) colorAt(p, c)
    col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    uv.push(0, len / width, 1, len / width)
    if (i < points.length - 1) {
      const k = i * 2
      // 逆時針（從上往下看）→ 法線朝上
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** 道路顏色：依所在區域的道路配色（村子石板、森林泥土、山谷月白石） */
export const roadColor = (edge: boolean) => (p: P2, out: THREE.Color) => out.set(REGIONS[regionAt(p.x, p.z)].palette.road[edge ? 1 : 0])

/** 河水的流動貼圖：淡色水紋，沿 v 方向捲動 */
export function waterTexture() {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 128
  const g = cv.getContext('2d')!
  g.fillStyle = '#6cc6ee'
  g.fillRect(0, 0, 64, 128)
  for (let i = 0; i < 26; i++) {
    const x = (i * 37) % 60
    const y = (i * 53) % 128
    g.fillStyle = i % 3 ? 'rgba(255,255,255,0.28)' : 'rgba(190,240,255,0.5)'
    g.fillRect(x, y, 3 + (i % 4) * 2, 10 + (i % 5) * 5)
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export const RIVER_POINTS: P2[] = RIVER.curve.getSpacedPoints(220).map((p) => ({ x: p.x, z: p.z }))
