// 手機模式：偵測觸控裝置、進入全螢幕並鎖定橫向，像 App 一樣遊玩。
// Android Chrome 支援全螢幕＋鎖定橫向；iPhone Safari 沒有這兩個功能，
// 只能請玩家把手機轉橫，或「加入主畫面」後從桌面圖示開啟（沒有網址列）。

/** 主要輸入是手指（手機、平板） */
export const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** 從主畫面圖示開啟（PWA），本身就沒有網址列 */
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FsDocument = Document & { webkitFullscreenElement?: Element | null }

/** 這個瀏覽器能不能用程式切全螢幕（iPhone Safari 不行） */
export function canFullscreen() {
  const el = document.documentElement as FsElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

export function isFullscreen() {
  const d = document as FsDocument
  return !!(d.fullscreenElement || d.webkitFullscreenElement)
}

/** 進入全螢幕並鎖定橫向；必須在點擊等使用者操作中呼叫。不支援時安靜略過。 */
export async function enterAppMode() {
  if (!isTouch) return
  const el = document.documentElement as FsElement
  try {
    if (!isFullscreen() && !isStandalone) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else await el.webkitRequestFullscreen?.()
    }
  } catch {
    /* 使用者拒絕或瀏覽器不支援 */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await o.lock?.('landscape')
  } catch {
    /* 只有全螢幕或 PWA 中才能鎖定方向 */
  }
}

/** 擋掉瀏覽器自己的雙指縮放與長按選單，避免整頁被放大或拖走 */
export function installTouchGuards() {
  if (!isTouch) return () => {}
  document.documentElement.classList.add('touch')
  const stop = (e: Event) => e.preventDefault()
  // iOS Safari 忽略 user-scalable=no，要另外攔 gesture 事件
  document.addEventListener('gesturestart', stop)
  document.addEventListener('contextmenu', stop)
  return () => {
    document.removeEventListener('gesturestart', stop)
    document.removeEventListener('contextmenu', stop)
  }
}
