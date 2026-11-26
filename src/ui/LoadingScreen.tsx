// 載入畫面：開局、讀檔、進出城鎮、回到野外時，主角周圍的區域（或城鎮）還在準備。
//   全部用程式畫（HTML / CSS / Canvas 2D），沒有影片或大圖：暮色漸層、閃爍的星星、偶爾劃過的流星、
//   小星星騎在進度條上跑，下面輪流顯示小提示。
//   - 載入期間顯示；載完後至少停留 0.9 秒（太快的話只會閃一下），再用 0.38 秒淡出。
//   - 進度條沒有真實的百分比可用：先快後慢逼近 92%，載完才衝到 100%。
//   - 「減少動態效果」（prefers-reduced-motion）時不畫流星、小星星不彈跳。
//   - 自動測試（navigator.webdriver）不停留也不淡出，免得擋住既有流程；loadUi.force = true 可還原成正式的時間。
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { TOWN_NAME } from '../data/town'
import { isMapLoading, subscribeMap } from '../world/maps'
import { isPriming, subscribe } from '../world/stream'

export const loadUi = {
  /** 測試用：true = 使用正式的停留與淡出時間 */
  force: false,
  /** 統計：顯示過幾次（測試用） */
  shown: 0,
}
const auto = () => typeof navigator !== 'undefined' && navigator.webdriver && !loadUi.force
const MIN_MS = 900
const FADE_MS = 380

const TIPS = [
  '點一下 NPC，隊伍會自己走過去跟他說話。',
  '怪物腳下出現紅色圈圈，是大招的範圍，趕快閃避或走出去。',
  '閃避翻滾的瞬間不會受傷，抓準時機最划算。',
  '右上角的箭頭會指向目前任務的目標，旁邊顯示距離。',
  '星光鎮是安全區，怪物不會追進來，慢慢逛、慢慢買。',
  '雙指開合（或滾輪）可以拉遠看地圖，V 鍵切換探索與沉浸視角。',
  '隊友會自己找敵人，你專心躲技能、放大招就好。',
  '裝備好的東西可以在背包比較前後差異，還有一鍵換最強。',
  '覺得畫面卡卡的，可以把畫質調成「中」或「低（省電）」。',
]

interface Star {
  x: number
  y: number
  r: number
  ph: number
  sp: number
}

/** 五角星路徑 */
function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? R : r
    const px = cx + Math.cos(a) * rad
    const py = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function SkyCanvas({ progress }: { progress: React.MutableRefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let stars: Star[] = []
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = cv.clientWidth
      h = cv.clientHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(110, (w * h) / 9000))
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.78,
        r: 0.6 + Math.random() * 1.6,
        ph: Math.random() * 6.28,
        sp: 0.8 + Math.random() * 2.2,
      }))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    let raf = 0
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null
    let nextShoot = 0.8
    let last = performance.now()
    const t0 = last
    const trail: { x: number; y: number; life: number }[] = []
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = (now - t0) / 1000

      // 暮色天空
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#2b2250')
      sky.addColorStop(0.55, '#6a4c93')
      sky.addColorStop(1, '#f6a5b8')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      // 星星
      for (const s of stars) {
        const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))
        ctx.globalAlpha = a
        ctx.fillStyle = '#fff6dd'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, 6.283)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 流星
      if (!calm) {
        nextShoot -= dt
        if (!shoot && nextShoot <= 0) {
          shoot = { x: w * (0.25 + Math.random() * 0.7), y: h * (0.05 + Math.random() * 0.2), vx: -w * 0.55, vy: h * 0.28, life: 1 }
          nextShoot = 1.8 + Math.random() * 2.4
        }
        if (shoot) {
          shoot.x += shoot.vx * dt
          shoot.y += shoot.vy * dt
          shoot.life -= dt * 1.1
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 0.22, shoot.y - shoot.vy * 0.22)
          g.addColorStop(0, 'rgba(255,255,255,0.95)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.strokeStyle = g
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(shoot.x, shoot.y)
          ctx.lineTo(shoot.x - shoot.vx * 0.22, shoot.y - shoot.vy * 0.22)
          ctx.stroke()
          if (shoot.life <= 0) shoot = null
        }
      }

      // 遠山（兩層柔和的剪影）
      for (const [k, col, base, amp, fr] of [
        [0, '#5a4380', 0.8, 0.07, 1.3],
        [1, '#3d2d63', 0.88, 0.05, 2.1],
      ] as const) {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 12) {
          const yy = h * base + Math.sin(x / w * Math.PI * fr * 2 + k * 1.7) * h * amp + Math.sin(x / w * 17 + k) * h * 0.008
          ctx.lineTo(x, yy)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()
      }

      // 進度條上的小星星：沿著跑道前進、輕輕彈跳，後面拖著閃光
      const barW = Math.min(w * 0.68, 420)
      const bx = (w - barW) / 2
      const by = h * 0.76
      const p = progress.current
      const sx = bx + barW * p
      const bounce = calm ? 0 : Math.abs(Math.sin(t * 6)) * 12
      const sy = by - 18 - bounce
      if (!calm) {
        trail.push({ x: sx - 4, y: sy + 4, life: 1 })
        if (trail.length > 28) trail.shift()
      }
      for (const q of trail) {
        q.life -= dt * 2.4
        if (q.life <= 0) continue
        ctx.globalAlpha = q.life * 0.8
        ctx.fillStyle = '#ffe9a8'
        starPath(ctx, q.x, q.y, 4 * q.life + 1, 1.6 * q.life + 0.5, t * 3)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.save()
      ctx.shadowColor = 'rgba(255,224,130,0.9)'
      ctx.shadowBlur = 16
      ctx.fillStyle = '#ffd95a'
      ctx.strokeStyle = '#fff3c4'
      ctx.lineWidth = 2
      starPath(ctx, sx, sy, 15, 7, calm ? 0 : Math.sin(t * 6) * 0.18)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      // 臉：兩顆眼睛和微笑
      ctx.fillStyle = '#4a3b52'
      ctx.beginPath()
      ctx.arc(sx - 4, sy - 1, 1.5, 0, 6.283)
      ctx.arc(sx + 4, sy - 1, 1.5, 0, 6.283)
      ctx.fill()
      ctx.strokeStyle = '#4a3b52'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(sx, sy + 1.5, 3, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [progress])
  return <canvas ref={ref} className="ls-canvas" aria-hidden />
}

export function LoadingScreen() {
  const priming = useSyncExternalStore(subscribe, isPriming)
  const town = useSyncExternalStore(subscribeMap, isMapLoading)
  const loading = priming || town
  const [phase, setPhaseState] = useState<'hidden' | 'in' | 'out'>('hidden')
  const [label, setLabel] = useState('載入地區中')
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))
  const progress = useRef(0)
  const bar = useRef<HTMLDivElement>(null)
  const shownAt = useRef(0)
  const timers = useRef<number[]>([])
  const loadingRef = useRef(false)
  const phaseRef = useRef<'hidden' | 'in' | 'out'>('hidden')
  loadingRef.current = loading
  const setPhase = (p: 'hidden' | 'in' | 'out') => {
    phaseRef.current = p
    setPhaseState(p)
  }

  // 開始載入：出現；載完：等最短停留時間，再淡出
  useEffect(() => {
    const clear = () => {
      for (const t of timers.current) clearTimeout(t)
      timers.current = []
    }
    clear()
    if (loading) {
      setLabel(town ? `前往${TOWN_NAME}` : '載入地區中')
      if (phaseRef.current === 'hidden') {
        progress.current = 0
        shownAt.current = performance.now()
        loadUi.shown++
        setTip(Math.floor(Math.random() * TIPS.length))
      }
      setPhase('in')
      return
    }
    if (phaseRef.current !== 'in') return
    const wait = auto() ? 0 : Math.max(0, MIN_MS - (performance.now() - shownAt.current))
    timers.current.push(
      window.setTimeout(() => {
        if (loadingRef.current) return
        if (auto()) return setPhase('hidden')
        setPhase('out')
        timers.current.push(window.setTimeout(() => !loadingRef.current && setPhase('hidden'), FADE_MS))
      }, wait),
    )
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, town])

  // 進度：先快後慢逼近 92%
  useEffect(() => {
    if (phase === 'hidden') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (loadingRef.current) progress.current += (0.92 - progress.current) * (1 - Math.exp(-dt * 1.1))
      else progress.current += (1 - progress.current) * (1 - Math.exp(-dt * 12))
      if (bar.current) bar.current.style.width = `${(progress.current * 100).toFixed(1)}%`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // 小提示輪播
  useEffect(() => {
    if (phase === 'hidden') return
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2800)
    return () => clearInterval(id)
  }, [phase])

  if (phase === 'hidden') return null
  return (
    <div className={`loading-screen${phase === 'out' ? ' out' : ''}`} role="status" aria-live="polite">
      <SkyCanvas progress={progress} />
      <div className="ls-logo">
        <span className="ls-en">STARWISH ADVENTURE</span>
        <b>星願冒險團</b>
      </div>
      <div className="ls-bar">
        <div className="ls-fill" ref={bar} />
      </div>
      <div className="ls-bottom">
        <div className="ls-label">
          {label}
          <span className="ls-dots" aria-hidden>
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </div>
        <p className="ls-tip" key={tip}>
          小提示：{TIPS[tip]}
        </p>
      </div>
    </div>
  )
}
