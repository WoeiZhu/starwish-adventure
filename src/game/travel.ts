// 地圖切換：主線世界 ↔ 星光鎮。
//   - 走進城門的圓就切換；切換後要先走出那個圓才會再啟用，而且有 1.5 秒冷卻（不會一進城就被彈回去）。
//   - 切換時：野外的怪物、掉落物先收起來（回來時放回去），投射物、範圍效果、舊路徑清掉；
//     隊伍、任務、裝備、背包都不動。
//   - 進城時記下「返回位置」（城門外），存檔也會記住，讀檔時先載入所在地圖再放上人物。
import { PORTAL_COOLDOWN_MS, inTrigger, TOWN_EXIT, TOWN_ID, TOWN_NAME, TOWN_PORTAL, TOWN_SPAWN, type MapId } from '../data/town'
import { mapState, setMapLoading } from '../world/maps'
import { isPriming, primeStream, resetStream } from '../world/stream'
import { combat, hero, placeParty, restoreWorld, stashWorld } from './combat/state'
import { cancelCutscene, queueTownIntro } from './cutscene'
import { runtime } from './runtime'
import { useGame } from './store'

export interface MapSpot {
  x: number
  z: number
  facing: number
}

export const travel = {
  /** 在城裡時：出城後回到的位置（主線世界座標）；在野外時為 null */
  returnPortal: null as MapSpot | null,
  /** 剛切換地圖：要先離開出口範圍才會啟用 */
  armed: true,
  /** 上次切換地圖的時間（ms） */
  lastAt: -1e9,
  /** 統計：切換次數（測試用） */
  switches: 0,
}

function clearMotion() {
  runtime.path = null
  runtime.approach = false
  runtime.queuedSkill = null
  runtime.marker.life = 0
  runtime.nearId = null
  Object.assign(runtime.dodge, { request: false, time: 0 })
}

/** 切到指定地圖、放在指定位置（隊友排在身後） */
export function enterMap(id: MapId, at: MapSpot) {
  clearMotion()
  runtime.player.x = at.x
  runtime.player.z = at.z
  runtime.player.facing = at.facing
  runtime.player.speed = 0
  mapState.id = id
  if (id === 'overworld') {
    cancelCutscene()
    restoreWorld()
    setMapLoading(false)
    // 回到野外：從城門外重新載入周圍區塊（載好之前主角不出現、不能動）
    resetStream()
    primeStream(at.x, at.z)
  } else {
    stashWorld()
    resetStream()
    // 城鎮模型載入完成（scene/Town.tsx）才會設回 false
    setMapLoading(true)
    // 第一次進城：載入完成後播過場
    queueTownIntro()
  }
  placeParty(at, at.facing)
  travel.armed = false
  travel.lastAt = performance.now()
  travel.switches++
  useGame.getState().setMap(id)
}

/** 每幀檢查：主角是否走進城門 */
export function updatePortals() {
  const g = useGame.getState()
  if (g.phase !== 'playing' || g.paused || g.dialog || isPriming() || mapState.loading) return
  const h = hero()
  if (!h || !h.alive) return
  const p = runtime.player
  const t = mapState.id === 'overworld' ? TOWN_PORTAL.trigger : TOWN_EXIT
  const inside = inTrigger(t, p.x, p.z)
  if (!travel.armed) {
    if (!inside) travel.armed = true
    return
  }
  if (!inside || performance.now() - travel.lastAt < PORTAL_COOLDOWN_MS) return

  if (mapState.id === 'overworld') {
    // 被事件戰、精英或首領盯上時不能進城（不然城門就成了逃離強敵的捷徑）；要先走出城門範圍再進來。
    // 一般野怪不擋：城門旁就有史萊姆營地，進城後牠們會自己回家
    if (combat.units.some((u) => u.team === 'enemy' && u.alive && u.targetId !== null && (u.tag !== null || u.tier !== 'normal'))) {
      travel.armed = false
      g.showToast('強敵還在追你，現在不能進城')
      return
    }
    travel.returnPortal = { ...TOWN_PORTAL.ret }
    enterMap(TOWN_ID, TOWN_SPAWN)
  } else {
    const ret = travel.returnPortal ?? TOWN_PORTAL.ret
    travel.returnPortal = null
    enterMap('overworld', ret)
  }
  useGame.getState().saveGame()
}

/** 城鎮模型載入失敗：退回城門外，進度不受影響 */
export function townLoadFailed() {
  if (mapState.id === 'overworld') return
  const ret = travel.returnPortal ?? TOWN_PORTAL.ret
  travel.returnPortal = null
  enterMap('overworld', ret)
  // 晚一點再顯示：換地圖時 HUD 會先顯示地名，避免把這句蓋掉
  setTimeout(() => useGame.getState().showToast(`${TOWN_NAME}載入失敗，已回到城門外`), 400)
  useGame.getState().saveGame()
}

/** 讀檔：先決定地圖並開始載入，人物等地圖準備好才出現（initCombat 之後呼叫） */
export function arriveFromSave(id: MapId, pos: { x: number; z: number }, ret: MapSpot | null) {
  clearMotion()
  cancelCutscene() // 讀檔時人已經在城裡了，不播進城過場
  mapState.id = id
  travel.armed = false
  travel.lastAt = performance.now()
  // 存檔沒有記面向：城裡面向城鎮內部，野外照舊面向南方
  runtime.player.facing = id === 'overworld' ? 0 : TOWN_SPAWN.facing
  placeParty(pos, runtime.player.facing)
  if (id === 'overworld') {
    travel.returnPortal = null
    setMapLoading(false)
    primeStream(pos.x, pos.z)
  } else {
    travel.returnPortal = ret ?? { ...TOWN_PORTAL.ret }
    stashWorld()
    resetStream()
    setMapLoading(true)
  }
}

/** 開新局、回標題：一律回到主線世界 */
export function resetMap() {
  cancelCutscene()
  mapState.id = 'overworld'
  setMapLoading(false)
  travel.returnPortal = null
  travel.armed = false
  travel.lastAt = performance.now()
}
