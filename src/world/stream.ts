// 區塊串流管理：依主角位置決定哪些區塊要載入、哪些可以卸載。
//   - 載入距離內的區塊排進待建清單（由近到遠），每幀只建幾個，避免卡頓。
//   - 接近區域出口（橋、隘口、交界）時，預先載入出口另一側。
//   - 超過卸載距離才卸載（比載入距離大，來回走不會反覆重建）。
//   - 讀檔或傳送時，主角周圍的區塊全部準備好之前，不允許移動。
import { regionAt } from '../data/regions'
import { allPortals } from '../systems/pathfinding'
import { CS, chunkCenter, chunkExists, chunkKey } from './chunks'
import { STREAM } from './config'

interface ChunkState {
  cx: number
  cz: number
  /** 排進清單的時間（ms） */
  requested: number
  /** 建好的時間；0 = 還在建 */
  readyAt: number
  buildMs: number
}

const listeners = new Set<() => void>()
const active = new Map<string, ChunkState>()
let pending: { key: string; cx: number; cz: number; d: number }[] = []
let primeAt = 0
let primePos: { x: number; z: number } | null = null

export const streamLog = {
  loads: 0,
  unloads: 0,
  /** 最近幾次區塊建立時間（ms） */
  buildMs: [] as number[],
  /** 最近一次讀檔／開局：從開始到主角周圍準備好的時間（ms） */
  primeMs: 0,
  preloadedByExit: 0,
}

function emit() {
  for (const l of listeners) l()
}
export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
/** 目前要畫出來的區塊（React 用） */
export function activeKeys() {
  return [...active.keys()]
}
export function isLoaded(x: number, z: number) {
  return active.has(chunkKey(Math.floor(x / CS), Math.floor(z / CS)))
}

/** 主角周圍 r 公尺內的區塊是否都已建好 */
export function areaReady(x: number, z: number, r = STREAM.readyRadius) {
  for (let cx = Math.floor((x - r) / CS); cx <= Math.floor((x + r) / CS); cx++) {
    for (let cz = Math.floor((z - r) / CS); cz <= Math.floor((z + r) / CS); cz++) {
      if (!chunkExists(cx, cz)) continue
      const s = active.get(chunkKey(cx, cz))
      if (!s || !s.readyAt) return false
    }
  }
  return true
}

function wanted(x: number, z: number) {
  const out = new Map<string, { cx: number; cz: number; d: number }>()
  const add = (px: number, pz: number, r: number, bias = 0) => {
    for (let cx = Math.floor((px - r) / CS); cx <= Math.floor((px + r) / CS); cx++) {
      for (let cz = Math.floor((pz - r) / CS); cz <= Math.floor((pz + r) / CS); cz++) {
        if (!chunkExists(cx, cz)) continue
        const c = chunkCenter(cx, cz)
        const d = Math.hypot(c.x - px, c.z - pz)
        if (d > r + CS * 0.71) continue
        const k = chunkKey(cx, cz)
        const dd = Math.hypot(c.x - x, c.z - z) + bias
        const prev = out.get(k)
        if (!prev || prev.d > dd) out.set(k, { cx, cz, d: dd })
      }
    }
  }
  add(x, z, STREAM.loadRadius)
  // 區域出口預載：主角接近出口時，出口另一側也先載入
  const here = regionAt(x, z)
  let exits = 0
  for (const p of allPortals()) {
    if (p.a !== here && p.b !== here) continue
    if (Math.hypot(p.x - x, p.z - z) > STREAM.exitNear) continue
    add(p.x, p.z, STREAM.exitPreload, 4)
    exits++
  }
  streamLog.preloadedByExit = exits
  return out
}

let lastUpdate = -1
/** 每隔一小段時間依主角位置更新待建／卸載清單 */
export function updateStream(x: number, z: number, now = performance.now()) {
  if (now - lastUpdate < 150 && !primePos) return
  lastUpdate = now
  const want = wanted(x, z)
  let changed = false
  // 卸載：不在想要的清單裡、而且超過卸載距離
  for (const [k, s] of active) {
    if (want.has(k)) continue
    const c = chunkCenter(s.cx, s.cz)
    if (Math.hypot(c.x - x, c.z - z) > STREAM.unloadRadius) {
      active.delete(k)
      streamLog.unloads++
      changed = true
    }
  }
  pending = [...want].filter(([k]) => !active.has(k)).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.d - b.d)
  if (changed) emit()
}

/** 每幀呼叫：從待建清單取幾個區塊開始建立（React 依 activeKeys 畫出來） */
export function pumpStream(budget = STREAM.buildsPerFrame) {
  let n = 0
  while (pending.length && n < budget) {
    const p = pending.shift()!
    if (active.has(p.key)) continue
    active.set(p.key, { cx: p.cx, cz: p.cz, requested: performance.now(), readyAt: 0, buildMs: 0 })
    streamLog.loads++
    n++
  }
  if (n) emit()
  // 讀檔／開局：主角周圍準備好就記下時間
  if (primePos && areaReady(primePos.x, primePos.z)) {
    streamLog.primeMs = Math.round(performance.now() - primeAt)
    primePos = null
    emit()
  }
}

/** 區塊的網格建好（React 掛載完成）時呼叫 */
export function markReady(key: string, buildMs: number) {
  const s = active.get(key)
  if (!s) return
  s.readyAt = performance.now()
  s.buildMs = buildMs
  streamLog.buildMs.push(Math.round(buildMs * 10) / 10)
  if (streamLog.buildMs.length > 200) streamLog.buildMs.shift()
}

/** 讀檔或開新局：先清掉離太遠的區塊，再以新位置為中心載入 */
export function primeStream(x: number, z: number) {
  primeAt = performance.now()
  primePos = { x, z }
  lastUpdate = -1
  updateStream(x, z)
}
export const isPriming = () => primePos !== null

export function streamStats() {
  const ms = streamLog.buildMs
  return {
    active: active.size,
    pending: pending.length,
    loads: streamLog.loads,
    unloads: streamLog.unloads,
    buildAvgMs: ms.length ? Math.round((ms.reduce((a, b) => a + b, 0) / ms.length) * 10) / 10 : 0,
    buildMaxMs: ms.length ? Math.max(...ms) : 0,
    primeMs: streamLog.primeMs,
    exitsNear: streamLog.preloadedByExit,
  }
}
