// 技能特效測試頁：切換職業、施放示範技能、即時調整參數、看時間軸與效能數字。
import { useEffect, useMemo, useRef, useState } from 'react'
import { HERO_CLASSES as CLASS_ORDER, CLASSES, type ClassId } from '../data/classes'
import { DEMO_SKILLS } from '../skills/demoSkills'
import { unlockAudio } from '../systems/sfx'
import { timelineLength, type TimelineEvent, type TimelineKind } from '../vfx/timeline'
import type { FxParams } from '../vfx/types'
import type { VfxQuality } from '../vfx/quality'
import { VfxWorld } from '../vfx/VfxWorld'
import { LabScene, labStats, type LabTheme } from './LabScene'
import { cast, clearLab, lab, labProjectiles, labTimelines, resetParams, selectClass, stress } from './labSim'

const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches

const TRACKS: { kind: TimelineKind; label: string }[] = [
  { kind: 'anim', label: '動作' },
  { kind: 'vfx', label: '特效' },
  { kind: 'hit', label: '命中' },
  { kind: 'launch', label: '發射' },
  { kind: 'sfx', label: '音效' },
]

const CUE_LABEL: Record<string, string> = {
  slash: '刀光',
  hitSpark: '命中火花',
  charge: '集氣',
  muzzle: '出手閃光',
  castCircle: '腳下魔法陣',
  areaCircle: '目標魔法陣',
  explosion: '爆炸',
  healPillar: '治療光柱',
  healBurst: '治療光點',
}
const ANIM_LABEL: Record<string, string> = { attack: '揮擊', cast: '施法' }
const SFX_LABEL: Record<string, string> = { slash: '揮砍', shoot: '弓弦', shootMagic: '法術', cast: '詠唱', explode: '爆炸', heal: '治療' }

function eventLabel(e: TimelineEvent) {
  if (e.kind === 'hit') return '命中'
  if (e.kind === 'launch') return '發射'
  const n = e.name ?? ''
  if (e.kind === 'anim') return ANIM_LABEL[n] ?? n
  if (e.kind === 'sfx') return SFX_LABEL[n] ?? n
  return CUE_LABEL[n] ?? n
}

/** 同一軌上時間很接近的事件合併成一個標籤，避免文字疊在一起 */
function groupEvents(events: readonly TimelineEvent[]) {
  const out: { t: number; label: string; times: string }[] = []
  for (const e of events) {
    const last = out[out.length - 1]
    if (last && e.t - last.t < 0.12) {
      last.label += '＋' + eventLabel(e)
      last.times += `、${e.t.toFixed(2)}`
    } else out.push({ t: e.t, label: eventLabel(e), times: e.t.toFixed(2) })
  }
  return out
}

function Slider({ label, value, min, max, step, unit = '', onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="lab-row">
      <span className="lab-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="lab-value">
        {value.toFixed(step < 0.1 ? 2 : 1)}
        {unit}
      </span>
    </label>
  )
}

function TimelineView({ ver }: { ver: number }) {
  const sk = DEMO_SKILLS[lab.skillId]
  const len = Math.max(0.5, timelineLength(sk.cast) + 0.15)
  const head = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (head.current) {
        const t = lab.sinceCast
        head.current.style.left = `${Math.min(100, (t / len) * 100)}%`
        head.current.style.opacity = t < len + 0.3 ? '1' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [len])
  return (
    <div className="lab-timeline" data-ver={ver}>
      <div className="lab-tl-scale">
        <span>0</span>
        <span>{len.toFixed(2)} 秒</span>
      </div>
      <div className="lab-tl-body">
        {TRACKS.map((tr) => (
          <div key={tr.kind} className="lab-tl-track">
            <span className="lab-tl-name">{tr.label}</span>
            <div className="lab-tl-lane">
              {groupEvents(sk.cast.filter((e) => e.kind === tr.kind)).map((g, i) => (
                <span key={i} className={`lab-tl-mark k-${tr.kind}`} style={{ left: `${(g.t / len) * 100}%` }} title={`${g.times} 秒`}>
                  {g.label}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="lab-tl-headwrap">
          <div ref={head} className="lab-tl-head" />
        </div>
      </div>
      <div className="lab-tl-impact">
        命中後（每個目標）：{sk.impact.map((e) => (e.kind === 'sfx' ? `音效「${eventLabel(e)}」` : eventLabel(e))).join('、')}
      </div>
    </div>
  )
}

function Stats() {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 300)
    return () => clearInterval(id)
  }, [])
  const s = lab.world?.stats()
  return (
    <div className="lab-stats">
      <div>
        <b>{labStats.fps}</b> FPS · 繪製 <b>{labStats.calls}</b> 次 · 三角形 <b>{(labStats.triangles / 1000).toFixed(0)}k</b>
      </div>
      <div>模擬＋特效更新 {labStats.frameMs.toFixed(2)} ms／幀</div>
      {s && (
        <>
          <div>
            粒子 {s.soft}/{s.softBudget}（一般）· {s.add}/{s.addBudget}（加亮）· 超出預算 {s.dropped}
          </div>
          <div>
            刀光 {s.slashes} · 拖尾 {s.trails} · 魔法陣 {s.circles} · 衝擊波 {s.rings} · 光柱 {s.pillars} · 火球 {s.orbs} · 模型 {s.models}
          </div>
          <div>
            時間軸 {labTimelines()} · 飛行中 {labProjectiles()} · 池滿回收 {s.stolen}
          </div>
        </>
      )}
      <div>
        施放 {lab.casts} 次 · 命中 {lab.hits} 次
      </div>
    </div>
  )
}

export function SkillLab() {
  const world = useMemo(() => new VfxWorld(isTouch ? 'low' : 'high'), [])
  const [classId, setClassId] = useState<ClassId>(() => {
    const q = new URLSearchParams(location.search).get('class') as ClassId | null
    return q && q in CLASSES ? q : 'knight'
  })
  const [quality, setQuality] = useState<VfxQuality>(isTouch ? 'low' : 'high')
  const [theme, setTheme] = useState<LabTheme>('day')
  const [ver, setVer] = useState(0)
  const [panelOpen, setPanelOpen] = useState(!isTouch)
  const [cd, setCd] = useState(0)
  const [msg, setMsg] = useState('')
  const bump = () => setVer((v) => v + 1)

  useEffect(() => {
    selectClass(classId)
    clearLab()
    bump()
  }, [classId])

  useEffect(() => {
    const id = setInterval(() => {
      setCd(lab.cooldown)
      setMsg(lab.messageTime > 0 ? lab.message : '')
    }, 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        unlockAudio()
        cast()
      } else if (e.key >= '1' && e.key <= '4') setClassId(CLASS_ORDER[Number(e.key) - 1])
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // 測試頁本身就是測試工具：一直掛著方便自動化測試
  useEffect(() => {
    Object.assign(window, { __lab: { lab, world, cast, stress, clearLab, selectClass, labStats, setClassId, setQuality, setTheme } })
  }, [world])

  const sk = DEMO_SKILLS[lab.skillId]
  const p = lab.params[lab.skillId]
  const set = <K extends keyof FxParams>(k: K, v: FxParams[K]) => {
    lab.params[lab.skillId][k] = v
    bump()
  }
  const setOffset = (i: number, v: number) => {
    const o = [...p.offset] as FxParams['offset']
    o[i] = v
    set('offset', o)
  }
  const far = lab.dummies.find((d) => d.id === 'far')!

  return (
    <div className={panelOpen ? 'lab panel-open' : 'lab'}>
      {/* 面板打開時畫面縮到面板左邊，主角和木樁不會被擋住 */}
      <div className="lab-canvas">
        <LabScene quality={quality} theme={theme} world={world} classId={classId} />
      </div>

      <div className="lab-top">
        <div className="lab-title">技能特效測試場</div>
        <div className="lab-classes">
          {CLASS_ORDER.map((c, i) => (
            <button key={c} className={c === classId ? 'on' : ''} onClick={() => setClassId(c)} title={`快捷鍵 ${i + 1}`}>
              {CLASSES[c].name}
            </button>
          ))}
        </div>
      </div>

      <button
        className="lab-cast"
        onClick={() => {
          unlockAudio()
          cast()
        }}
      >
        <span>{sk.name}</span>
        <small>{cd > 0 ? `冷卻 ${cd.toFixed(1)} 秒` : isTouch ? '點一下施放' : '空白鍵施放'}</small>
        <i style={{ transform: `scaleX(${p.cooldown > 0 ? cd / p.cooldown : 0})` }} />
      </button>
      {msg && <div className="lab-msg">{msg}</div>}

      <button className="lab-toggle" onClick={() => setPanelOpen((o) => !o)}>
        {panelOpen ? '收起面板' : '參數面板'}
      </button>

      {panelOpen && (
        <aside className="lab-panel">
          <section>
            <h3>{sk.name}</h3>
            <p className="lab-desc">{sk.desc}</p>
            <p className="lab-desc">遊戲裡：{sk.gameUse}</p>
          </section>

          <section>
            <h4>播放</h4>
            <div className="lab-buttons">
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={lab.auto}
                  onChange={(e) => {
                    lab.auto = e.target.checked
                    bump()
                  }}
                />
                自動連放
              </label>
              <label className="lab-check">
                <input
                  type="checkbox"
                  checked={lab.ignoreCooldown}
                  onChange={(e) => {
                    lab.ignoreCooldown = e.target.checked
                    bump()
                  }}
                />
                忽略冷卻
              </label>
              <button onClick={() => stress(20)}>壓力測試 ×20</button>
              <button onClick={() => clearLab()}>清除特效</button>
            </div>
          </section>

          <section>
            <h4>時間軸</h4>
            <TimelineView ver={ver} />
          </section>

          <section>
            <h4>
              特效參數
              <button
                className="lab-small"
                onClick={() => {
                  resetParams(lab.skillId)
                  bump()
                }}
              >
                重設
              </button>
            </h4>
            <div className="lab-colors">
              <label>
                主色 <input type="color" value={p.color} onChange={(e) => set('color', e.target.value)} />
              </label>
              <label>
                副色 <input type="color" value={p.color2} onChange={(e) => set('color2', e.target.value)} />
              </label>
            </div>
            <Slider label="大小" value={p.size} min={0.3} max={3} step={0.05} unit="×" onChange={(v) => set('size', v)} />
            <Slider label="持續時間" value={p.duration} min={0.05} max={3} step={0.05} unit=" 秒" onChange={(v) => set('duration', v)} />
            <Slider label="射程" value={p.range} min={0.5} max={14} step={0.1} unit=" m" onChange={(v) => set('range', v)} />
            <Slider label="作用半徑" value={p.radius} min={0.3} max={6} step={0.1} unit=" m" onChange={(v) => set('radius', v)} />
            <Slider label="冷卻" value={p.cooldown} min={0} max={10} step={0.1} unit=" 秒" onChange={(v) => set('cooldown', v)} />
            <Slider label="發射點 左右" value={p.offset[0]} min={-1} max={1} step={0.05} unit=" m" onChange={(v) => setOffset(0, v)} />
            <Slider label="發射點 高度" value={p.offset[1]} min={0} max={3} step={0.05} unit=" m" onChange={(v) => setOffset(1, v)} />
            <Slider label="發射點 前後" value={p.offset[2]} min={-1} max={2} step={0.05} unit=" m" onChange={(v) => setOffset(2, v)} />
            <Slider
              label="遠距木樁距離"
              value={far.z}
              min={3}
              max={13}
              step={0.5}
              unit=" m"
              onChange={(v) => {
                far.z = v
                const side = lab.dummies.find((d) => d.id === 'side')
                if (side) side.z = v + 0.6
                bump()
              }}
            />
            <p className="lab-note">參數只影響這個測試頁；遊戲平衡（射程、冷卻）仍以 classes.ts 為準。</p>
          </section>

          <section>
            <h4>顯示</h4>
            <div className="lab-buttons">
              <button className={quality === 'high' ? 'on' : ''} onClick={() => setQuality('high')}>
                高畫質
              </button>
              <button className={quality === 'low' ? 'on' : ''} onClick={() => setQuality('low')}>
                省電（手機）
              </button>
              <button className={theme === 'day' ? 'on' : ''} onClick={() => setTheme('day')}>
                白天草地
              </button>
              <button className={theme === 'night' ? 'on' : ''} onClick={() => setTheme('night')}>
                夜晚
              </button>
            </div>
          </section>

          <section>
            <h4>效能</h4>
            <Stats />
          </section>

          <p className="lab-note">
            拖曳轉視角、滾輪縮放。快捷鍵：1～4 切換職業、空白鍵施放。<a href="./">回到遊戲</a>
          </p>
        </aside>
      )}
    </div>
  )
}
