// 每幀變動的資料放這裡（不進 Zustand，避免 60fps 觸發 React 重繪）。
import { SPAWN, type Vec2 } from '../data/world'

export const WALK_SPEED = 3.2
export const RUN_SPEED = 6.2
export const PLAYER_RADIUS = 0.32

export const runtime = {
  player: { x: SPAWN.x, z: SPAWN.z, facing: 0, speed: 0 },
  cam: { yaw: 0, dist: 12 },
  /** 點擊移動的剩餘路徑點；null 代表沒有自動移動 */
  path: null as Vec2[] | null,
  marker: { x: 0, z: 0, life: 0 },
  /** 主角身邊最近的可互動物件 id */
  nearId: null as string | null,
  /** 鏡頭震動強度，由 CameraRig 逐幀衰減 */
  shake: 0,
  /** 點擊怪物後自動走到攻擊距離內 */
  approach: false,
  /** 距離不夠時排隊的技能編號，進入射程後自動施放 */
  queuedSkill: null as number | null,
  /** 閃避翻滾：request 由輸入設定，time > 0 表示翻滾中 */
  dodge: { request: false, time: 0, cd: 0, dx: 0, dz: 0 },
  /** 手機上最後一次拖曳 / 雙指縮放鏡頭的時間（ms）；剛做完手勢時不把放開手指當成點地面 */
  gestureAt: -1e9,
}

export function resetRuntime() {
  runtime.player.x = SPAWN.x
  runtime.player.z = SPAWN.z
  runtime.player.facing = 0
  runtime.player.speed = 0
  runtime.path = null
  runtime.marker.life = 0
  runtime.nearId = null
  runtime.approach = false
  runtime.queuedSkill = null
  runtime.shake = 0
  Object.assign(runtime.dodge, { request: false, time: 0, cd: 0 })
}
