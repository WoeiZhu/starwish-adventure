// 戰鬥特效資料：粒子與形狀（光環、刀光、光柱、閃光）都用固定大小的循環池，
// 這裡只管資料與更新，畫面由 scene/CombatFx.tsx 繪製。
import * as THREE from 'three'
import { runtime } from '../runtime'
import { vfxBus } from '../../vfx/bus'
import { clearSkillRuns } from './skillRunner'

export interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  dur: number
  size: number
  r: number
  g: number
  b: number
  gravity: number
  drag: number
  /** 拉長成直線（箭雨、隕石、拖尾） */
  streak: boolean
}

export type ShapeKind = 'ring' | 'slash' | 'pillar' | 'flash'
export interface Shape {
  kind: ShapeKind
  x: number
  y: number
  z: number
  rot: number
  /** 起始 / 結束大小 */
  s0: number
  s1: number
  life: number
  dur: number
  color: string
}

export const PARTICLE_MAX = 700
export const SHAPE_MAX = 48

export const particles: Particle[] = Array.from({ length: PARTICLE_MAX }, () => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 0,
  dur: 1,
  size: 0.1,
  r: 1,
  g: 1,
  b: 1,
  gravity: 0,
  drag: 0,
  streak: false,
}))
export const shapes: Shape[] = Array.from({ length: SHAPE_MAX }, () => ({
  kind: 'ring' as ShapeKind,
  x: 0,
  y: 0,
  z: 0,
  rot: 0,
  s0: 0,
  s1: 1,
  life: 0,
  dur: 1,
  color: '#fff',
}))

let pCursor = 0
let sCursor = 0
const colorCache = new Map<string, THREE.Color>()
function rgb(color: string) {
  let c = colorCache.get(color)
  if (!c) {
    c = new THREE.Color(color)
    colorCache.set(color, c)
  }
  return c
}

export interface EmitOpts {
  vx?: number
  vy?: number
  vz?: number
  life?: number
  size?: number
  gravity?: number
  drag?: number
  streak?: boolean
}
export function emit(x: number, y: number, z: number, color: string, o: EmitOpts = {}) {
  const p = particles[pCursor++ % PARTICLE_MAX]
  const c = rgb(color)
  p.x = x
  p.y = y
  p.z = z
  p.vx = o.vx ?? 0
  p.vy = o.vy ?? 0
  p.vz = o.vz ?? 0
  p.dur = p.life = o.life ?? 0.4
  p.size = o.size ?? 0.09
  p.r = c.r
  p.g = c.g
  p.b = c.b
  p.gravity = o.gravity ?? 0
  p.drag = o.drag ?? 0
  p.streak = !!o.streak
}

/** 向四周噴發的粒子（命中火花、爆炸、史萊姆濺開） */
export function burst(
  x: number,
  y: number,
  z: number,
  color: string,
  count: number,
  speed: number,
  o: { up?: number; gravity?: number; size?: number; life?: number } = {},
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = speed * (0.4 + Math.random() * 0.8)
    emit(x, y, z, color, {
      vx: Math.cos(a) * s,
      vz: Math.sin(a) * s,
      vy: (o.up ?? 2) * (0.3 + Math.random()),
      gravity: o.gravity ?? 9,
      drag: 2.5,
      size: (o.size ?? 0.09) * (0.6 + Math.random() * 0.8),
      life: (o.life ?? 0.45) * (0.6 + Math.random() * 0.7),
    })
  }
}

function shape(kind: ShapeKind, x: number, y: number, z: number, color: string, s0: number, s1: number, dur: number, rot = 0) {
  const s = shapes[sCursor++ % SHAPE_MAX]
  s.kind = kind
  s.x = x
  s.y = y
  s.z = z
  s.rot = rot
  s.s0 = s0
  s.s1 = s1
  s.dur = s.life = dur
  s.color = color
}

/** 地面擴散光環 */
export const ring = (x: number, z: number, color: string, r0: number, r1: number, dur = 0.4) =>
  shape('ring', x, 0.09, z, color, r0, r1, dur)
/** 朝 facing 方向揮出的弧形刀光 */
export const slash = (x: number, z: number, facing: number, color: string, reach = 1.5, dur = 0.2) =>
  shape('slash', x, 0.85, z, color, reach * 0.7, reach, dur, facing)
/** 從腳下升起的光柱（施法、必殺技、增益） */
export const pillar = (x: number, z: number, color: string, radius = 0.7, height = 4, dur = 0.55) =>
  shape('pillar', x, 0, z, color, radius, height, dur)
/** 球形閃光（命中、爆炸） */
export const flash = (x: number, y: number, z: number, color: string, size = 0.7, dur = 0.16) =>
  shape('flash', x, y, z, color, size * 0.35, size, dur)

/** 鏡頭震動：取較大值，由 CameraRig 逐幀衰減 */
export function shake(amount: number) {
  runtime.shake = Math.max(runtime.shake, amount)
}

export function updateFx(dt: number) {
  for (const p of particles) {
    if (p.life <= 0) continue
    p.life -= dt
    p.vy -= p.gravity * dt
    const k = Math.max(0, 1 - p.drag * dt)
    p.vx *= k
    p.vz *= k
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt
    if (p.y < 0.03 && p.gravity > 0) {
      p.y = 0.03
      p.vy = 0
      p.vx *= 0.5
      p.vz *= 0.5
    }
  }
  for (const s of shapes) if (s.life > 0) s.life -= dt
}

export function clearFx() {
  for (const p of particles) p.life = 0
  for (const s of shapes) s.life = 0
  // 技能時間軸與技能特效系統也一起清掉（換地圖、重新開始）
  clearSkillRuns()
  vfxBus.requestClear()
}
