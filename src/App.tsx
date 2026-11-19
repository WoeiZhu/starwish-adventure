import { useEffect } from 'react'
import { useGame } from './game/store'
import { GameScene } from './scene/GameScene'
import { installInput } from './systems/input'
import { Hud } from './ui/Hud'
import { MenuPanel } from './ui/MenuPanel'
import { ChapterComplete, DialogBox, HelpPanel, PauseOverlay, Toast } from './ui/Overlays'
import { TitleScreen } from './ui/TitleScreen'

export function App() {
  const phase = useGame((s) => s.phase)
  const paused = useGame((s) => s.paused)
  const showHelp = useGame((s) => s.showHelp)
  const dialog = useGame((s) => s.dialog)
  const menu = useGame((s) => s.menu)
  const chapterDone = useGame((s) => s.chapterDone)

  useEffect(() => installInput(), [])
  // 關閉或重新整理頁面前存檔
  useEffect(() => {
    const save = () => useGame.getState().saveGame()
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [])

  return (
    <div className="app">
      <GameScene />
      {phase === 'title' ? (
        <TitleScreen />
      ) : (
        <>
          <Hud />
          <Toast />
          {dialog && <DialogBox />}
          {showHelp && !paused && <HelpPanel />}
          {menu && <MenuPanel />}
          {paused && !menu && <PauseOverlay />}
          {chapterDone && !dialog && <ChapterComplete />}
        </>
      )}
    </div>
  )
}
