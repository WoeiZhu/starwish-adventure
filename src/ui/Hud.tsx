// 遊戲中 HUD（精簡版，以手機橫向為基準）：
// 左上只留主角頭像與細血條、隊友小血條；右上收成一個選單按鈕；任務預設只顯示標題。
// 戰鬥數值存在 combat 單例，靠 store 的 tick（每 0.1 秒）觸發重繪。
import { useEffect, useRef, useState } from 'react'
import { CLASSES, MAX_LEVEL } from '../data/classes'
import { LAYOUT, TOWN_NAME } from '../data/town'
import { REGION_NAME } from '../data/world'
import { skillCooldown } from '../game/combat/actions'
import { usePotion } from '../game/combat/rewards'
import { combat, dist, unitById } from '../game/combat/state'
import { cycleTarget, heroCast } from '../game/combat/sim'
import { expToNext, pointsLeft, progress } from '../game/progress'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { interactNearest, questInfo, questTarget } from '../game/story'
import { canFullscreen, enterAppMode, isFullscreen, isStandalone, isTouch } from '../systems/mobile'
import { musicEnabled, setMusicEnabled } from '../systems/music'
import { Joystick } from './TouchControls'

/** 手機上離開全螢幕（例如滑了返回手勢）後，顯示「全螢幕」按鈕讓玩家切回來 */
function useFullscreen() {
  const [fs, setFs] = useState(isFullscreen)
  useEffect(() => {
    const on = () => setFs(isFullscreen())
    document.addEventListener('fullscreenchange', on)
    document.addEventListener('webkitfullscreenchange', on)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      document.removeEventListener('webkitfullscreenchange', on)
    }
  }, [])
  return fs
}

const BUFF_TEXT = { atkSpeed: '攻速↑', atk: '攻擊↑', def: '防禦↑', maxHp: '生命↑', guard: '壁壘' } as const
const FEED_SECONDS = 7
const QUEST_OPEN_MS = 9000

const pct = (value: number, max: number) => `${Math.max(0, Math.min(1, value / max)) * 100}%`

/** 任務指引：箭頭指向目前任務的目標（相對於鏡頭方向），旁邊顯示距離；快到了就收起來。每幀直接改 DOM，不觸發 React 重繪 */
function QuestArrow() {
  const root = useRef<HTMLDivElement>(null)
  const arrow = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let id = 0
    const tick = () => {
      id = requestAnimationFrame(tick)
      const el = root.current
      if (!el) return
      const t = useGame.getState().phase === 'playing' ? questTarget() : null
      const p = runtime.player
      const d = t ? Math.hypot(t.x - p.x, t.z - p.z) : 0
      const show = !!t && d > 7
      if (el.hidden === show) el.hidden = !show
      if (!show || !t) return
      const yaw = runtime.cam.yaw
      const dx = t.x - p.x
      const dz = t.z - p.z
      // 鏡頭前方 (-sin yaw, -cos yaw)，右方 (cos yaw, -sin yaw)；0 度朝上、順時針為正
      const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz
      const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz
      arrow.current!.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`
      const m = Math.round(d)
      if (label.current!.textContent !== m + ' m') label.current!.textContent = m + ' m'
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="quest-arrow" ref={root} hidden aria-label="任務方向">
      <span className="qa-ring">
        <span className="qa-needle" ref={arrow}>
          ▲
        </span>
      </span>
      <span className="qa-dist" ref={label} />
    </div>
  )
}

export function Hud() {
  useGame((s) => s.tick)
  const heroProfile = useGame((s) => s.hero)
  const hint = useGame((s) => s.hint)
  const paused = useGame((s) => s.paused)
  const region = useGame((s) => s.region)
  const mapId = useGame((s) => s.mapId)
  const togglePause = useGame((s) => s.togglePause)
  const resetCamera = useGame((s) => s.resetCamera)
  const toggleHelp = useGame((s) => s.toggleHelp)
  const openMenu = useGame((s) => s.openMenu)
  const showToast = useGame((s) => s.showToast)
  const quality = useGame((s) => s.quality)
  const setQuality = useGame((s) => s.setQuality)
  const camMode = useGame((s) => s.camMode)
  const setCamMode = useGame((s) => s.setCamMode)
  const [music, setMusic] = useState(musicEnabled)
  // 城鎮是安全區：隱藏戰鬥按鈕（技能、閃避、藥水、換目標），保留移動、互動與選單
  const safe = mapId !== 'overworld'
  const [menuOpen, setMenuOpen] = useState(false)
  const [questOpen, setQuestOpen] = useState(true)
  const fullscreen = useFullscreen()
  const showFsButton = isTouch && !isStandalone && !fullscreen && canFullscreen()

  const cls = CLASSES[heroProfile.classId]
  const party = combat.units.filter((u) => u.team === 'party')
  const h = party[0]
  const allies = party.slice(1)
  const target = unitById(h.targetId)
  // 區域首領平常守在自己的地盤：交戰中或在附近才顯示血條
  const boss = combat.units.find((u) => u.tier === 'boss' && u.alive && (u.targetId !== null || dist(u, h) < 24))
  const me = progress.members[heroProfile.classId]
  const need = expToNext(me.level)
  const points = party.reduce((n, u) => n + pointsLeft(u.classId!), 0)
  const feed = combat.feed.filter((f) => combat.time - f.time < FEED_SECONDS).slice(-3)
  const potionReady = progress.potions > 0 && combat.potionCd <= 0
  const quest = questInfo()
  const questKey = quest.title + quest.lines.join()

  // 任務有更新時自動展開幾秒，之後收回只剩標題
  useEffect(() => {
    setQuestOpen(true)
    const id = setTimeout(() => setQuestOpen(false), QUEST_OPEN_MS)
    return () => clearTimeout(id)
  }, [questKey])

  // 換區域（或進出城鎮）時用提示訊息顯示地名
  const place = mapId === 'overworld' ? REGION_NAME[region] : TOWN_NAME
  useEffect(() => {
    // 新版城鎮進城時有大的城鎮名稱橫幅，不再重複顯示提示
    if (LAYOUT && mapId !== 'overworld') return
    showToast(`— ${place} —`)
  }, [place, showToast, mapId])

  const pick = (fn: () => void) => () => {
    setMenuOpen(false)
    fn()
  }

  return (
    <div className="hud">
      {/* 左上：主角頭像 + 細血條，下方一排隊友小血條 */}
      <div className="hud-tl">
        <div className="me" title={`${h.name}　${cls.name} LV.${h.level}`}>
          <div className="me-avatar" style={{ background: cls.colors.primary, borderColor: cls.colors.accent }}>
            {cls.name[0]}
            <i>{h.level}</i>
          </div>
          <div className="me-bars">
            <div className="slim hp">
              <div style={{ width: pct(h.hp, h.maxHp) }} />
              <span>
                {Math.ceil(h.hp)}/{h.maxHp}
              </span>
            </div>
            <div className="slim mp">
              <div style={{ width: pct(h.mp, h.maxMp) }} />
            </div>
            <div className="slim exp">
              <div style={{ width: me.level >= MAX_LEVEL ? '100%' : pct(me.exp, need) }} />
            </div>
          </div>
        </div>
        {allies.length > 0 && (
          <div className="mates">
            {allies.map((u) => {
              const c = CLASSES[u.classId!]
              return (
                <div key={u.id} className={'mate' + (u.alive ? '' : ' down')} title={`${u.name}　${c.name} LV.${u.level}`}>
                  <span className="class-dot" style={{ background: c.colors.primary, borderColor: c.colors.accent }} />
                  <div className="slim hp">
                    <div style={{ width: pct(u.hp, u.maxHp) }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {h.buffs.length > 0 && (
          <div className="buffs">
            {h.buffs.map((b) => (
              <span key={b.stat}>
                {BUFF_TEXT[b.stat]} {Math.ceil(b.time)}
              </span>
            ))}
          </div>
        )}
      </div>

      {boss && (
        <div className="hud-boss">
          <div className="foe-name">
            {boss.name}
            <span>{boss.enraged ? '狂暴 · ' : ''}LV.{boss.level}</span>
          </div>
          <div className="slim enemy big">
            <div style={{ width: pct(boss.hp, boss.maxHp) }} />
            <span>
              {Math.ceil(boss.hp)}/{boss.maxHp}
            </span>
          </div>
        </div>
      )}

      {target && target.alive && target !== boss && (
        <div className={'hud-tc' + (boss ? ' under-boss' : '')}>
          <div className="foe-name">
            {target.name}
            <span>LV.{target.level}</span>
          </div>
          <div className="slim enemy">
            <div style={{ width: pct(target.hp, target.maxHp) }} />
          </div>
        </div>
      )}

      {/* 右上：單一選單按鈕，按下才展開全部功能；下方是可收合的任務 */}
      <div className="hud-tr">
        <div className="tr-row">
          {showFsButton && (
            <button className="menu-btn" onClick={() => void enterAppMode()} aria-label="全螢幕">
              ⛶
            </button>
          )}
          <button
            className="menu-btn cam-btn"
            onClick={() => setCamMode(camMode === 'explore' ? 'immersive' : 'explore')}
            aria-label={camMode === 'explore' ? '鏡頭：探索（切換到沉浸）' : '鏡頭：沉浸（切換到探索）'}
            title="切換鏡頭（V）"
          >
            {camMode === 'explore' ? '探' : '沉'}
          </button>
          <button className={'menu-btn' + (menuOpen ? ' on' : '')} onClick={() => setMenuOpen((v) => !v)} aria-label="選單">
            ☰{points > 0 && <i className="badge">{points}</i>}
          </button>
        </div>
        {menuOpen && (
          <div className="menu-pop">
            <button onClick={pick(() => openMenu('bag'))}>
              背包 <kbd>I</kbd>
            </button>
            <button onClick={pick(() => openMenu('tree'))}>
              技能樹 <kbd>K</kbd>
              {points > 0 && <i className="badge">{points}</i>}
            </button>
            <button onClick={pick(() => openMenu('party'))}>
              隊伍 <kbd>P</kbd>
            </button>
            <button onClick={pick(resetCamera)}>
              鏡頭回正 <kbd>R</kbd>
            </button>
            <button onClick={pick(toggleHelp)}>
              操作說明 <kbd>H</kbd>
            </button>
            <button onClick={() => setQuality(quality === 'high' ? 'mid' : quality === 'mid' ? 'saver' : 'high')}>
              畫質 <span className="menu-val">{quality === 'high' ? '高' : quality === 'mid' ? '中' : '低（省電）'}</span>
            </button>
            <button
              onClick={() => {
                setMusicEnabled(!music)
                setMusic(!music)
              }}
            >
              音樂 <span className="menu-val">{music ? '開' : '關'}</span>
            </button>
            <button onClick={pick(togglePause)}>
              {paused ? '繼續' : '暫停'} <kbd>Esc</kbd>
            </button>
            <div className="menu-info">
              {place}　金幣 {progress.gold}
            </div>
          </div>
        )}
        {!menuOpen && (
          <button className={'quest-chip' + (questOpen ? ' open' : '')} onClick={() => setQuestOpen((v) => !v)}>
            <b>◆ {quest.title}</b>
            {questOpen && quest.lines.map((l) => <span key={l}>{l}</span>)}
          </button>
        )}
        {!menuOpen && <QuestArrow />}
      </div>

      <div className="hud-bl">
        <div className="feed">
          {feed.map((f, i) => (
            <div key={f.time + '-' + i} style={{ color: f.color }}>
              {f.text}
            </div>
          ))}
        </div>
      </div>

      {isTouch && <Joystick />}

      <div className="hud-bc">
        {hint &&
          (isTouch ? (
            <button className="hint hint-btn" onClick={() => interactNearest()}>
              {hint}
            </button>
          ) : (
            <div className="hint">{hint}</div>
          ))}
        <div className={'skillbar' + (safe ? ' safe' : '')}>
          {!safe && cls.skills.map((sk, i) => {
            const cd = h.cooldowns[i]
            const total = skillCooldown(h, i)
            const ready = cd <= 0 && h.mp >= sk.mp && h.alive
            return (
              <button
                key={sk.id}
                className={'skill' + (sk.ultimate ? ' ult' : '') + (ready ? ' ready' : '')}
                onClick={() => heroCast(i)}
                title={`${sk.name}（MP ${sk.mp}，冷卻 ${total} 秒）`}
              >
                {cd > 0 && <div className="skill-cd" style={{ height: `${Math.min(1, cd / total) * 100}%` }} />}
                <kbd>{i + 1}</kbd>
                <span>{cd > 0 ? Math.ceil(cd) : sk.name}</span>
              </button>
            )
          })}
          {!safe && (
          <button
            className={'skill dodge' + (runtime.dodge.cd <= 0 ? ' ready' : '')}
            title="閃避（短暫無敵）"
            onClick={() => (runtime.dodge.request = true)}
          >
            <kbd>␣</kbd>
            <span>閃避</span>
          </button>
          )}
          {!safe && (
          <button
            className={'skill potion' + (potionReady ? ' ready' : '')}
            title="喝藥水：回復 45% 生命，冷卻 8 秒"
            onClick={() => {
              const why = usePotion()
              if (why) showToast(why)
            }}
          >
            {combat.potionCd > 0 && <div className="skill-cd" style={{ height: `${(combat.potionCd / 8) * 100}%` }} />}
            <kbd>Z</kbd>
            <span>藥水{progress.potions}</span>
          </button>
          )}
          {isTouch && !safe && (
            <button className="skill target ready" title="切換鎖定目標" onClick={() => cycleTarget()}>
              <span>換目標</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
