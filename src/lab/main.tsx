// 技能特效測試頁的入口（skill-lab.html）。和遊戲共用程式碼，但不載入地圖、存檔與介面。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SkillLab } from './SkillLab'
import './lab.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkillLab />
  </StrictMode>,
)
