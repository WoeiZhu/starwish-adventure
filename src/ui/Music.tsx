// 背景音樂切換：野外播草原曲、城鎮播城鎮曲；第一次點擊／按鍵後才會開始（瀏覽器規定）。
import { useEffect } from 'react'
import { useGame } from '../game/store'
import { setMusic, tryResumeMusic } from '../systems/music'
import { unlockAudio } from '../systems/sfx'

export function Music() {
  const phase = useGame((s) => s.phase)
  const mapId = useGame((s) => s.mapId)
  useEffect(() => {
    setMusic(phase === 'playing' ? (mapId === 'overworld' ? 'field' : 'town') : null)
  }, [phase, mapId])
  useEffect(() => {
    const on = () => {
      unlockAudio()
      tryResumeMusic()
    }
    window.addEventListener('pointerdown', on)
    window.addEventListener('keydown', on)
    return () => {
      window.removeEventListener('pointerdown', on)
      window.removeEventListener('keydown', on)
    }
  }, [])
  return null
}
