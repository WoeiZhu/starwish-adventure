// 第一次進星光鎮的過場畫面：上下黑邊、字卡、跳過按鈕（運鏡本身在 scene/CameraRig.tsx）。
//   時間軸都由 cutscene.t 驅動（跳過後時間會直接跳到最後一段，字卡與黑邊自然跟著收掉）。
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { TOWN_NAME } from '../data/town'
import { CUTSCENE_BLEND_OUT, CUTSCENE_DURATION, cutscene, getCutsceneState, skipCutscene, subscribeCutscene } from '../game/cutscene'

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}
/** 在 [a, b] 淡入、[c, d] 淡出的透明度 */
const window4 = (t: number, a: number, b: number, c: number, d: number) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)))

/** 過場播放中（含載入等待）回傳 true，App 用來隱藏 HUD */
export function useCutsceneActive() {
  return useSyncExternalStore(subscribeCutscene, getCutsceneState) === 'active'
}

export function TownIntro() {
  const state = useSyncExternalStore(subscribeCutscene, getCutsceneState)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const skip = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state !== 'active') return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = cutscene.t
      const end = CUTSCENE_DURATION
      // 黑邊：開頭 0.6 秒滑入、最後 1 秒滑出
      const bars = smooth(t / 0.6) * (1 - smooth((t - (end - 1)) / 1))
      const h = `${(bars * 11).toFixed(2)}%`
      if (top.current) top.current.style.height = h
      if (bottom.current) bottom.current.style.height = h
      const a1 = window4(t, 0.7, 1.6, 4.2, 5)
      if (title.current) {
        title.current.style.opacity = String(a1)
        title.current.style.transform = `translateY(${((1 - a1) * 10).toFixed(1)}px)`
      }
      const a2 = window4(t, 5.2, 6, 7.6, 8.2)
      if (line.current) {
        line.current.style.opacity = String(a2)
        line.current.style.transform = `translateY(${((1 - a2) * 8).toFixed(1)}px)`
      }
      // 跳過按鈕：1 秒後出現、進入最後一段就收起
      if (skip.current) skip.current.style.opacity = String(smooth((t - 1) / 0.5) * (t < end - CUTSCENE_BLEND_OUT ? 1 : 0))
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [state])

  if (state !== 'active') return null
  return (
    <div
      className="town-intro"
      onPointerDown={(e) => {
        e.stopPropagation()
        // 剛開始的半秒不理（避免載入畫面淡出時的最後一次點擊直接跳掉）
        if (cutscene.t > 0.5) skipCutscene()
      }}
    >
      <div className="ti-bar top" ref={top} />
      <div className="ti-bar bottom" ref={bottom} />
      <div className="ti-title" ref={title}>
        <span className="ti-en">STARLIGHT TOWN</span>
        <b>{TOWN_NAME}</b>
      </div>
      <div className="ti-line" ref={line}>
        冒險者的第一站　·　商店、公會、旅館都在這裡
      </div>
      <button className="ti-skip" ref={skip} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => skipCutscene()}>
        跳過 ▸
      </button>
    </div>
  )
}
