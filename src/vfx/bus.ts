// 遊戲 → 特效的訊息佇列：戰鬥模擬只把「在這裡播放某個特效」放進來，
// 畫面層（scene/SkillVfx.tsx）每幀取出來交給 VfxWorld。戰鬥模擬因此不需要 three 或 React。
import type { CueName } from './cues'

export interface CueRequest {
  cue: CueName
  /** 參數來源：技能 id（demoSkills.ts） */
  skill: string
  x: number
  y: number
  z: number
  facing: number
}

const MAX = 128

export const vfxBus = {
  queue: [] as CueRequest[],
  clearRequested: false,
  push(r: CueRequest) {
    // 滿了就丟掉最舊的（畫面跟不上時寧可少畫）
    if (this.queue.length >= MAX) this.queue.shift()
    this.queue.push(r)
  },
  requestClear() {
    this.queue.length = 0
    this.clearRequested = true
  },
}
