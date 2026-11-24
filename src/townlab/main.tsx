// 城鎮場景測試頁的入口（town-lab.html）。和遊戲共用城鎮配置與畫面元件，不載入存檔與介面。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TownLab } from './TownLab'
import './townlab.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TownLab />
  </StrictMode>,
)
