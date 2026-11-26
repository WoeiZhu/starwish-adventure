// 鍵盤輸入：持續按住的鍵存在 keys；一次性按鍵直接呼叫 store / 戰鬥動作。
import { cycleTarget, heroCast } from '../game/combat/sim'
import { cutscene, skipCutscene } from '../game/cutscene'
import { runtime } from '../game/runtime'
import { interactNearest } from '../game/story'
import { usePotion } from '../game/combat/rewards'
import { useGame, type MenuTab } from '../game/store'

export const keys = new Set<string>()

const MENU_KEYS: Record<string, MenuTab> = { KeyI: 'bag', KeyK: 'tree', KeyP: 'party', KeyM: 'map' }
const SKILL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4']

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
}

export function installInput() {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    const s = useGame.getState()
    if (s.phase !== 'playing') return
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault()
    // 過場播放中：這幾個鍵是跳過，其他按鍵都不理
    if (cutscene.state === 'active') {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') skipCutscene()
      return
    }
    keys.add(e.code)
    if (e.repeat) return
    const acting = !s.paused && !s.dialog
    switch (e.code) {
      case 'Escape':
        if (s.menu) s.closeMenu()
        else if (s.dialog) s.closeDialog()
        else if (s.showHelp) s.toggleHelp()
        else s.togglePause()
        break
      case 'KeyR':
      case 'Home':
        s.resetCamera()
        break
      case 'KeyH':
        s.toggleHelp()
        break
      case 'KeyV':
        s.setCamMode(s.camMode === 'explore' ? 'immersive' : 'explore')
        break
      case 'KeyF':
      case 'Enter':
        interactNearest()
        break
      case 'Space':
        if (s.dialog) s.advanceDialog()
        else if (acting) runtime.dodge.request = true
        break
      case 'Tab':
        if (acting) cycleTarget()
        break
      default: {
        const skill = SKILL_KEYS.indexOf(e.code)
        if (skill >= 0 && s.dialog?.choices) s.choose(skill)
        else if (skill >= 0 && acting) heroCast(skill)
        else if (MENU_KEYS[e.code]) s.openMenu(MENU_KEYS[e.code])
        else if (e.code === 'KeyZ' && acting) {
          const why = usePotion()
          if (why) s.showToast(why)
        }
      }
    }
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const clear = () => keys.clear()
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
    keys.clear()
  }
}

/** 手機虛擬搖桿的輸入（由 TouchControls 寫入）：x、y 為 -1～1 */
export const stick = { x: 0, y: 0, run: false }

const any = (...codes: string[]) => codes.some((c) => keys.has(c))
/** 回傳移動輸入：x = 右(+)/左(-)，y = 前(+)/後(-) */
export function moveAxis() {
  if (stick.x !== 0 || stick.y !== 0) return { x: stick.x, y: stick.y, run: stick.run }
  return {
    x: (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0),
    y: (any('KeyW', 'ArrowUp') ? 1 : 0) - (any('KeyS', 'ArrowDown') ? 1 : 0),
    run: any('ShiftLeft', 'ShiftRight'),
  }
}
export const rotateAxis = () => (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)
