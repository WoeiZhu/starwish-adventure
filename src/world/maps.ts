// 目前所在的地圖（主線世界 / 星光鎮）。每幀都會讀，所以放在模組變數，不進 Zustand；
// React 需要重畫的部分（場景切換、HUD 地名）另外看 store 的 mapId。
import type { MapId } from '../data/town'

export const mapState = {
  id: 'overworld' as MapId,
  /** 城鎮模型還在下載／解碼：主角不出現、不能移動 */
  loading: false,
  /** 開始載入的時間（ms，量載入時間用） */
  loadStartedAt: 0,
  /** 最近一次城鎮從開始載入到可以移動的時間（ms） */
  lastLoadMs: 0,
}

export const inTown = () => mapState.id !== 'overworld'

const listeners = new Set<() => void>()
export function subscribeMap(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function setMapLoading(v: boolean) {
  if (mapState.loading === v) return
  mapState.loading = v
  if (v) mapState.loadStartedAt = performance.now()
  else mapState.lastLoadMs = Math.round(performance.now() - mapState.loadStartedAt)
  for (const l of listeners) l()
}
export const isMapLoading = () => mapState.loading
