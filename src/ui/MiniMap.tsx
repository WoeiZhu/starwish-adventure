// HUD 右上的圓形小地圖：以主角為中心、鏡頭前方朝上；點一下開大地圖（M 鍵）。
// 每幀直接畫在 canvas（不觸發 React 重繪），畫面更新率依畫質限制（省電 20 fps、其他 30 fps）。
import { useEffect, useRef } from 'react'
import { useGame } from '../game/store'
import { drawMini } from './mapDraw'

export function MiniMap() {
  const box = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const openMenu = useGame((s) => s.openMenu)

  useEffect(() => {
    let id = 0
    let last = 0
    let size = 0
    const tick = (now: number) => {
      id = requestAnimationFrame(tick)
      const cv = canvas.current
      if (!cv || document.hidden) return
      const s = useGame.getState()
      const minGap = s.quality === 'saver' ? 50 : 33
      if (now - last < minGap) return
      last = now
      const css = cv.clientWidth
      if (css < 20) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const px = Math.round(css * dpr)
      if (px !== size) {
        size = px
        cv.width = px
        cv.height = px
      }
      const g = cv.getContext('2d')
      if (!g) return
      drawMini(g, px, now / 1000)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <button ref={box} className="minimap" onClick={() => openMenu('map')} aria-label="小地圖（點一下開啟大地圖）" title="大地圖（M）">
      <canvas ref={canvas} />
    </button>
  )
}
