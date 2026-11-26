// 小地圖與大地圖共用的繪圖：地形底圖只畫一次（離屏畫布），每幀再疊上動態標記。
//   - 小地圖：以主角為中心、跟著鏡頭轉（鏡頭前方永遠朝上），半徑約 30 公尺。
//   - 大地圖：整張主線地圖、正北朝上，帶地名與標籤。
// 座標：世界 x 向右、z 向下（北方是 -z），與畫布座標方向一致，所以不用翻轉。
import { CLASSES } from '../data/classes'
import { REGIONS, regionAt } from '../data/regions'
import { BRIDGES, ELDER_TREE, ENTRANCES, PASS, RIDGE_Z, RIVER, TOWN_WORLD_BOX, WALK, WINDMILL, mulberry32, outsideWalk, riverZ } from '../data/terrain'
import { AREA_BOSSES, CAMPS, HOUSES, PLAZA, RUINS, SPRING, GROVE, ROADS, distToAnyRoad } from '../data/world'
import { combat } from '../game/combat/state'
import { progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { interactables, questTarget } from '../game/story'

/** 底圖涵蓋的世界範圍（比可行走範圍多一圈，河流與城門才畫得完整） */
export const MAP = { x0: -42, z0: -77, w: 84, h: 120 }
const PPM = 6 // 底圖解析度：每公尺幾個像素
/** 小地圖看到的半徑（公尺） */
export const MINI_RADIUS = 30

export interface MapView {
  /** 畫面中心 */
  cx: number
  cy: number
  /** 每公尺幾個畫面像素 */
  s: number
  /** 地圖順時針旋轉的弧度（小地圖 = 鏡頭 yaw；大地圖 = 0） */
  a: number
  /** 對準畫面中心的世界座標 */
  px: number
  pz: number
}

export function project(v: MapView, x: number, z: number): [number, number] {
  const dx = x - v.px
  const dz = z - v.pz
  const c = Math.cos(v.a)
  const s = Math.sin(v.a)
  return [v.cx + v.s * (dx * c - dz * s), v.cy + v.s * (dx * s + dz * c)]
}

// ── 底圖 ─────────────────────────────────────────────
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let baseCanvas: HTMLCanvasElement | null = null
export function baseMap(): HTMLCanvasElement {
  if (baseCanvas) return baseCanvas
  const c = document.createElement('canvas')
  c.width = MAP.w * PPM
  c.height = MAP.h * PPM
  const g = c.getContext('2d')!

  // 1) 地面：各區底色（兩色以公尺格子錯開，帶一點質感），可行走範圍外是深色山丘
  const img = g.createImageData(c.width, c.height)
  const pal = Object.fromEntries(Object.values(REGIONS).map((r) => [r.id, [hex(r.palette.ground[0]), hex(r.palette.ground[1])]])) as Record<string, [number, number, number][]>
  const hill = hex('#4d7466')
  const hillEdge = hex('#3f6a58')
  const town = TOWN_WORLD_BOX
  for (let py = 0; py < c.height; py++) {
    const z = MAP.z0 + (py + 0.5) / PPM
    for (let px = 0; px < c.width; px++) {
      const x = MAP.x0 + (px + 0.5) / PPM
      const o = (py * c.width + px) * 4
      let col: [number, number, number]
      const out = outsideWalk(x, z)
      if (town && x >= town.minX && x <= town.maxX && z >= town.minZ && z <= town.maxZ) col = hex('#d8cdb8')
      else if (out > 0) col = out < 1.4 ? hillEdge : hill
      else {
        const t = (Math.floor(x) * 7 + Math.floor(z) * 13) & 1
        col = pal[regionAt(x, z)][t]
      }
      img.data[o] = col[0]
      img.data[o + 1] = col[1]
      img.data[o + 2] = col[2]
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)

  g.save()
  g.scale(PPM, PPM)
  g.translate(-MAP.x0, -MAP.z0)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // 2) 樹叢：森林、林道、山谷撒一些深綠圓點（固定亂數種子），避開道路與河
  const rnd = mulberry32(4242)
  g.fillStyle = 'rgba(46, 104, 70, 0.55)'
  for (let i = 0, n = 0; i < 4000 && n < 650; i++) {
    const x = WALK.minX + rnd() * (WALK.maxX - WALK.minX)
    const z = WALK.minZ + rnd() * (WALK.maxZ - WALK.minZ)
    const r = regionAt(x, z)
    if (r === 'village' || r === 'meadow') continue
    if (r === 'ruins' && rnd() < 0.6) continue
    if (distToAnyRoad(x, z) < 1.2 || Math.abs(z - riverZ(x)) < 3) continue
    g.beginPath()
    g.arc(x, z, 0.9 + rnd() * 0.8, 0, Math.PI * 2)
    g.fill()
    n++
  }

  // 3) 河流
  const river = RIVER.curve.getPoints(220)
  const trace = (pts: { x: number; z: number }[]) => {
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)))
  }
  g.strokeStyle = '#4f9fc9'
  g.lineWidth = RIVER.hw * 2 + 1
  trace(river)
  g.stroke()
  g.strokeStyle = '#8fd4f6'
  g.lineWidth = RIVER.hw * 2
  trace(river)
  g.stroke()

  // 4) 道路（外框＋路面）與村子廣場
  for (const r of ROADS) {
    const pts = r.curve.getSpacedPoints(Math.max(8, Math.ceil(r.curve.getLength() / 1.5)))
    g.strokeStyle = '#b79f74'
    g.lineWidth = r.width + 1
    trace(pts)
    g.stroke()
    g.strokeStyle = '#efdcae'
    g.lineWidth = r.width + 0.3
    trace(pts)
    g.stroke()
  }
  g.fillStyle = '#efdcae'
  g.strokeStyle = '#b79f74'
  g.lineWidth = 0.5
  g.beginPath()
  g.arc(PLAZA.x, PLAZA.z, PLAZA.r, 0, Math.PI * 2)
  g.fill()
  g.stroke()

  // 5) 橋（吊橋放下前由動態層畫）
  for (const b of BRIDGES) {
    if (b.locked) continue
    g.save()
    g.translate(b.x, b.z)
    g.rotate(-b.rot)
    g.fillStyle = b.style === 'stone' ? '#bdb5a6' : '#a67c52'
    g.strokeStyle = '#6e5a42'
    g.lineWidth = 0.35
    g.fillRect(-b.hw - 0.2, -b.len / 2, b.hw * 2 + 0.4, b.len)
    g.strokeRect(-b.hw - 0.2, -b.len / 2, b.hw * 2 + 0.4, b.len)
    g.restore()
  }

  // 6) 房屋（屋頂顏色）
  for (const h of HOUSES) {
    g.fillStyle = h.roof
    g.strokeStyle = 'rgba(60, 40, 30, 0.7)'
    g.lineWidth = 0.35
    g.fillRect(h.x - h.w / 2, h.z - h.d / 2, h.w, h.d)
    g.strokeRect(h.x - h.w / 2, h.z - h.d / 2, h.w, h.d)
  }

  // 7) 北方山脊（中間留隘口缺口）
  g.strokeStyle = '#a39c8e'
  g.lineWidth = 2.4
  const gap = PASS.halfGap + 0.4
  for (const [x0, x1] of [
    [-19, PASS.x - gap],
    [PASS.x + gap, 19.5],
  ]) {
    g.beginPath()
    g.moveTo(x0, RIDGE_Z)
    g.lineTo(x1, RIDGE_Z)
    g.stroke()
  }

  // 8) 古代石環、月泉、星晶林
  g.fillStyle = 'rgba(225, 216, 190, 0.9)'
  g.strokeStyle = '#8f8670'
  g.lineWidth = 0.6
  g.beginPath()
  g.arc(RUINS.x, RUINS.z, RUINS.r + 0.6, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = '#9fe0e8'
  g.strokeStyle = '#5fb4c4'
  g.beginPath()
  g.arc(SPRING.x, SPRING.z, SPRING.r, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = 'rgba(190, 236, 255, 0.85)'
  g.strokeStyle = '#7fc8e8'
  g.beginPath()
  g.arc(GROVE.x, GROVE.z, GROVE.r, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.restore()

  baseCanvas = c
  return c
}

// ── 標記 ─────────────────────────────────────────────
const DARK = 'rgba(30, 22, 40, 0.85)'

function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, text?: string, stroke = DARK) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
  g.lineWidth = Math.max(1, r * 0.22)
  g.strokeStyle = stroke
  g.stroke()
  if (text) {
    g.fillStyle = '#fff'
    g.font = `900 ${Math.round(r * 1.25)}px system-ui, "Noto Sans TC", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, x, y + r * 0.06)
  }
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#fff') {
  g.font = `800 ${size}px system-ui, "Noto Sans TC", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'top'
  g.lineWidth = Math.max(2, size * 0.28)
  g.strokeStyle = 'rgba(30, 22, 40, 0.8)'
  g.lineJoin = 'round'
  g.strokeText(text, x, y)
  g.fillStyle = color
  g.fillText(text, x, y)
}
function arrowHead(g: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, fill: string, stroke = DARK) {
  g.save()
  g.translate(x, y)
  g.rotate(ang)
  g.beginPath()
  g.moveTo(0, -size)
  g.lineTo(size * 0.72, size * 0.78)
  g.lineTo(0, size * 0.36)
  g.lineTo(-size * 0.72, size * 0.78)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  g.lineWidth = Math.max(1, size * 0.15)
  g.strokeStyle = stroke
  g.lineJoin = 'round'
  g.stroke()
  g.restore()
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, pulse: number) {
  g.beginPath()
  g.arc(x, y, r * (1.5 + pulse * 0.7), 0, Math.PI * 2)
  g.fillStyle = `rgba(255, 224, 120, ${0.32 - pulse * 0.22})`
  g.fill()
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.5 : r
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fillStyle = '#ffd84a'
  g.fill()
  g.lineWidth = Math.max(1, r * 0.2)
  g.strokeStyle = '#7a4a00'
  g.lineJoin = 'round'
  g.stroke()
}

/** 地圖上的固定地標（有名字的地方） */
const LANDMARKS: { x: number; z: number; text: string; glyph: string; fill: string }[] = [
  { x: WINDMILL.x, z: WINDMILL.z, text: '風車', glyph: '風', fill: '#8fb8d8' },
  { x: ELDER_TREE.x, z: ELDER_TREE.z, text: '古老巨木', glyph: '樹', fill: '#4f9a62' },
]
const REGION_LABELS: { id: keyof typeof REGIONS; x: number; z: number }[] = [
  { id: 'village', x: 0, z: -13 },
  { id: 'meadow', x: 18, z: 16 },
  { id: 'forest', x: -27, z: 2 },
  { id: 'ruins', x: 27.5, z: -29 },
  { id: 'northwoods', x: -9, z: -33 },
  { id: 'valley', x: -14, z: -68 },
]

export interface DrawOpts {
  mode: 'mini' | 'full'
  /** 動畫時間（秒），任務星星的呼吸用 */
  time: number
}

/** 目前任務目標在地圖上的位置（沒有就 null） */
export const mapQuestTarget = () => questTarget()

/** 把世界轉成畫面後畫出動態標記 */
export function drawMarkers(g: CanvasRenderingContext2D, v: MapView, o: DrawOpts, W: number, H: number) {
  const full = o.mode === 'full'
  const u = full ? Math.max(5.5, Math.min(W, H) / 62) : Math.max(3.2, W / 34) // 標記基本大小（畫面像素）
  const inView = (x: number, y: number, pad = 0) => (full ? x > -pad && y > -pad && x < W + pad && y < H + pad : Math.hypot(x - v.cx, y - v.cy) < W / 2 + pad)
  const unlocked = progress.unlocks.includes('east_bridge')

  // 吊橋：放下前畫成虛線的缺口，放下後是橋
  for (const b of BRIDGES) {
    if (!b.locked) continue
    const [x, y] = project(v, b.x, b.z)
    if (!inView(x, y, u * 3)) continue
    g.save()
    g.translate(x, y)
    g.rotate(-b.rot + v.a)
    const w = (b.hw * 2 + 0.4) * v.s
    const l = b.len * v.s
    if (unlocked) {
      g.fillStyle = '#a67c52'
      g.fillRect(-w / 2, -l / 2, w, l)
      g.strokeStyle = '#6e5a42'
      g.lineWidth = 1
      g.strokeRect(-w / 2, -l / 2, w, l)
    } else {
      g.strokeStyle = 'rgba(110, 90, 66, 0.9)'
      g.lineWidth = Math.max(1, v.s * 0.3)
      g.setLineDash([v.s * 0.9, v.s * 0.7])
      g.strokeRect(-w / 2, -l / 2, w, l)
    }
    g.restore()
  }

  // 大地圖：區域名稱
  if (full) {
    for (const r of REGION_LABELS) {
      const [x, y] = project(v, r.x, r.z)
      const here = regionAt(runtime.player.x, runtime.player.z) === r.id
      label(g, REGIONS[r.id].name, x, y - u * 0.9, u * 1.7, here ? '#ffe9a8' : 'rgba(255,255,255,0.92)')
    }
  }

  // 地標
  for (const m of LANDMARKS) {
    const [x, y] = project(v, m.x, m.z)
    if (!inView(x, y, u * 2)) continue
    badge(g, x, y, u * 0.95, m.fill, full ? m.glyph : undefined)
    if (full) label(g, m.text, x, y + u * 1.2, u * 1.4)
  }
  {
    const e = ENTRANCES[0]
    const [x, y] = project(v, e.x, e.z)
    if (inView(x, y, u * 2)) {
      badge(g, x, y, u * 1.15, '#e0a85a', full ? '城' : undefined)
      if (full) label(g, '星光鎮', x, y + u * 1.4, u * 1.5)
    }
  }

  // 怪物營地（大地圖：固定標示等級；小地圖改畫即時的怪物）
  if (full) {
    for (const c of CAMPS) {
      const [x, y] = project(v, c.x, c.z)
      const elite = c.tier === 'elite'
      g.beginPath()
      g.arc(x, y, v.s * 3.2, 0, Math.PI * 2)
      g.fillStyle = elite ? 'rgba(255, 150, 60, 0.28)' : 'rgba(255, 80, 90, 0.26)'
      g.fill()
      g.lineWidth = 1
      g.strokeStyle = elite ? 'rgba(255, 150, 60, 0.9)' : 'rgba(255, 80, 90, 0.85)'
      g.setLineDash([3, 3])
      g.stroke()
      g.setLineDash([])
      label(g, 'Lv' + c.level, x, y - u * 0.7, u * 1.35, '#fff3f3')
    }
    for (const b of AREA_BOSSES) {
      const [x, y] = project(v, b.x, b.z)
      badge(g, x, y, u * 1.05, b.tier === 'boss' ? '#a85bf0' : '#f08a3c', b.tier === 'boss' ? '王' : '精')
      label(g, b.name, x, y - u * 2.5, u * 1.3)
    }
  }

  // 可互動物件：村長、商人、寶箱、調查點、待招募的夥伴
  for (const it of interactables()) {
    if (it.kind === 'notice') continue
    const [x, y] = project(v, it.x, it.z)
    if (!inView(x, y, u * 2)) continue
    switch (it.kind) {
      case 'elder':
        badge(g, x, y, u * 1.05, '#f2b134', it.marker ? '!' : '村')
        if (full) label(g, '村長', x, y + u * 1.3, u * 1.4)
        break
      case 'merchant':
        badge(g, x, y, u * 0.95, '#35b3a6', '商')
        if (full) label(g, '商人', x, y + u * 1.2, u * 1.4)
        break
      case 'companion':
        badge(g, x, y, u * 1.05, '#4aa3ff', '!')
        if (full) label(g, '夥伴', x, y + u * 1.3, u * 1.4)
        break
      case 'chest':
        g.fillStyle = '#ffc94a'
        g.strokeStyle = '#7a4a00'
        g.lineWidth = 1.2
        g.fillRect(x - u * 0.75, y - u * 0.55, u * 1.5, u * 1.1)
        g.strokeRect(x - u * 0.75, y - u * 0.55, u * 1.5, u * 1.1)
        if (full) label(g, '寶箱', x, y + u * 0.8, u * 1.3)
        break
      case 'lever':
        if (full) {
          badge(g, x, y, u * 0.85, '#9a8fa8', '轉')
          label(g, '絞盤', x, y + u * 1.1, u * 1.3)
        }
        break
      default: {
        // 石環祭壇、月光石碑、星晶簇、月泉：任務進行到那裡才亮成金色
        badge(g, x, y, u * 0.95, it.marker ? '#f2b134' : '#7f86d8', it.marker ? '!' : '◆')
        if (full) label(g, it.name, x, y + u * 1.2, u * 1.4)
      }
    }
  }

  // 小地圖：即時的怪物（紅＝一般、橘＝精英、紫＝Boss）
  if (!full) {
    const range = MINI_RADIUS + 3
    const hero = combat.units.find((q) => q.team === 'party')
    for (const e of combat.units) {
      if (e.team !== 'enemy' || !e.alive) continue
      if (Math.abs(e.x - v.px) > range || Math.abs(e.z - v.pz) > range) continue
      const [x, y] = project(v, e.x, e.z)
      if (!inView(x, y, 0)) continue
      const tier = e.tier
      const r = tier === 'boss' ? u * 1.05 : tier === 'elite' ? u * 0.85 : u * 0.6
      badge(g, x, y, r, tier === 'boss' ? '#a85bf0' : tier === 'elite' ? '#f08a3c' : '#ff5d6c', undefined, 'rgba(60, 10, 20, 0.85)')
      if (hero && hero.targetId === e.id) {
        g.beginPath()
        g.arc(x, y, r + u * 0.45, 0, Math.PI * 2)
        g.strokeStyle = '#fff'
        g.lineWidth = 1.5
        g.stroke()
      }
    }
  }

  // 任務目標：金色星星；小地圖超出範圍時貼在邊緣當指針
  const qt = questTarget()
  if (qt) {
    const pulse = (Math.sin(o.time * 4) + 1) / 2
    let [x, y] = project(v, qt.x, qt.z)
    if (full) star(g, x, y, u * 1.55, pulse)
    else {
      const dx = x - v.cx
      const dy = y - v.cy
      const R = W / 2 - u * 1.9
      const d = Math.hypot(dx, dy)
      if (d > R) {
        x = v.cx + (dx / d) * R
        y = v.cy + (dy / d) * R
        arrowHead(g, x, y, Math.atan2(dx, -dy), u * 1.1, '#ffd84a', '#7a4a00')
      } else star(g, x, y, u * 1.35, pulse)
    }
  }

  // 隊友與主角
  const party = combat.units.filter((q) => q.team === 'party')
  for (let i = party.length - 1; i >= 0; i--) {
    const q = party[i]
    const cls = q.classId ? CLASSES[q.classId] : null
    const [x, y] = project(v, i === 0 ? runtime.player.x : q.x, i === 0 ? runtime.player.z : q.z)
    if (!inView(x, y, 0)) continue
    if (i > 0) {
      badge(g, x, y, u * 0.78, q.alive ? cls?.colors.primary ?? '#fff' : '#888', undefined, cls?.colors.accent ?? '#fff')
    } else {
      arrowHead(g, x, y, heroArrowAngle(runtime.player.facing, v.a), u * 1.75, '#ffffff', '#3a2c4a')
      g.beginPath()
      g.arc(x, y, u * 0.34, 0, Math.PI * 2)
      g.fillStyle = cls?.colors.primary ?? '#e8588a'
      g.fill()
    }
  }
}

/** 主角箭頭在畫面上的角度（從正上方順時針）：facing 是世界方向（0 = 南、π/2 = 東），再加上地圖旋轉 */
export const heroArrowAngle = (facing: number, mapRot: number) => Math.atan2(Math.sin(facing), -Math.cos(facing)) + mapRot

/** 小地圖：圓形、鏡頭前方朝上，畫面像素 size × size */
export function drawMini(g: CanvasRenderingContext2D, size: number, time: number) {
  const p = runtime.player
  const v: MapView = { cx: size / 2, cy: size / 2, s: size / 2 / MINI_RADIUS, a: runtime.cam.yaw, px: p.x, pz: p.z }
  g.clearRect(0, 0, size, size)
  g.save()
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = '#2f4f48'
  g.fillRect(0, 0, size, size)
  g.save()
  g.translate(v.cx, v.cy)
  g.rotate(v.a)
  g.scale(v.s, v.s)
  g.translate(-v.px, -v.pz)
  g.drawImage(baseMap(), MAP.x0, MAP.z0, MAP.w, MAP.h)
  g.restore()
  // 邊緣暗角，讓圓框看起來有深度
  const grad = g.createRadialGradient(v.cx, v.cy, size * 0.36, v.cx, v.cy, size / 2)
  grad.addColorStop(0, 'rgba(20, 16, 30, 0)')
  grad.addColorStop(1, 'rgba(20, 16, 30, 0.38)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  drawMarkers(g, v, { mode: 'mini', time }, size, size)
  g.restore()
  // 正北標記 N（跟著地圖轉）
  const rr = size / 2 - Math.max(5, size * 0.05)
  const nx = v.cx + rr * Math.sin(v.a)
  const ny = v.cy - rr * Math.cos(v.a)
  badge(g, nx, ny, Math.max(5, size * 0.05), '#3c3050', 'N', 'rgba(255,255,255,0.7)')
}

/** 大地圖：整張地圖、正北朝上，置中縮放到放得下 */
export function drawFull(g: CanvasRenderingContext2D, W: number, H: number, time: number) {
  const s = Math.min(W / MAP.w, H / MAP.h)
  const v: MapView = { cx: W / 2, cy: H / 2, s, a: 0, px: MAP.x0 + MAP.w / 2, pz: MAP.z0 + MAP.h / 2 }
  g.clearRect(0, 0, W, H)
  g.imageSmoothingQuality = 'high'
  g.drawImage(baseMap(), v.cx - (MAP.w * s) / 2, v.cy - (MAP.h * s) / 2, MAP.w * s, MAP.h * s)
  drawMarkers(g, v, { mode: 'full', time }, W, H)
}

/** 玩家目前在哪個區域（大地圖側欄用） */
export const hereRegion = () => regionAt(runtime.player.x, runtime.player.z)
