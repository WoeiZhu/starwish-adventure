// 疊加介面：對話框、暫停選單、操作說明、提示訊息。
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getCutsceneState, subscribeCutscene } from '../game/cutscene'
import { useGame } from '../game/store'
import { isTouch } from '../systems/mobile'
import { TOWN_NAME } from '../data/town'
import { isMapLoading, subscribeMap } from '../world/maps'

const CONTROLS: [string, string][] = [
  ['W / A / S / D', '自由移動（會取消點擊自動移動）'],
  ['Shift', '按住跑步'],
  ['滑鼠左鍵點地面', '沿路徑自動移動、自動避開障礙'],
  ['滑鼠左鍵點怪物', '鎖定目標並自動接近；站定後普通攻擊自動進行（移動中不出手）'],
  ['1 / 2 / 3', '技能（3 為職業強化）'],
  ['4', '必殺技'],
  ['Space', '閃避翻滾（短暫無敵）'],
  ['Tab', '切換鎖定目標'],
  ['Z', '喝藥水（回復 45% 生命）'],
  ['I / K / P', '背包 / 技能樹 / 隊伍'],
  ['M', '大地圖（右上的圓形小地圖點一下也可以）'],
  ['滾輪', '鏡頭遠近：遠景看地圖、近景看人物'],
  ['滑鼠右鍵拖曳', '左右旋轉鏡頭、上下調整俯仰角'],
  ['Q / E', '旋轉鏡頭'],
  ['R', '鏡頭回正（方向、俯角、距離）'],
  ['F', '交談、開寶箱、調查；對話中的選項按 1 / 2 / 3'],
  ['Esc', '暫停 / 繼續'],
  ['H', '開關操作說明'],
]

const TOUCH_CONTROLS: [string, string][] = [
  ['左下搖桿', '按住拖曳移動，推到底就跑步'],
  ['點地面', '沿路徑自動走過去'],
  ['點怪物', '鎖定目標並自動接近；站定後普通攻擊自動進行（移動中不出手）'],
  ['技能按鈕', '左起 1、2 技能，3 職業強化，4 必殺技'],
  ['閃避', '翻滾（短暫無敵）'],
  ['藥水', '回復 45% 生命'],
  ['換目標', '切換鎖定的怪物'],
  ['互動按鈕', '靠近人物、寶箱、祭壇時出現在技能上方'],
  ['單指拖曳畫面', '旋轉鏡頭、調整俯仰角'],
  ['雙指開合', '鏡頭拉近拉遠'],
  ['右上小地圖', '點一下開大地圖，看任務目標、怪物營地與寶箱'],
  ['右上 ☰', '背包、技能樹、隊伍、地圖、畫質、小地圖、暫停'],
  ['右上 ⛶', '離開全螢幕後按這裡切回來'],
]

function ControlList() {
  return (
    <dl className="controls">
      {(isTouch ? TOUCH_CONTROLS : CONTROLS).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HelpPanel() {
  const toggleHelp = useGame((s) => s.toggleHelp)
  return (
    <div className="panel help">
      <div className="panel-title">操作說明</div>
      <ControlList />
      <button className="btn" onClick={toggleHelp}>
        關閉
      </button>
    </div>
  )
}

export function PauseOverlay() {
  const togglePause = useGame((s) => s.togglePause)
  const backToTitle = useGame((s) => s.backToTitle)
  return (
    <div className="overlay">
      <div className="panel pause">
        <h2>遊戲暫停</h2>
        <ControlList />
        <div className="pause-actions">
          <button className="btn-primary" onClick={togglePause}>
            繼續冒險
          </button>
          <button className="btn" onClick={backToTitle}>
            回到角色創建
          </button>
        </div>
      </div>
    </div>
  )
}

export function DialogBox() {
  const dialog = useGame((s) => s.dialog)
  const advance = useGame((s) => s.advanceDialog)
  const choose = useGame((s) => s.choose)
  if (!dialog) return null
  const last = dialog.index + 1 >= dialog.lines.length
  const choices = last ? dialog.choices : undefined
  return (
    <div className={'panel dialog' + (choices ? ' has-choices' : '')} onClick={choices ? undefined : advance}>
      <div className="dialog-speaker">{dialog.speaker}</div>
      <p>{dialog.lines[dialog.index]}</p>
      {choices ? (
        <div className="choices">
          {choices.map((c, i) => (
            <button key={c.label} className="choice" disabled={!!c.disabled} onClick={() => choose(i)}>
              <kbd>{i + 1}</kbd>
              <span className="choice-label">{c.label}</span>
              <span className="choice-desc">{c.disabled ?? c.desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="dialog-next">
          {dialog.index + 1}/{dialog.lines.length}　{isTouch ? '點一下' : ''}
          {last ? '結束' : '繼續'} <kbd>F</kbd>
        </div>
      )}
    </div>
  )
}

const CHAPTERS: Record<number, { title: string; lines: string[]; next: string }> = {
  1: {
    title: '第一章　星願的起點',
    lines: ['你從孤身一人出發，在草原、迷霧森林與古代石環遇見了三位夥伴，', '並一起擊敗了史萊姆王。星願冒險團正式成立！'],
    next: '地上的戰利品別忘了撿。回星光村找村長，下一段旅程正在等著你們。',
  },
  2: {
    title: '第二章　月光山谷',
    lines: ['你們穿過北方林帶，淨化了被星晶侵蝕的月光山谷，', '並讓失控的苔蘚靈鹿恢復平靜。月泉再次發出溫柔的光。'],
    next: '地上的戰利品別忘了撿。山谷的魔靈與靈鹿會定期重生，可以反覆挑戰收集裝備。',
  },
}

/** Boss 擊敗後的章節完成畫面 */
export function ChapterComplete({ chapter }: { chapter: number }) {
  const close = useGame((s) => s.setChapterDone)
  const c = CHAPTERS[chapter] ?? CHAPTERS[1]
  return (
    <div className="overlay">
      <div className="panel chapter">
        <div className="chapter-en">✦ CHAPTER {chapter} CLEAR</div>
        <h2>{c.title}</h2>
        <p>
          {c.lines[0]}
          <br />
          {c.lines[1]}
        </p>
        <p className="muted">{c.next}</p>
        <button className="btn-primary" onClick={() => close(0)}>
          繼續冒險
        </button>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useGame((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => {
      if (useGame.getState().toast?.id === toast.id) useGame.setState({ toast: null })
    }, 2400)
    return () => clearTimeout(id)
  }, [toast])
  return toast ? (
    <div className="toast" key={toast.id}>
      {toast.text}
    </div>
  ) : null
}

/** 進城時的城鎮名稱橫幅（載入完成後出現，3 秒後淡出） */
export function TownBanner() {
  const mapId = useGame((s) => s.mapId)
  const town = useSyncExternalStore(subscribeMap, isMapLoading)
  // 第一次進城的過場（字卡已經有城鎮名稱）播完之後才顯示
  const cine = useSyncExternalStore(subscribeCutscene, getCutsceneState)
  const [show, setShow] = useState(0)
  useEffect(() => {
    if (mapId === 'overworld' || town || cine !== 'idle') return
    const id = Date.now()
    setShow(id)
    const t = setTimeout(() => setShow((v) => (v === id ? 0 : v)), 3200)
    return () => clearTimeout(t)
  }, [mapId, town, cine])
  if (!show || mapId === 'overworld') return null
  return (
    <div className="town-banner" key={show}>
      <span className="town-banner-en">STARLIGHT TOWN</span>
      <b>{TOWN_NAME}</b>
      <span className="town-banner-sub">安全區　·　商店與公會</span>
    </div>
  )
}
