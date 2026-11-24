// 新版城鎮的程序化幾何：民房、瞭望塔、路燈、旗幟、攤位、長椅、花圃、柵欄、農田、道路、廣場、
// 地面貼圖，以及城外的中景（森林、丘陵、岩石、河流）。全部用頂點色＋少量材質，合併成少數幾個網格。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Box, Field, House, Prop, Road, Spot, Tower } from '../../data/townLayout'

const tmpC = new THREE.Color()

/** 幾何加上單一頂點色，去掉 uv（合併時屬性要一致） */
function paint(g: THREE.BufferGeometry, color: string | THREE.Color) {
  const geo = g.index ? g.toNonIndexed() : g
  geo.deleteAttribute('uv')
  const n = geo.getAttribute('position').count
  const c = typeof color === 'string' ? tmpC.set(color) : color
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  return geo
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return paint(g, color)
}
function merge(list: THREE.BufferGeometry[]) {
  const g = mergeGeometries(list, false)!
  for (const x of list) x.dispose()
  return g
}
/** 把幾何放到 (x, z)、旋轉 rot（正面 +Z 轉到 (sin rot, cos rot)） */
function place(g: THREE.BufferGeometry, x: number, z: number, rot: number, y = 0) {
  g.rotateY(rot)
  g.translate(x, y, z)
  return g
}

/** 兩坡屋頂（屋脊沿 x）：寬 w（含出簷）、深 d、高 rh，底部在 y0 */
function gableRoof(w: number, d: number, rh: number, y0: number, roof: string, gable: string) {
  const hw = w / 2
  const hd = d / 2
  const top = y0 + rh
  const t = 0.22 // 屋頂厚度
  const pos: number[] = []
  const quad = (a: number[], b: number[], c: number[], e: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...e)
  // 兩個斜面（上下各一層，看得到厚度）
  quad([-hw, y0, hd], [hw, y0, hd], [hw, top, 0], [-hw, top, 0])
  quad([hw, y0, -hd], [-hw, y0, -hd], [-hw, top, 0], [hw, top, 0])
  quad([-hw, y0 - t, hd], [-hw, top - t, 0], [hw, top - t, 0], [hw, y0 - t, hd])
  quad([hw, y0 - t, -hd], [hw, top - t, 0], [-hw, top - t, 0], [-hw, y0 - t, -hd])
  quad([-hw, y0 - t, hd], [hw, y0 - t, hd], [hw, y0, hd], [-hw, y0, hd])
  quad([hw, y0 - t, -hd], [-hw, y0 - t, -hd], [-hw, y0, -hd], [hw, y0, -hd])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  const roofG = paint(g, roof)
  // 山牆（三角形牆面，牆色），內縮到牆面
  const tri: number[] = []
  const gw = hw - 0.4
  for (const sx of [-1, 1]) {
    const x = sx * gw
    const a = [x, y0, hd - 0.4]
    const b = [x, y0, -hd + 0.4]
    const c = [x, top - 0.25, 0]
    if (sx > 0) tri.push(...a, ...b, ...c)
    else tri.push(...b, ...a, ...c)
  }
  const tg = new THREE.BufferGeometry()
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
  tg.computeVertexNormals()
  return [roofG, paint(tg, gable)]
}

/** 一棟民房（本地座標：底部中心、正面 +Z） */
export function houseGeometry(h: House) {
  const parts: THREE.BufferGeometry[] = []
  const timber = '#8a5a3c'
  const base = '#c9bfb0'
  const glass = '#9fd3f0'
  const { w, d } = h
  const fh = h.h
  parts.push(box(w + 0.2, 0.6, d + 0.2, 0, 0.3, 0, base))
  parts.push(box(w, fh, d, 0, fh / 2, 0, h.wall))
  let top = fh
  if (h.floors === 2) {
    // 二樓外推一點，木架外露
    parts.push(box(w + 0.4, 0.3, d + 0.4, 0, fh + 0.15, 0, timber))
    parts.push(box(w + 0.3, fh, d + 0.3, 0, fh * 1.5 + 0.3, 0, h.wall))
    top = fh * 2 + 0.3
    for (const x of [-w / 2 - 0.12, -w / 6, w / 6, w / 2 + 0.12]) parts.push(box(0.22, fh, 0.12, x, fh * 1.5 + 0.3, d / 2 + 0.17, timber))
    parts.push(box(w + 0.32, 0.2, 0.12, 0, top - 0.1, d / 2 + 0.17, timber))
  }
  // 門：門框＋門板＋小雨棚
  parts.push(box(1.5, 2.55, 0.16, 0, 1.28 + 0.3, d / 2 + 0.06, timber))
  parts.push(box(1.2, 2.35, 0.1, 0, 1.18 + 0.3, d / 2 + 0.13, '#b07a46'))
  parts.push(box(2, 0.12, 0.8, 0, 3.05, d / 2 + 0.4, timber))
  // 窗戶：正面兩側、側面各一，二樓正面兩扇
  const win = (x: number, y: number, z: number, ry: number) => {
    parts.push(box(1.1, 1.1, 0.12, x, y, z, timber, ry))
    parts.push(box(0.86, 0.86, 0.1, x, y, z + (ry ? 0 : 0.04), glass, ry))
  }
  const wy = Math.min(fh * 0.55 + 0.3, 2.3)
  if (w > 5) {
    win(-w / 2 + 1.25, wy, d / 2 + 0.06, 0)
    win(w / 2 - 1.25, wy, d / 2 + 0.06, 0)
  }
  if (h.floors === 2) {
    win(-w / 4, fh * 1.55 + 0.3, d / 2 + 0.2, 0)
    win(w / 4, fh * 1.55 + 0.3, d / 2 + 0.2, 0)
  }
  // 側窗
  const sw = new THREE.BoxGeometry(0.12, 1.0, 1.0)
  sw.translate(w / 2 + 0.03 + (h.floors === 2 ? 0.15 : 0), h.floors === 2 ? fh * 1.55 + 0.3 : wy, 0)
  parts.push(paint(sw, glass))
  // 屋頂
  const rh = d * 0.5 + 0.4
  parts.push(...gableRoof(w + 1.1, d + 1.2 + (h.floors === 2 ? 0.3 : 0), rh, top, h.roof, h.wall))
  // 煙囪
  parts.push(box(0.7, rh * 0.9, 0.7, w * 0.28, top + rh * 0.6, -d * 0.15, '#b9a58f'))
  parts.push(box(0.86, 0.18, 0.86, w * 0.28, top + rh * 1.05, -d * 0.15, '#8f7f6e'))
  return merge(parts)
}

/** 所有瞭望塔合併成一個網格 */
export function towersGeometry(towers: Tower[]) {
  const parts: THREE.BufferGeometry[] = []
  for (const t of towers) {
    const seg = 14
    const stone = '#dcccae'
    const band = '#bfae90'
    const g = new THREE.CylinderGeometry(t.r * 0.94, t.r, t.h, seg, 1)
    g.translate(t.x, t.h / 2, t.z)
    parts.push(paint(g, stone))
    // 底座與上方的石帶
    const b0 = new THREE.CylinderGeometry(t.r * 1.08, t.r * 1.12, 0.9, seg, 1)
    b0.translate(t.x, 0.45, t.z)
    parts.push(paint(b0, band))
    const b1 = new THREE.CylinderGeometry(t.r * 1.12, t.r * 0.98, 0.7, seg, 1)
    b1.translate(t.x, t.h - 0.35, t.z)
    parts.push(paint(b1, band))
    // 城垛
    const n = 10
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      parts.push(box(0.6, 0.7, 0.5, t.x + Math.sin(a) * t.r * 1.02, t.h + 0.35, t.z + Math.cos(a) * t.r * 1.02, stone, a))
    }
    // 尖屋頂（和城門屋頂同色系）
    const roof = new THREE.ConeGeometry(t.r * 1.22, t.r * 1.5, seg, 1)
    roof.translate(t.x, t.h + 0.7 + t.r * 0.75, t.z)
    parts.push(paint(roof, '#d9694f'))
    // 窄窗
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      for (const y of [t.h * 0.45, t.h * 0.75]) parts.push(box(0.35, 1.1, 0.2, t.x + Math.sin(a) * t.r * 0.97, y, t.z + Math.cos(a) * t.r * 0.97, '#5a4a52', a))
    }
  }
  return merge(parts)
}

/** 路燈（一支）：燈柱與燈箱框；燈罩玻璃另外用發光材質 */
export function lampGeometry() {
  const dark = '#4a3b52'
  const parts = [
    box(0.42, 0.3, 0.42, 0, 0.15, 0, '#8f8577'),
    paint(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8).translate(0, 1.6, 0), dark),
    box(0.62, 0.08, 0.62, 0, 3.27, 0, dark),
    paint(new THREE.ConeGeometry(0.42, 0.36, 4).rotateY(Math.PI / 4).translate(0, 3.95, 0), dark),
  ]
  return merge(parts)
}
export const LAMP_GLASS = new THREE.BoxGeometry(0.44, 0.5, 0.44).translate(0, 3.55, 0)

/** 旗桿（高 h）＋旗面另外用飄動的材質 */
export function poleGeometry(h: number) {
  return merge([paint(new THREE.CylinderGeometry(0.06, 0.08, h, 6).translate(0, h / 2, 0), '#6b5a4a'), paint(new THREE.SphereGeometry(0.14, 8, 6).translate(0, h + 0.1, 0), '#f2c14e')])
}
/** 旗面：寬 1.7、高 1.05，左邊貼著旗桿 */
export const FLAG_CLOTH = (() => {
  const g = new THREE.PlaneGeometry(1.7, 1.05, 10, 4)
  g.translate(0.85 + 0.06, 0, 0)
  return g
})()
/** 旗子飄動：離旗桿越遠擺動越大 */
export function flagMaterial() {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
  const uniforms = { uTime: { value: 0 } }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = clamp(position.x / 1.8, 0.0, 1.0);
        float ph = uTime * 3.2 + position.x * 2.6;
        #ifdef USE_INSTANCING
          ph += instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
        #endif
        transformed.z += sin(ph) * 0.22 * k;
        transformed.y += cos(ph * 0.8) * 0.05 * k;`,
      )
  }
  return { material: m, uniforms }
}

/** 市集攤位（全部合併）：四根柱、櫃台、條紋雨棚、木箱 */
export function stallsGeometry(stalls: (Spot & { color: string })[]) {
  const parts: THREE.BufferGeometry[] = []
  for (const s of stalls) {
    const one: THREE.BufferGeometry[] = []
    const wood = '#9a6a44'
    for (const x of [-1.2, 1.2]) for (const z of [-0.8, 0.8]) one.push(box(0.12, 2.4, 0.12, x, 1.2, z, wood))
    one.push(box(2.6, 0.9, 0.9, 0, 0.45, 0.55, '#b07a46'))
    one.push(box(2.7, 0.1, 1.0, 0, 0.95, 0.55, '#d8b27e'))
    for (let i = 0; i < 6; i++) {
      const sl = new THREE.BoxGeometry(2.8 / 6, 0.08, 2.1)
      sl.rotateX(-0.28)
      sl.translate(-1.4 + (i + 0.5) * (2.8 / 6), 2.55, 0.1)
      one.push(paint(sl, i % 2 ? '#fffaf0' : s.color))
    }
    one.push(box(0.5, 0.4, 0.4, -0.7, 1.2, 0.55, '#e8735a'), box(0.5, 0.35, 0.4, 0.1, 1.17, 0.55, '#f2c14e'), box(0.45, 0.4, 0.4, 0.8, 1.2, 0.55, '#6fbf73'))
    one.push(box(0.6, 0.6, 0.6, 1.6, 0.3, -0.5, wood), box(0.5, 0.5, 0.5, 1.5, 0.85, -0.4, '#b07a46'))
    const g = merge(one)
    parts.push(place(g, s.x, s.z, s.rot))
  }
  return merge(parts)
}

export function benchesGeometry(benches: Spot[]) {
  const parts: THREE.BufferGeometry[] = []
  for (const b of benches) {
    const wood = '#b07a46'
    const g = merge([
      box(1.9, 0.1, 0.5, 0, 0.5, 0, wood),
      box(1.9, 0.45, 0.08, 0, 0.85, -0.22, wood),
      box(0.1, 0.5, 0.45, -0.8, 0.25, 0, '#4a3b52'),
      box(0.1, 0.5, 0.45, 0.8, 0.25, 0, '#4a3b52'),
    ])
    parts.push(place(g, b.x, b.z, b.rot))
  }
  return parts.length ? merge(parts) : null
}

/** 花圃：石框、泥土、彩色花朵 */
export function bedsGeometry(beds: (Spot & { w: number; d: number })[]) {
  const parts: THREE.BufferGeometry[] = []
  const flowers = ['#ff8fb1', '#f2c14e', '#ffffff', '#b58cff', '#ff7a5c']
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const b of beds) {
    const one = [box(b.w + 0.3, 0.35, b.d + 0.3, 0, 0.17, 0, '#c9bfb0'), box(b.w, 0.38, b.d, 0, 0.2, 0, '#7a5a3c')]
    const n = Math.round(b.w * b.d * 5)
    for (let i = 0; i < n; i++) {
      const f = new THREE.IcosahedronGeometry(0.13 + rnd() * 0.06, 0)
      f.translate((rnd() - 0.5) * (b.w - 0.3), 0.5 + rnd() * 0.12, (rnd() - 0.5) * (b.d - 0.2))
      one.push(paint(f, flowers[Math.floor(rnd() * flowers.length)]))
      if (i % 3 === 0) {
        const l = new THREE.IcosahedronGeometry(0.16, 0)
        l.scale(1, 0.6, 1)
        l.translate((rnd() - 0.5) * (b.w - 0.3), 0.42, (rnd() - 0.5) * (b.d - 0.2))
        one.push(paint(l, '#5fae4f'))
      }
    }
    parts.push(place(merge(one), b.x, b.z, b.rot))
  }
  return parts.length ? merge(parts) : null
}

/** 木柵欄：每 1.6 m 一根柱子，兩道橫桿 */
export function fencesGeometry(fences: [number, number][][]) {
  const parts: THREE.BufferGeometry[] = []
  const wood = '#a8784c'
  for (const f of fences) {
    for (let i = 0; i + 1 < f.length; i++) {
      const [x1, z1] = f[i]
      const [x2, z2] = f[i + 1]
      const len = Math.hypot(x2 - x1, z2 - z1)
      const rot = Math.atan2(x2 - x1, z2 - z1)
      const n = Math.max(1, Math.round(len / 1.6))
      for (let k = 0; k <= n; k++) parts.push(box(0.16, 1.1, 0.16, x1 + ((x2 - x1) * k) / n, 0.55, z1 + ((z2 - z1) * k) / n, '#8a5a3c'))
      for (const y of [0.45, 0.85]) {
        const r = new THREE.BoxGeometry(0.08, 0.1, len)
        r.rotateY(rot)
        r.translate((x1 + x2) / 2, y, (z1 + z2) / 2)
        parts.push(paint(r, wood))
      }
    }
  }
  return parts.length ? merge(parts) : null
}

/** 農田：土色底＋一行行作物 */
export function fieldsGeometry(fields: Field[]) {
  const parts: THREE.BufferGeometry[] = []
  for (const f of fields) {
    const one: THREE.BufferGeometry[] = [box(f.w, 0.12, f.d, 0, 0.06, 0, '#9a7650')]
    const rows = Math.floor(f.d / 0.9)
    const palette = f.crop === 'wheat' ? ['#e6c45c', '#f0d070'] : f.crop === 'veg' ? ['#5fae4f', '#73c25c'] : ['#ff8fb1', '#f2c14e', '#b58cff', '#ffffff']
    for (let r = 0; r < rows; r++) {
      const z = -f.d / 2 + 0.45 + r * 0.9
      const color = palette[r % palette.length]
      if (f.crop === 'wheat') one.push(box(f.w - 0.6, 0.65, 0.42, 0, 0.42, z, color))
      else
        for (let x = -f.w / 2 + 0.6; x < f.w / 2 - 0.4; x += 0.7) {
          const g = new THREE.IcosahedronGeometry(f.crop === 'veg' ? 0.28 : 0.2, 0)
          g.scale(1, f.crop === 'veg' ? 0.7 : 1, 1)
          g.translate(x, f.crop === 'veg' ? 0.3 : 0.38, z)
          one.push(paint(g, color))
        }
    }
    parts.push(place(merge(one), f.x, f.z, f.rot))
  }
  return parts.length ? merge(parts) : null
}

/** 街邊擺設：木桶、木箱、推車、水井、樹籬 */
export function propsGeometry(props: Prop[]) {
  const parts: THREE.BufferGeometry[] = []
  const wood = '#a8784c'
  const dark = '#7d5532'
  for (const p of props) {
    const one: THREE.BufferGeometry[] = []
    if (p.kind === 'barrels') {
      for (const [x, z, s] of [
        [0, 0, 1],
        [0.75, 0.2, 0.9],
        [0.3, -0.7, 0.95],
      ]) {
        one.push(paint(new THREE.CylinderGeometry(0.36 * s, 0.32 * s, 0.85 * s, 10).translate(x, 0.43 * s, z), wood))
        one.push(paint(new THREE.CylinderGeometry(0.37 * s, 0.37 * s, 0.07, 10).translate(x, 0.2 * s, z), dark))
        one.push(paint(new THREE.CylinderGeometry(0.37 * s, 0.37 * s, 0.07, 10).translate(x, 0.66 * s, z), dark))
      }
    } else if (p.kind === 'crates') {
      one.push(box(0.8, 0.8, 0.8, 0, 0.4, 0, wood), box(0.7, 0.7, 0.7, 0.85, 0.35, 0.1, '#b88a58', 0.3), box(0.6, 0.6, 0.6, 0.2, 1.1, 0, '#c99a62', -0.2))
      one.push(box(0.5, 0.25, 0.5, 0.85, 0.82, 0.1, '#e8735a'))
    } else if (p.kind === 'cart') {
      one.push(box(1.4, 0.12, 2.2, 0, 0.75, 0, wood), box(0.08, 0.5, 2.2, -0.68, 1.05, 0, dark), box(0.08, 0.5, 2.2, 0.68, 1.05, 0, dark))
      for (const sx of [-0.78, 0.78]) one.push(paint(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12).rotateZ(Math.PI / 2).translate(sx, 0.5, -0.3), dark))
      one.push(box(0.08, 0.08, 1.6, -0.35, 0.7, 1.7, wood), box(0.08, 0.08, 1.6, 0.35, 0.7, 1.7, wood))
      one.push(box(0.9, 0.45, 0.9, 0, 1.05, 0.3, '#e6c45c'), box(0.6, 0.35, 0.6, -0.2, 1.05, -0.6, '#6fbf73'))
    } else if (p.kind === 'well') {
      one.push(paint(new THREE.CylinderGeometry(1.0, 1.05, 0.9, 14).translate(0, 0.45, 0), '#c9bfb0'))
      one.push(paint(new THREE.CylinderGeometry(0.82, 0.82, 0.05, 14).translate(0, 0.86, 0), '#6fb3d8'))
      one.push(box(0.14, 2.2, 0.14, -0.9, 1.1, 0, dark), box(0.14, 2.2, 0.14, 0.9, 1.1, 0, dark))
      one.push(...gableRoof(2.4, 1.6, 0.7, 2.15, '#d9694f', '#d9694f'))
    } else if (p.kind === 'hedge') {
      const len = p.len ?? 4
      one.push(box(len, 0.9, 0.8, 0, 0.45, 0, '#5a9e52'))
      for (let x = -len / 2 + 0.4; x < len / 2; x += 0.8) {
        const g = new THREE.IcosahedronGeometry(0.5, 0)
        g.scale(1, 0.7, 0.9)
        g.translate(x, 0.95, 0)
        one.push(paint(g, '#6cb862'))
      }
    }
    parts.push(place(merge(one), p.x, p.z, p.rot))
  }
  return parts.length ? merge(parts) : null
}

/** 主街上方的三角彩旗：兩點之間的下垂繩子掛一串彩色三角旗 */
export function buntingGeometry(lines: [number, number, number, number, number][]) {
  const pos: number[] = []
  const col: number[] = []
  const colors = ['#ff8fb1', '#f2c14e', '#5d8fe0', '#6fbf73', '#ffffff', '#b58cff']
  for (const [x1, z1, x2, z2, h] of lines) {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const n = Math.max(4, Math.round(len / 0.55))
    const at = (t: number) => [x1 + (x2 - x1) * t, h - Math.sin(t * Math.PI) * 0.55, z1 + (z2 - z1) * t]
    for (let i = 0; i < n; i++) {
      const a = at(i / n)
      const b = at((i + 0.8) / n)
      const m = at((i + 0.4) / n)
      const c = tmpC.set(colors[i % colors.length])
      pos.push(...a, ...b, m[0], m[1] - 0.42, m[2])
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b)
    }
    // 繩子：細長的三角形帶
    for (let i = 0; i < n; i++) {
      const a = at(i / n)
      const b = at((i + 1) / n)
      pos.push(a[0], a[1] + 0.03, a[2], b[0], b[1] + 0.03, b[2], b[0], b[1] - 0.02, b[2])
      for (let k = 0; k < 3; k++) col.push(0.45, 0.35, 0.3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** 方案 A 的木製入口拱門 */
export function archGeometry(a: Spot) {
  const wood = '#9a6a44'
  const g = merge([
    box(0.4, 4.6, 0.4, -2.9, 2.3, 0, wood),
    box(0.4, 4.6, 0.4, 2.9, 2.3, 0, wood),
    box(6.8, 0.36, 0.5, 0, 4.4, 0, '#8a5a3c'),
    box(6.2, 0.2, 0.3, 0, 3.9, 0, wood),
    paint(new THREE.ConeGeometry(0.4, 0.6, 4).rotateY(Math.PI / 4).translate(-2.9, 4.9, 0), '#d9694f'),
    paint(new THREE.ConeGeometry(0.4, 0.6, 4).rotateY(Math.PI / 4).translate(2.9, 4.9, 0), '#d9694f'),
  ])
  return place(g, a.x, a.z, a.rot)
}

// ── 道路與廣場 ──
/** 一條路：沿折線的帶狀網格，u 橫跨路寬、v 沿路長（以公尺計，貼圖重複） */
export function roadGeometry(roads: Road[], y: number) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let base = 0
  for (const r of roads) {
    const pts = r.pts
    let along = 0
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]
      const [px, pz] = pts[Math.max(0, i - 1)]
      const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]
      let dx = nx - px
      let dz = nz - pz
      const len = Math.hypot(dx, dz) || 1
      dx /= len
      dz /= len
      if (i > 0) along += Math.hypot(x - px, z - pz)
      // 路的兩端各多延伸半個路寬，接到廣場或另一條路時看不到斷口
      const ext = i === 0 ? -r.w * 0.35 : i === pts.length - 1 ? r.w * 0.35 : 0
      const cx = x + dx * ext
      const cz = z + dz * ext
      const hw = r.w / 2
      // 右側在前、左側在後：三角形朝上（從上方看是逆時針）
      pos.push(cx + dz * hw, y, cz - dx * hw, cx - dz * hw, y, cz + dx * hw)
      const v = (along + ext) / 3
      uv.push(0, v, 1, v)
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = base + i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    base += pts.length * 2
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  draw(ctx, size)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
let seedT = 1234
const rndT = () => ((seedT = (seedT * 16807) % 2147483647) / 2147483647)

/** 石板路：不規則的圓角石塊，路的兩側邊緣做成不規則（alphaTest 切掉） */
export function cobbleTexture(edge: boolean) {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#b8a890'
    c.fillRect(0, 0, s, s)
    const rows = 8
    for (let r = 0; r < rows; r++) {
      let x = -rndT() * 20
      const y = (r / rows) * s
      while (x < s) {
        const w = 22 + rndT() * 18
        const tone = 200 + Math.floor(rndT() * 34)
        c.fillStyle = `rgb(${tone},${tone - 12},${tone - 30})`
        c.beginPath()
        c.roundRect(x + 2, y + 2, w - 4, s / rows - 4, 7)
        c.fill()
        c.fillStyle = 'rgba(255,255,255,0.18)'
        c.fillRect(x + 5, y + 4, w - 12, 3)
        x += w
      }
    }
    if (edge) {
      // 左右邊緣：透明度做成不規則鋸齒，配 alphaTest
      const img = c.getImageData(0, 0, s, s)
      for (let y = 0; y < s; y++) {
        const j = 10 + Math.sin(y * 0.11) * 3 + Math.sin(y * 0.37 + 1.3) * 1.5
        for (let x = 0; x < s; x++) {
          const e = Math.min(x, s - 1 - x)
          if (e < j) img.data[(y * s + x) * 4 + 3] = e < j * 0.5 ? 0 : 140
        }
      }
      c.putImageData(img, 0, 0)
    }
  })
}
/** 土路：深淺不一的土色、小石子，邊緣不規則 */
export function dirtTexture() {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#d6b98a'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const t = rndT()
      c.fillStyle = t < 0.5 ? 'rgba(160,120,80,0.25)' : 'rgba(240,220,180,0.3)'
      c.beginPath()
      c.arc(rndT() * s, rndT() * s, 1 + rndT() * 4, 0, Math.PI * 2)
      c.fill()
    }
    const img = c.getImageData(0, 0, s, s)
    for (let y = 0; y < s; y++) {
      const j = 26 + Math.sin(y * 0.049) * 9 + Math.sin(y * 0.172 + 0.7) * 4
      for (let x = 0; x < s; x++) {
        const e = Math.min(x, s - 1 - x)
        if (e < j) img.data[(y * s + x) * 4 + 3] = Math.max(0, Math.min(255, ((e - j * 0.45) / (j * 0.55)) * 255))
      }
    }
    c.putImageData(img, 0, 0)
  })
}
/** 廣場：同心圓排列的石板 */
export function plazaTexture() {
  return canvasTexture(
    512,
    (c, s) => {
      c.fillStyle = '#b8a890'
      c.fillRect(0, 0, s, s)
      const cx = s / 2
      for (let ring = 0; ring < 11; ring++) {
        const r0 = 18 + ring * 21
        const n = Math.max(6, Math.round((Math.PI * 2 * r0) / 30))
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + ring * 0.3
          const a1 = ((i + 1) / n) * Math.PI * 2 + ring * 0.3
          const tone = ring % 3 === 2 ? 186 + Math.floor(rndT() * 16) : 206 + Math.floor(rndT() * 30)
          c.fillStyle = ring % 3 === 2 ? `rgb(${tone - 10},${tone - 24},${tone - 40})` : `rgb(${tone},${tone - 10},${tone - 28})`
          c.beginPath()
          c.arc(cx, cx, r0 + 18, a0 + 0.015, a1 - 0.015)
          c.arc(cx, cx, r0 + 2, a1 - 0.015, a0 + 0.015, true)
          c.closePath()
          c.fill()
        }
      }
      c.fillStyle = '#d8c8a8'
      c.beginPath()
      c.arc(cx, cx, 16, 0, Math.PI * 2)
      c.fill()
    },
    false,
  )
}
/** 草地：細碎的明暗斑點與小草（大範圍再用頂點色做深淺變化，避免整片純綠） */
export function grassTexture() {
  return canvasTexture(512, (c, s) => {
    c.fillStyle = '#9fd07a'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 2600; i++) {
      const t = rndT()
      c.fillStyle = t < 0.4 ? 'rgba(120,180,90,0.35)' : t < 0.8 ? 'rgba(190,230,140,0.35)' : 'rgba(255,255,255,0.25)'
      const x = rndT() * s
      const y = rndT() * s
      c.fillRect(x, y, 2 + rndT() * 3, 5 + rndT() * 7)
    }
    for (let i = 0; i < 60; i++) {
      c.fillStyle = ['#ffffff', '#ffd6e6', '#fff3a0'][i % 3]
      c.beginPath()
      c.arc(rndT() * s, rndT() * s, 2.2, 0, Math.PI * 2)
      c.fill()
    }
  })
}
/** 城鎮名稱看板 */
export function signTexture(title: string, sub: string) {
  return canvasTexture(
    512,
    (c) => {
      c.clearRect(0, 0, 512, 256)
      c.fillStyle = '#6b4a2e'
      c.beginPath()
      c.roundRect(8, 40, 496, 176, 30)
      c.fill()
      c.fillStyle = '#f6e6c4'
      c.beginPath()
      c.roundRect(22, 54, 468, 148, 22)
      c.fill()
      c.fillStyle = '#6b3f8a'
      c.font = 'bold 92px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(title, 256, 118)
      c.fillStyle = '#b8862b'
      c.font = 'bold 30px Nunito, sans-serif'
      c.fillText(sub, 256, 178)
      c.fillStyle = '#f2c14e'
      for (const x of [56, 456]) {
        c.beginPath()
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2
          const r = i % 2 ? 9 : 22
          c.lineTo(x + Math.cos(a) * r, 120 + Math.sin(a) * r)
        }
        c.fill()
      }
    },
    false,
  )
}

// ── 中景：城外的森林、丘陵、岩石、河流 ──
let seedM = 4242
const rndM = () => ((seedM = (seedM * 16807) % 2147483647) / 2147483647)

/** 低面數樹（一棵）：樹幹＋兩層圓錐樹冠，頂點色（實例顏色再乘上去做變化） */
export function lowTreeGeometry() {
  return merge([
    paint(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6).translate(0, 0.8, 0), '#8a6a4a'),
    paint(new THREE.ConeGeometry(1.7, 3.2, 7).translate(0, 2.9, 0), '#ffffff'),
    paint(new THREE.ConeGeometry(1.25, 2.4, 7).translate(0, 4.4, 0), '#f2fff0'),
  ])
}
export function lowRoundTreeGeometry() {
  return merge([
    paint(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 6).translate(0, 0.9, 0), '#8a6a4a'),
    paint(new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.2, 0), '#ffffff'),
  ])
}

/** 城外的樹：在城鎮範圍外一圈（避開城門外的道路與農田）。回傳每棵樹的位置、大小、顏色 */
export function forestRing(foot: Box, keepOut: Box[], count: number, inner = 6, outer = 70) {
  seedM = 4242
  const out: { x: number; z: number; s: number; rot: number; color: THREE.Color; round: boolean }[] = []
  const greens = ['#4f9e5a', '#5fae63', '#3f8f55', '#6cba6a', '#58a86f', '#7cc276']
  let guard = 0
  while (out.length < count && guard++ < count * 30) {
    const x = foot.minX - outer + rndM() * (foot.maxX - foot.minX + outer * 2)
    const z = foot.minZ - outer + rndM() * (foot.maxZ - foot.minZ + outer * 2)
    const dx = Math.max(foot.minX - x, 0, x - foot.maxX)
    const dz = Math.max(foot.minZ - z, 0, z - foot.maxZ)
    const d = Math.hypot(dx, dz)
    if (d < inner || d > outer) continue
    // 越外圍越密
    if (rndM() > 0.35 + (d / outer) * 0.65) continue
    if (keepOut.some((k) => x > k.minX && x < k.maxX && z > k.minZ && z < k.maxZ)) continue
    if (out.some((t) => Math.abs(t.x - x) < 2.4 && Math.abs(t.z - z) < 2.4)) continue
    const c = new THREE.Color(greens[Math.floor(rndM() * greens.length)])
    out.push({ x, z, s: 1 + rndM() * 1.1 + (d / outer) * 0.6, rot: rndM() * Math.PI * 2, color: c, round: rndM() < 0.35 })
  }
  return out
}

/** 丘陵：城外遠處幾座壓扁的大圓丘（頂點色由下往上變淺） */
export function hillsGeometry(foot: Box) {
  seedM = 99
  const parts: THREE.BufferGeometry[] = []
  const cx = (foot.minX + foot.maxX) / 2
  const cz = (foot.minZ + foot.maxZ) / 2
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rndM() * 0.3
    const d = 95 + rndM() * 45
    const r = 24 + rndM() * 22
    const g = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    g.scale(1, 0.22 + rndM() * 0.18, 1)
    g.translate(cx + Math.sin(a) * d, -0.5, cz + Math.cos(a) * d)
    const geo = g.toNonIndexed()
    geo.deleteAttribute('uv')
    const pos = geo.getAttribute('position')
    const col = new Float32Array(pos.count * 3)
    const lo = new THREE.Color('#79b36c')
    const hi = new THREE.Color('#a9d48a')
    for (let k = 0; k < pos.count; k++) {
      const t = Math.min(1, Math.max(0, pos.getY(k) / 10))
      tmpC.copy(lo).lerp(hi, t)
      col[k * 3] = tmpC.r
      col[k * 3 + 1] = tmpC.g
      col[k * 3 + 2] = tmpC.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parts.push(geo)
  }
  return merge(parts)
}

/** 河流：城鎮北邊（城後）由西向東流的一條河，兩岸有沙岸 */
export function riverGeometry(foot: Box) {
  const z0 = foot.minZ - 22
  const pts: [number, number][] = []
  for (let x = foot.minX - 140; x <= foot.maxX + 140; x += 8) pts.push([x, z0 + Math.sin(x * 0.03) * 7 + Math.sin(x * 0.011) * 10])
  return {
    water: roadGeometry([{ pts, w: 9, kind: 'dirt' }], 0.03),
    bank: roadGeometry([{ pts, w: 13, kind: 'dirt' }], 0.015),
  }
}
