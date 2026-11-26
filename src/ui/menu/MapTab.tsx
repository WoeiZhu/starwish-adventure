// 大地圖分頁：整張主線地圖（正北朝上），標示你、隊友、任務目標、怪物營地、首領、寶箱與調查點。
// 選單開著時遊戲是暫停的，所以只需要偶爾重畫（任務星星的呼吸動畫）。
import { useEffect, useRef, useState } from 'react'
import { REGION_NAME } from '../../data/world'
import { runtime } from '../../game/runtime'
import { questInfo, questTarget } from '../../game/story'
import { drawFull, hereRegion, MAP } from '../mapDraw'

const LEGEND: [string, string, string][] = [
  ['▲', '#fff', '你（箭頭朝向）'],
  ['●', '#6cc0ff', '隊友'],
  ['★', '#ffd84a', '任務目標'],
  ['●', '#ff5d6c', '怪物營地（Lv 為等級）'],
  ['王', '#a85bf0', '區域首領'],
  ['商', '#35b3a6', '商人、村長與調查點'],
]

export function MapTab() {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let id = 0
    let last = 0
    const tick = (now: number) => {
      id = requestAnimationFrame(tick)
      if (now - last < 66) return
      last = now
      const cv = canvas.current
      const w = wrap.current
      if (!cv || !w) return
      const cw = w.clientWidth
      const ch = w.clientHeight
      if (cw < 20 || ch < 20) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      // 畫布依地圖長寬比縮放，剛好貼齊容器
      const s = Math.min(cw / MAP.w, ch / MAP.h)
      const pw = Math.round(MAP.w * s * dpr)
      const ph = Math.round(MAP.h * s * dpr)
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw
        cv.height = ph
        cv.style.width = Math.round(MAP.w * s) + 'px'
        cv.style.height = Math.round(MAP.h * s) + 'px'
      }
      const g = cv.getContext('2d')
      if (!g) return
      g.setTransform(1, 0, 0, 1, 0, 0)
      drawFull(g, pw, ph, now / 1000)
    }
    id = requestAnimationFrame(tick)
    const onResize = () => setTick((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const quest = questInfo()
  const t = questTarget()
  const dist = t ? Math.round(Math.hypot(t.x - runtime.player.x, t.z - runtime.player.z)) : null

  return (
    <div className="map-tab">
      <div className="map-wrap" ref={wrap}>
        <canvas ref={canvas} aria-label="大地圖" />
      </div>
      <aside className="map-side">
        <div className="map-here">
          <small>目前位置</small>
          <b>{REGION_NAME[hereRegion()]}</b>
        </div>
        <div className="map-quest">
          <small>任務</small>
          <b>◆ {quest.title}</b>
          {quest.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
          {dist !== null && <em>目標距離約 {dist} 公尺</em>}
        </div>
        <ul className="map-legend">
          {LEGEND.map(([glyph, color, text]) => (
            <li key={text}>
              <i style={{ color }}>{glyph}</i>
              {text}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
