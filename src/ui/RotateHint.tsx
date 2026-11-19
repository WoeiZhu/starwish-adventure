// 手機直拿時蓋住畫面，請玩家轉成橫向；Android 可以直接按按鈕進入全螢幕並鎖定橫向。
// 直拿期間遊戲自動暫停，轉回橫向後自動繼續。
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../game/store'
import { canFullscreen, enterAppMode, isIOS, isStandalone, isTouch } from '../systems/mobile'

const portraitQuery = () => window.matchMedia('(orientation: portrait)')

function usePortrait() {
  const [portrait, setPortrait] = useState(() => isTouch && portraitQuery().matches)
  useEffect(() => {
    if (!isTouch) return
    const mq = portraitQuery()
    const on = () => setPortrait(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return portrait
}

export function RotateHint() {
  const portrait = usePortrait()
  const autoPaused = useRef(false)

  useEffect(() => {
    const s = useGame.getState()
    if (portrait) {
      if (s.phase === 'playing' && !s.paused) {
        useGame.setState({ paused: true })
        autoPaused.current = true
      }
    } else if (autoPaused.current) {
      autoPaused.current = false
      // 期間玩家沒有自己打開選單才自動繼續
      if (!s.menu) useGame.setState({ paused: false })
    }
  }, [portrait])

  if (!portrait) return null
  return (
    <div className="rotate-hint">
      <div className="rotate-phone" aria-hidden>
        📱
      </div>
      <h2>請把手機轉成橫向</h2>
      <p>星願冒險團是橫向遊戲，轉過來就能繼續。</p>
      {canFullscreen() && !isStandalone && (
        <button className="btn-primary" onClick={() => void enterAppMode()}>
          全螢幕橫向遊玩
        </button>
      )}
      {isIOS && !isStandalone && (
        <p className="muted">
          iPhone 小提示：點 Safari 的「分享」→「加入主畫面」，
          <br />
          之後從桌面圖示開啟，就會像 App 一樣沒有網址列。
        </p>
      )}
    </div>
  )
}
