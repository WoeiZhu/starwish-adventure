import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { combat } from './game/combat/state'
import * as sim from './game/combat/sim'
import { progress } from './game/progress'
import { runtime } from './game/runtime'
import { useGame } from './game/store'
import * as story from './game/story'
import './styles.css'
import './menu.css'
import './hud.css'
import './mobile.css'

// 開發模式下把遊戲狀態掛到 window，方便在主控台檢查與自動化測試
if (import.meta.env.DEV) {
  Object.assign(window, { __sw: { combat, sim, runtime, useGame, progress, story } })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
