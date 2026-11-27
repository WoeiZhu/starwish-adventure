import { useEffect } from 'react'
import { useGame } from './game/store'
import { GameScene } from './scene/GameScene'
import { installInput } from './systems/input'
import { installTouchGuards } from './systems/mobile'
import { unlockAudio } from './systems/sfx'
import { RotateHint } from './ui/RotateHint'
import { Hud } from './ui/Hud'
import { MenuPanel } from './ui/MenuPanel'
import { SellPanel } from './ui/SellPanel'
import { LoadingScreen } from './ui/LoadingScreen'
import { ChapterComplete, DialogBox, HelpPanel, PauseOverlay, Toast, TownBanner } from './ui/Overlays'
import { Music } from './ui/Music'
import { TitleScreen } from './ui/TitleScreen'
import { TownIntro, useCutsceneActive } from './ui/TownIntro'

export function App() {
  const phase = useGame((s) => s.phase)
  const paused = useGame((s) => s.paused)
  const showHelp = useGame((s) => s.showHelp)
  const dialog = useGame((s) => s.dialog)
  const menu = useGame((s) => s.menu)
  const sell = useGame((s) => s.sell)
  const chapterDone = useGame((s) => s.chapterDone)
  const cine = useCutsceneActive()

  useEffect(() => installInput(), [])
  useEffect(() => installTouchGuards(), [])
  // 第一次點擊畫面時喚醒聲音（iPhone 規定）
  useEffect(() => {
    const once = () => unlockAudio()
    window.addEventListener('pointerdown', once, { once: true })
    return () => window.removeEventListener('pointerdown', once)
  }, [])
  // 關閉或重新整理頁面前存檔
  useEffect(() => {
    const save = () => useGame.getState().saveGame()
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [])

  return (
    <div className={`app${cine ? ' cine' : ''}`}>
      <GameScene />
      {phase === 'title' ? (
        <TitleScreen />
      ) : (
        <>
          <Hud />
          <TownBanner />
          <Toast />
          <TownIntro />
          <LoadingScreen />
          {dialog && <DialogBox />}
          {showHelp && !paused && <HelpPanel />}
          {menu && <MenuPanel />}
          {sell && <SellPanel />}
          {paused && !menu && !sell && <PauseOverlay />}
          {chapterDone > 0 && !dialog && <ChapterComplete chapter={chapterDone} />}
        </>
      )}
      <RotateHint />
      <Music />
    </div>
  )
}
