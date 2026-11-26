// 第一次進星光鎮的過場：引擎內鏡頭運鏡（沒有影片檔）。
//   - 觸發：第一次從城門走進新版城鎮（方案 B），城鎮準備好之後開始；存檔會記住（unlocks 裡的 intro_town），之後不再播。
//   - 內容：從城門上空俯瞰整座城 → 沿主街低飛向廣場 → 繞過噴水池 → 降到主角面前，最後平滑接回一般跟隨鏡頭。
//   - 播放時：主角不能動、HUD 隱藏、上下出現黑邊與字卡；按 Esc／Space／Enter／F、點畫面或「跳過」都能跳過
//     （跳過後仍有約 1 秒平滑回到一般鏡頭，不會硬切）。
//   - 自動測試（navigator.webdriver）預設不播，免得擋住既有流程；要測的時候把 cutscene.force 設為 true。
import * as THREE from 'three'
import { LAYOUT } from '../data/town'
import { mapState } from '../world/maps'
import { isPriming } from '../world/stream'
import { progress } from './progress'
import { useGame } from './store'

export type CutsceneState = 'idle' | 'pending' | 'active'

/** 總長（秒）：運鏡 + 最後接回一般鏡頭的過渡 */
export const CUTSCENE_DURATION = 9
/** 最後接回一般鏡頭的過渡長度（秒） */
export const CUTSCENE_BLEND_OUT = 1.4
export const INTRO_FLAG = 'intro_town'

export const cutscene = {
  state: 'idle' as CutsceneState,
  /** 已播放的時間（秒） */
  t: 0,
  /** 這次是不是被跳過 */
  skipped: false,
  /** 自動測試時強制啟用 */
  force: false,
  /** 統計：播過幾次（測試用） */
  played: 0,
}

const listeners = new Set<() => void>()
export function subscribeCutscene(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getCutsceneState = () => cutscene.state
function setState(s: CutsceneState) {
  if (cutscene.state === s) return
  cutscene.state = s
  for (const l of listeners) l()
}

const enabled = () => cutscene.force || typeof navigator === 'undefined' || !navigator.webdriver

/** 進城（切到城鎮地圖）時呼叫：第一次進新版城鎮才排進過場 */
export function queueTownIntro() {
  if (LAYOUT?.id !== 'B' || !enabled() || progress.unlocks.includes(INTRO_FLAG)) return
  cutscene.t = 0
  cutscene.skipped = false
  setState('pending')
}

/** 回到野外、開新局、回標題：清掉還沒播的過場 */
export function cancelCutscene() {
  if (cutscene.state !== 'idle') setState('idle')
}

/** 跳過：直接跳到最後的過渡段；還在載入時等於取消 */
export function skipCutscene() {
  if (cutscene.state === 'pending') {
    markSeen()
    setState('idle')
  } else if (cutscene.state === 'active' && cutscene.t < CUTSCENE_DURATION - CUTSCENE_BLEND_OUT) {
    cutscene.skipped = true
    cutscene.t = CUTSCENE_DURATION - CUTSCENE_BLEND_OUT
  }
}

function markSeen() {
  if (!progress.unlocks.includes(INTRO_FLAG)) progress.unlocks.push(INTRO_FLAG)
  useGame.getState().saveGame()
}

/** 每幀更新（CameraRig 呼叫）：載入完成就開始，播完就結束 */
export function updateCutscene(dt: number) {
  if (cutscene.state === 'pending') {
    if (mapState.loading || isPriming() || useGame.getState().phase !== 'playing') return
    cutscene.t = 0
    cutscene.played++
    markSeen()
    setState('active')
    return
  }
  if (cutscene.state !== 'active') return
  cutscene.t += dt
  if (cutscene.t >= CUTSCENE_DURATION) setState('idle')
}

// ── 運鏡路徑（城鎮座標；方案 B：城門在 z = 20，主角站在門內約 z = 15 面向北，廣場噴水池在 (0, -13)） ──
const POS = [
  new THREE.Vector3(-16, 30, 32), // 城門外高空，斜看整座城
  new THREE.Vector3(-5, 17, 6), // 越過城門，沿主街往廣場低飛
  new THREE.Vector3(9, 8, -6), // 廣場邊緣，繞過噴水池
  new THREE.Vector3(-6.5, 6.5, 4), // 轉回來，降到主角前上方，隊伍與守衛都入鏡
]
const LOOK = [new THREE.Vector3(0, 0, -12), new THREE.Vector3(0, 2, -16), new THREE.Vector3(0, 3, -18), new THREE.Vector3(0, 1.6, 16)]
let posCurve: THREE.CatmullRomCurve3 | null = null
let lookCurve: THREE.CatmullRomCurve3 | null = null

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

/** 目前過場鏡頭的位置與注視點；權重 w（1 = 完全用過場鏡頭，0 = 一般鏡頭） */
export function sampleCutscene(outPos: THREE.Vector3, outLook: THREE.Vector3) {
  posCurve ??= new THREE.CatmullRomCurve3(POS, false, 'catmullrom', 0.5)
  lookCurve ??= new THREE.CatmullRomCurve3(LOOK, false, 'catmullrom', 0.5)
  const pathEnd = CUTSCENE_DURATION - CUTSCENE_BLEND_OUT
  const x = Math.min(1, cutscene.t / pathEnd)
  // 起頭、收尾都放慢
  const u = 0.5 - 0.5 * Math.cos(Math.PI * x)
  posCurve.getPoint(u, outPos)
  lookCurve.getPoint(u, outLook)
  return 1 - smooth((cutscene.t - pathEnd) / CUTSCENE_BLEND_OUT)
}
