// 跟隨式相機：滾輪／雙指平滑縮放、右鍵 / Q E 旋轉、回正、防穿模。
// 三種模式：
//   探索（俯角 45～60°，看清楚地圖）、沉浸（俯角 20～35°，貼近角色看街景）、交談（對話時自動拉近說話的兩人）。
//   縮放超過一個模式的範圍就切到另一個模式；HUD 的「視角」按鈕（或 V 鍵）直接切換。
// 進出城：接近城門時鏡頭慢慢壓低、轉向城門；穿過城門換地圖後，從身後近景拉開到原本的模式。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TOWN_PORTAL } from '../data/town'
import { SPAWN } from '../data/world'
import { cutscene, sampleCutscene, updateCutscene } from '../game/cutscene'
import { interactables } from '../game/story'
import { inTown } from '../world/maps'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { cameraClearDistance } from '../systems/collision'
import { rotateAxis } from '../systems/input'

const deg = (d: number) => (d * Math.PI) / 180
export type CamMode = 'explore' | 'immersive'
/** 鏡頭模式：距離範圍、預設距離、俯角範圍 */
export const CAM_MODES: Record<CamMode, { minDist: number; maxDist: number; def: number; minPitch: number; maxPitch: number }> = {
  explore: { minDist: 10, maxDist: 36, def: 16, minPitch: deg(45), maxPitch: deg(60) },
  immersive: { minDist: 3.4, maxDist: 13, def: 8, minPitch: deg(20), maxPitch: deg(35) },
}
/** 交談：拉近到兩人之間、低俯角 */
const TALK = { dist: 5, pitch: deg(13) }

export const CAM = {
  minDist: CAM_MODES.immersive.minDist,
  maxDist: CAM_MODES.explore.maxDist,
  defaultDist: CAM_MODES.immersive.def,
  /** 近景 / 遠景的俯角（弧度） */
  nearPitch: 0.14,
  farPitch: 1.08,
  minHeight: 0.3,
  /** 右鍵拖曳可調的俯仰角範圍 */
  minPitch: 0.04,
  maxPitch: 1.45,
  maxTilt: 1.5,
}

const cinePos = new THREE.Vector3()
const cineLook = new THREE.Vector3()
const cineBase = new THREE.Vector3()
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerpAngle = (a: number, b: number, t: number) => a + wrap(b - a) * t

/** 對話時：主角身邊 4.5 m 內最近的人物（NPC、商人、隊友候選） */
function nearestPerson() {
  let best: { x: number; z: number } | null = null
  let bd = 4.5
  for (const it of interactables()) {
    if (it.kind !== 'elder' && it.kind !== 'merchant' && it.kind !== 'companion') continue
    const d = Math.hypot(it.x - runtime.player.x, it.z - runtime.player.z)
    if (d < bd) {
      bd = d
      best = it
    }
  }
  return best
}

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const phase = useGame((s) => s.phase)
  const resetTick = useGame((s) => s.cameraResetTick)
  const st = useRef({
    yaw: 0,
    yawT: 0,
    dist: 4,
    distT: CAM.defaultDist,
    eff: 4,
    tx: SPAWN.x,
    tz: SPAWN.z,
    /** 右鍵拖曳加上的俯仰角偏移（疊加在依距離決定的俯角上） */
    tilt: 0,
    tiltT: 0,
  })
  /** 交談與城門過渡的混合權重（0 = 一般跟隨） */
  const blend = useRef({ talk: 0, gate: 0, arrive: 0, talkX: 0, talkZ: 0, talkYaw: 0 })
  /** 走路自動轉向：自己轉過視角就暫停，直到停下來再出發 */
  const auto = useRef({ manual: false, still: 0 })

  // 開發模式：自動化測試可直接設定鏡頭方向與距離
  useEffect(() => {
    const sw = (window as unknown as { __sw?: Record<string, unknown> }).__sw
    if (import.meta.env.DEV && sw) sw.cam = st.current
  }, [])

  // 進入遊戲時從近景拉遠到中景
  useEffect(() => {
    if (phase !== 'playing') return
    Object.assign(st.current, {
      yaw: 0,
      yawT: 0,
      dist: 4,
      eff: 4,
      distT: CAM.defaultDist,
      tx: SPAWN.x,
      tz: SPAWN.z,
      tilt: 0,
      tiltT: 0,
    })
  }, [phase])

  // 進出城鎮：鏡頭直接跳到主角身後（不要從舊地圖的位置飛過去），面向主角的方向
  const mapId = useGame((s) => s.mapId)
  useEffect(() => {
    const c = st.current
    c.tx = runtime.player.x
    c.tz = runtime.player.z
    c.yaw = c.yawT = wrap(runtime.player.facing + Math.PI)
    c.eff = Math.min(c.eff, c.dist)
    // 換地圖後：從身後的近景、低角度開始，再慢慢拉開到目前模式（像穿過城門走進城裡）
    if (useGame.getState().phase === 'playing') {
      c.dist = c.eff = 5
      c.tilt = -0.25
      c.tiltT = 0
      c.distT = CAM_MODES[useGame.getState().camMode].def
      blend.current.arrive = 1
    }
  }, [mapId])

  // 相機回正：轉回預設方向、俯角與中景距離
  useEffect(() => {
    if (resetTick === 0) return
    st.current.yaw = wrap(st.current.yaw)
    st.current.yawT = 0
    st.current.tiltT = 0
    st.current.distT = CAM_MODES[useGame.getState().camMode].def
  }, [resetTick])

  // 切換模式：距離跳到該模式的預設值（平滑過去）
  const camMode = useGame((s) => s.camMode)
  useEffect(() => {
    st.current.distT = CAM_MODES[camMode].def
    st.current.tiltT = 0
  }, [camMode])

  useEffect(() => {
    const active = () => {
      const s = useGame.getState()
      return s.phase === 'playing' && !s.paused
    }
    let dragging = false
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!active()) return
      const d = st.current.distT * Math.exp(THREE.MathUtils.clamp(e.deltaY, -300, 300) * 0.0013)
      st.current.distT = THREE.MathUtils.clamp(d, CAM.minDist, CAM.maxDist)
    }
    let lastX = 0
    let lastY = 0
    // 右鍵拖曳：左右改水平角度、上下改俯仰角
    const onDown = (e: PointerEvent) => {
      if (e.button !== 2 || !active()) return
      e.preventDefault()
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      if (!(e.buttons & 2)) {
        dragging = false
        return
      }
      const c = st.current
      c.yawT -= (e.clientX - lastX) * 0.006
      auto.current.manual = true
      c.tiltT = THREE.MathUtils.clamp(c.tiltT + (e.clientY - lastY) * 0.005, -CAM.maxTilt, CAM.maxTilt)
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) dragging = false
    }
    const noMenu = (e: Event) => e.preventDefault()

    // 手機：單指拖曳轉鏡頭（移動超過門檻才算，短按仍是點地面 / 點怪物）、雙指開合縮放
    const touches = new Map<number, { x: number; y: number; sx: number; sy: number }>()
    let touchDrag = false
    let pinchDist = 0
    const pinchSpan = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })
      if (touches.size === 2) {
        pinchDist = pinchSpan()
        runtime.gestureAt = performance.now()
      }
    }
    const onTouchMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      const dx = e.clientX - t.x
      const dy = e.clientY - t.y
      t.x = e.clientX
      t.y = e.clientY
      if (!active()) return
      const c = st.current
      if (touches.size >= 2) {
        const span = pinchSpan()
        if (pinchDist > 0 && span > 0) {
          c.distT = THREE.MathUtils.clamp(c.distT * (pinchDist / span), CAM.minDist, CAM.maxDist)
        }
        pinchDist = span
        runtime.gestureAt = performance.now()
        return
      }
      if (!touchDrag && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 10) touchDrag = true
      if (touchDrag) {
        c.yawT -= dx * 0.008
        auto.current.manual = true
        c.tiltT = THREE.MathUtils.clamp(c.tiltT + dy * 0.006, -CAM.maxTilt, CAM.maxTilt)
        runtime.gestureAt = performance.now()
      }
    }
    const onTouchUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return
      if (touchDrag) runtime.gestureAt = performance.now()
      if (touches.size === 0) touchDrag = false
      pinchDist = touches.size === 2 ? pinchSpan() : 0
    }

    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('contextmenu', noMenu)
    dom.addEventListener('pointerdown', onTouchDown)
    window.addEventListener('pointermove', onTouchMove)
    window.addEventListener('pointerup', onTouchUp)
    window.addEventListener('pointercancel', onTouchUp)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('contextmenu', noMenu)
      dom.removeEventListener('pointerdown', onTouchDown)
      window.removeEventListener('pointermove', onTouchMove)
      window.removeEventListener('pointerup', onTouchUp)
      window.removeEventListener('pointercancel', onTouchUp)
    }
  }, [dom])

  useFrame((_, dtRaw) => {
    const g = useGame.getState()
    const dt = Math.min(dtRaw, 0.05)
    const c = st.current

    if (g.phase === 'title') {
      // 角色創建：固定近景，人物在畫面左側，右側留給選單
      camera.position.set(SPAWN.x + 0.95, 1.0, SPAWN.z + 3.5)
      camera.lookAt(SPAWN.x + 0.95, 0.76, SPAWN.z)
      return
    }
    // 對話中鏡頭照樣更新（交談模式要拉近），其他暫停狀態不動
    if (g.paused && !g.dialog) return
    updateCutscene(dt)

    // 縮放超出目前模式的範圍：切到另一個模式（雙指拉遠 → 探索；拉近 → 沉浸）
    const mode = CAM_MODES[g.camMode]
    if (g.camMode === 'immersive' && c.distT > mode.maxDist + 0.5) g.setCamMode('explore')
    else if (g.camMode === 'explore' && c.distT < mode.minDist - 0.5) g.setCamMode('immersive')
    c.distT = THREE.MathUtils.clamp(c.distT, CAM_MODES[g.camMode].minDist - 0.6, CAM_MODES[g.camMode].maxDist + 0.6)
    const M = CAM_MODES[g.camMode]

    const turn = rotateAxis()
    c.yawT += turn * 1.9 * dt
    if (turn !== 0) auto.current.manual = true
    // 走路時鏡頭轉到前進方向的背後；自己轉動視角（右鍵拖曳、觸控拖曳、Q／E）就暫停，停下來再出發才恢復
    const a = auto.current
    const moving = runtime.player.speed > 0.8
    if (moving) a.still = 0
    else if ((a.still += dt) > 0.35) a.manual = false
    if (g.camFollow && moving && !a.manual && !g.dialog && cutscene.state !== 'active' && blend.current.talk < 0.05) {
      const err = wrap(runtime.player.facing + Math.PI - c.yawT)
      const ang = Math.abs(err)
      // 往鏡頭方向倒退走（接近 180°）不轉，避免畫面翻面；其餘依角度差轉動，速度有上限
      const w = ang < deg(100) ? 1 : Math.max(0, 1 - (ang - deg(100)) / deg(50))
      const rate = THREE.MathUtils.clamp(err * 2.2, -1.1, 1.1) * w
      c.yawT = wrap(c.yawT + rate * dt)
    }
    c.yaw += wrap(c.yawT - c.yaw) * (1 - Math.exp(-dt * 10))
    c.dist += (c.distT - c.dist) * (1 - Math.exp(-dt * 7))
    const follow = 1 - Math.exp(-dt * 12)
    c.tx += (runtime.player.x - c.tx) * follow
    c.tz += (runtime.player.z - c.tz) * follow

    // 模式內：距離越遠俯角越大
    const t = THREE.MathUtils.clamp((c.dist - M.minDist) / (M.maxDist - M.minDist), 0, 1)
    const basePitch = THREE.MathUtils.lerp(M.minPitch, M.maxPitch, Math.pow(t, 0.7))
    // 拖曳加上的俯仰偏移：限制在模式範圍附近
    c.tiltT = THREE.MathUtils.clamp(c.tiltT, M.minPitch - 0.1 - basePitch, M.maxPitch + 0.1 - basePitch)
    c.tilt += (c.tiltT - c.tilt) * (1 - Math.exp(-dt * 10))
    let pitch = THREE.MathUtils.clamp(basePitch + c.tilt, CAM.minPitch, CAM.maxPitch)
    let dist = c.dist
    let yaw = c.yaw
    let tx = c.tx
    let tz = c.tz
    let ty = THREE.MathUtils.lerp(0.98, 0.6, t)

    const b = blend.current
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    // 交談模式：對話開著、身邊有說話的人 → 拉近到兩人中間，從側面看
    const talker = g.dialog ? nearestPerson() : null
    if (talker && b.talk < 0.01) {
      // 從離目前鏡頭較近的一側看兩人
      const ang = Math.atan2(talker.x - runtime.player.x, talker.z - runtime.player.z)
      const s1 = wrap(ang + Math.PI / 2)
      const s2 = wrap(ang - Math.PI / 2)
      b.talkYaw = Math.abs(wrap(s1 - c.yaw)) < Math.abs(wrap(s2 - c.yaw)) ? s1 : s2
    }
    if (talker) {
      b.talkX = (runtime.player.x + talker.x) / 2
      b.talkZ = (runtime.player.z + talker.z) / 2
    }
    b.talk += ((talker ? 1 : 0) - b.talk) * k(4)
    // 接近城門（主線世界）：離入口 18 m 內慢慢壓低、轉向城門
    let gateW = 0
    if (!inTown() && TOWN_PORTAL.enabled) {
      const tr = TOWN_PORTAL.trigger
      const d = Math.hypot(runtime.player.x - tr.x, runtime.player.z - tr.z)
      gateW = THREE.MathUtils.smoothstep(18 - d, 0, 12) * (g.camMode === 'explore' ? 0.85 : 1)
    }
    b.gate += (gateW - b.gate) * k(3)
    // 過場播放中先不讓「進城近景」衰減，播完從那個近景自然拉開
    if (cutscene.state !== 'active') b.arrive *= Math.exp(-dt * 0.9)

    if (b.gate > 0.001) {
      // 鏡頭在主角北邊、看向南方的城門（yaw = π）
      yaw = lerpAngle(yaw, Math.PI, b.gate * 0.7)
      pitch = THREE.MathUtils.lerp(pitch, deg(22), b.gate)
      dist = THREE.MathUtils.lerp(dist, 10.5, b.gate)
      ty = THREE.MathUtils.lerp(ty, 1.6, b.gate)
    }
    if (b.arrive > 0.001) pitch = THREE.MathUtils.lerp(pitch, deg(18), b.arrive)
    if (b.talk > 0.001) {
      yaw = lerpAngle(yaw, b.talkYaw, b.talk)
      pitch = THREE.MathUtils.lerp(pitch, TALK.pitch, b.talk)
      dist = THREE.MathUtils.lerp(dist, TALK.dist, b.talk)
      tx = THREE.MathUtils.lerp(tx, b.talkX, b.talk)
      tz = THREE.MathUtils.lerp(tz, b.talkZ, b.talk)
      ty = THREE.MathUtils.lerp(ty, 1.0, b.talk)
    }
    const dx = Math.sin(yaw) * Math.cos(pitch)
    const dy = Math.sin(pitch)
    const dz = Math.cos(yaw) * Math.cos(pitch)

    // 防穿模：被城牆、塔、山壁擋住時立即拉近，離開後平滑恢復（建築改成淡出，不拉近）
    const clear = cameraClearDistance(tx, ty, tz, dx, dy, dz, dist)
    c.eff = clear < c.eff ? clear : c.eff + (clear - c.eff) * (1 - Math.exp(-dt * 5))

    camera.position.set(tx + dx * c.eff, Math.max(CAM.minHeight, ty + dy * c.eff), tz + dz * c.eff)
    camera.lookAt(tx, ty, tz)
    // 過場：把一般鏡頭的位置與注視點，依權重換成運鏡路徑上的位置（最後一段權重降到 0，平滑接回）
    if (cutscene.state === 'active') {
      const w = sampleCutscene(cinePos, cineLook)
      camera.position.lerp(cinePos, w)
      cineBase.set(tx, ty, tz).lerp(cineLook, w)
      camera.lookAt(cineBase)
    }
    // 鏡頭震動：強度隨時間快速衰減，距離越遠晃動越大以維持畫面上的幅度
    if (runtime.shake > 0.002) {
      const amp = runtime.shake * (0.25 + c.eff * 0.035)
      camera.position.x += (Math.random() - 0.5) * amp
      camera.position.y += (Math.random() - 0.5) * amp
      camera.position.z += (Math.random() - 0.5) * amp
      runtime.shake *= Math.exp(-dt * 9)
    } else runtime.shake = 0

    runtime.cam.yaw = c.yaw
    runtime.cam.dist = c.dist
    g.setZoom(c.distT > 17 ? 'far' : c.distT < 6 ? 'near' : 'mid')
  })

  return null
}
