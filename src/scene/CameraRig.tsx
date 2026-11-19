// 跟隨式相機：滾輪平滑縮放（遠景俯視 ↔ 近景看臉）、右鍵 / Q E 旋轉、回正、防穿模。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { SPAWN } from '../data/world'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { cameraClearDistance } from '../systems/collision'
import { rotateAxis } from '../systems/input'

export const CAM = {
  minDist: 2.9,
  maxDist: 30,
  defaultDist: 12,
  /** 近景 / 遠景的俯角（弧度） */
  nearPitch: 0.14,
  farPitch: 1.08,
  minHeight: 0.3,
  /** 右鍵拖曳可調的俯仰角範圍 */
  minPitch: 0.04,
  maxPitch: 1.45,
  maxTilt: 1.5,
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

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

  // 相機回正：轉回預設方向、俯角與中景距離
  useEffect(() => {
    if (resetTick === 0) return
    st.current.yaw = wrap(st.current.yaw)
    st.current.yawT = 0
    st.current.tiltT = 0
    st.current.distT = CAM.defaultDist
  }, [resetTick])

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
      c.tiltT = THREE.MathUtils.clamp(c.tiltT + (e.clientY - lastY) * 0.005, -CAM.maxTilt, CAM.maxTilt)
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) dragging = false
    }
    const noMenu = (e: Event) => e.preventDefault()
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('contextmenu', noMenu)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('contextmenu', noMenu)
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
    if (g.paused) return

    c.yawT += rotateAxis() * 1.9 * dt
    c.yaw += (c.yawT - c.yaw) * (1 - Math.exp(-dt * 10))
    c.dist += (c.distT - c.dist) * (1 - Math.exp(-dt * 7))
    const follow = 1 - Math.exp(-dt * 12)
    c.tx += (runtime.player.x - c.tx) * follow
    c.tz += (runtime.player.z - c.tz) * follow

    // 距離越遠俯角越大：遠景俯視地圖，近景平視臉部
    const t = (c.dist - CAM.minDist) / (CAM.maxDist - CAM.minDist)
    const basePitch = THREE.MathUtils.lerp(CAM.nearPitch, CAM.farPitch, Math.pow(t, 0.55))
    // 偏移量限制在可用範圍內，避免拖到極限後要反向拖很久才有反應
    c.tiltT = THREE.MathUtils.clamp(c.tiltT, CAM.minPitch - basePitch, CAM.maxPitch - basePitch)
    c.tilt += (c.tiltT - c.tilt) * (1 - Math.exp(-dt * 10))
    const pitch = THREE.MathUtils.clamp(basePitch + c.tilt, CAM.minPitch, CAM.maxPitch)
    const ty = THREE.MathUtils.lerp(0.98, 0.5, Math.pow(t, 0.5))
    const dx = Math.sin(c.yaw) * Math.cos(pitch)
    const dy = Math.sin(pitch)
    const dz = Math.cos(c.yaw) * Math.cos(pitch)

    // 防穿模：被房屋擋住時立即拉近，離開後平滑恢復
    const clear = cameraClearDistance(c.tx, ty, c.tz, dx, dy, dz, c.dist)
    c.eff = clear < c.eff ? clear : c.eff + (clear - c.eff) * (1 - Math.exp(-dt * 5))

    camera.position.set(c.tx + dx * c.eff, Math.max(CAM.minHeight, ty + dy * c.eff), c.tz + dz * c.eff)
    camera.lookAt(c.tx, ty, c.tz)
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
