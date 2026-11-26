import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import * as cstate from './game/combat/state'
import { combat } from './game/combat/state'
import * as nav from './systems/pathfinding'
import * as stream from './world/stream'
import * as sim from './game/combat/sim'
import * as actions from './game/combat/actions'
import { progress } from './game/progress'
import * as prog from './game/progress'
import * as items from './data/items'
import * as townData from './data/town'
import * as music from './systems/music'
import { runtime } from './game/runtime'
import { useGame } from './game/store'
import * as story from './game/story'
import * as travel from './game/travel'
import * as save from './game/save'
import { mapState } from './world/maps'
import { townStats } from './scene/Town'
import * as cutsceneMod from './game/cutscene'
import * as mapDraw from './ui/mapDraw'
import { loadUi } from './ui/LoadingScreen'
import './styles.css'
import './menu.css'
import './hud.css'
import './mobile.css'
import './menu2.css'

// 開發模式下把遊戲狀態掛到 window，方便在主控台檢查與自動化測試
if (import.meta.env.DEV) {
  Object.assign(window, {
    __sw: { combat, cstate, sim, actions, runtime, useGame, progress, prog, items, townData, music, story, nav, travel, save, mapState, townStats, cutscene: cutsceneMod, loadUi, mapDraw, stream: { ...stream, stats: stream.streamStats } },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
