// 遊戲規則層狀態（低頻變動）：角色資料、暫停、選單、對話、存檔。
import { create } from 'zustand'
import { CLASSES, type ClassId } from '../data/classes'
import type { Gender } from '../data/appearance'
import type { MapId } from '../data/town'
import { SPAWN, type RegionId } from '../data/world'
import { initCombat } from './combat/state'
import { progress, resetProgress } from './progress'
import { resetRuntime, runtime } from './runtime'
import { applySave, readSave, writeSave, type SaveData } from './save'
import { arriveFromSave, resetMap, travel } from './travel'
import { isTouch } from '../systems/mobile'
import { mapState } from '../world/maps'
import { primeStream } from '../world/stream'

const PROFILE_KEY = 'starwish.profile.v1'

interface Profile {
  name: string
  gender: Gender
  classId: ClassId
}

function loadProfile(): Profile {
  const fallback: Profile = { name: '小星', gender: 'girl', classId: 'archer' }
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<Profile>
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 8) : fallback.name,
      gender: p.gender === 'boy' ? 'boy' : 'girl',
      classId: p.classId && p.classId in CLASSES ? p.classId : fallback.classId,
    }
  } catch {
    return fallback
  }
}
function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    /* 無痕模式等情況下略過存檔 */
  }
}

const QUALITY_KEY = 'starwish.quality'
/** 畫質：高（陰影 2048、解析度最高 2 倍）／中（陰影 1024、解析度最高 1.5 倍）／低（陰影 1024、不放大、少陰影）。 */
export type Quality = 'high' | 'mid' | 'saver'
function loadQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY)
    if (q === 'high' || q === 'mid' || q === 'saver') return q
  } catch {
    /* 略過 */
  }
  return isTouch ? 'saver' : 'high'
}

export type ZoomLabel = 'far' | 'mid' | 'near'
export type MenuTab = 'party' | 'bag' | 'tree'
/** 對話最後一句出現的選項 */
export interface Choice {
  label: string
  desc?: string
  /** 有值時選項不可選，並顯示此原因 */
  disabled?: string
  run: () => void
}
export interface DialogState {
  speaker: string
  lines: string[]
  index: number
  choices?: Choice[]
  /** 沒有選項的對話結束時呼叫 */
  onEnd?: () => void
}
/** 標題畫面顯示用的存檔摘要 */
export interface SaveSummary {
  name: string
  classId: ClassId
  level: number
  savedAt: number
}

interface GameState {
  phase: 'title' | 'playing'
  paused: boolean
  /** 開啟中的選單分頁；開啟時遊戲暫停 */
  menu: MenuTab | null
  showHelp: boolean
  hero: Profile
  dialog: DialogState | null
  zoom: ZoomLabel
  /** 鏡頭模式（會記住） */
  camMode: 'explore' | 'immersive'
  hint: string | null
  toast: { id: number; text: string } | null
  cameraResetTick: number
  /** HUD 重繪用：戰鬥數值每 0.1 秒遞增一次 */
  tick: number
  /** 裝備變更時遞增，讓角色模型重新套用武器外觀 */
  gearVersion: number
  save: SaveSummary | null
  /** 隊伍成員變動時遞增，讓場景重新建立隊友模型 */
  partyVersion: number
  /** 剛完成的章節（顯示章節完成畫面）；0 = 不顯示 */
  chapterDone: number
  region: RegionId
  /** 目前所在地圖（場景切換用；每幀判斷用 world/maps.ts 的 mapState） */
  mapId: MapId
  /** 畫質：高畫質 / 省電（手機預設省電） */
  quality: Quality

  setQuality: (q: Quality) => void
  setMap: (id: MapId) => void
  setProfile: (p: Partial<Profile>) => void
  startGame: () => void
  continueGame: () => void
  saveGame: () => void
  backToTitle: () => void
  togglePause: () => void
  openMenu: (tab: MenuTab) => void
  closeMenu: () => void
  bumpGear: () => void
  partyChanged: () => void
  setChapterDone: (chapter: number) => void
  setRegion: (r: RegionId) => void
  openDialog: (d: DialogState) => void
  choose: (i: number) => void
  toggleHelp: () => void
  resetCamera: () => void
  setZoom: (z: ZoomLabel) => void
  setCamMode: (m: 'explore' | 'immersive') => void
  setHint: (h: string | null) => void
  showToast: (text: string) => void
  advanceDialog: () => void
  closeDialog: () => void
}

const summarize = (d: SaveData | null): SaveSummary | null =>
  d && {
    name: d.profile.name,
    classId: d.profile.classId,
    level: d.members[d.profile.classId].level,
    savedAt: d.savedAt,
  }

let toastSeq = 0
const initialProfile = loadProfile()
// 標題畫面也要顯示人物與史萊姆，所以啟動時先建立一次戰鬥單位
initCombat(initialProfile.name, initialProfile.classId)

export const useGame = create<GameState>()((set, get) => ({
  phase: 'title',
  paused: false,
  menu: null,
  showHelp: false,
  hero: initialProfile,
  dialog: null,
  zoom: 'mid',
  camMode: (() => {
    try {
      return localStorage.getItem('starwish.cam') === 'explore' ? 'explore' : 'immersive'
    } catch {
      return 'immersive'
    }
  })(),
  hint: null,
  toast: null,
  cameraResetTick: 0,
  tick: 0,
  gearVersion: 0,
  save: summarize(readSave()),
  partyVersion: 0,
  chapterDone: 0,
  region: 'village',
  mapId: 'overworld',
  quality: loadQuality(),

  setMap: (mapId) => {
    if (get().mapId !== mapId) set({ mapId })
  },
  setQuality: (quality) => {
    try {
      localStorage.setItem(QUALITY_KEY, quality)
    } catch {
      /* 略過 */
    }
    set({ quality })
  },
  setProfile: (p) => {
    const h = get().hero
    const next: Profile = {
      name: p.name ?? h.name,
      gender: p.gender ?? h.gender,
      classId: p.classId ?? h.classId,
    }
    saveProfile(next)
    set({ hero: next })
  },
  /** 開始新冒險：清空成長資料（會覆蓋舊存檔） */
  startGame: () => {
    const h = get().hero
    const hero = { ...h, name: h.name.trim() || '小星' }
    saveProfile(hero)
    resetProgress()
    resetRuntime()
    resetMap()
    initCombat(hero.name, hero.classId)
    primeStream(runtime.player.x, runtime.player.z)
    set((s) => ({
      mapId: 'overworld',
      phase: 'playing',
      paused: false,
      menu: null,
      dialog: null,
      hint: null,
      hero,
      gearVersion: s.gearVersion + 1,
      partyVersion: s.partyVersion + 1,
      chapterDone: 0,
    }))
    get().saveGame()
  },
  /** 讀取存檔繼續 */
  continueGame: () => {
    const d = readSave()
    if (!d) {
      set({ save: null })
      return get().showToast('找不到存檔')
    }
    applySave(d)
    saveProfile(d.profile)
    resetRuntime()
    runtime.player.x = d.pos.x
    runtime.player.z = d.pos.z
    initCombat(d.profile.name, d.profile.classId, d.pos)
    // 先載入存檔所在的地圖（野外：周圍區塊；城鎮：城鎮模型），主角在載入完成前不會出現、也不能移動
    arriveFromSave(d.mapId, d.pos, d.returnPortal)
    set((s) => ({
      mapId: d.mapId,
      phase: 'playing',
      paused: false,
      menu: null,
      dialog: null,
      hint: null,
      hero: d.profile,
      gearVersion: s.gearVersion + 1,
      partyVersion: s.partyVersion + 1,
      chapterDone: 0,
    }))
  },
  saveGame: () => {
    const s = get()
    if (s.phase !== 'playing') return
    if (writeSave(s.hero, runtime.player, mapState.id, travel.returnPortal)) {
      set({ save: { name: s.hero.name, classId: s.hero.classId, level: progress.members[s.hero.classId].level, savedAt: Date.now() } })
    }
  },
  backToTitle: () => {
    get().saveGame()
    resetRuntime()
    resetMap()
    const h = get().hero
    initCombat(h.name, h.classId, SPAWN)
    primeStream(SPAWN.x, SPAWN.z)
    set((s) => ({
      mapId: 'overworld',
      phase: 'title',
      paused: false,
      menu: null,
      dialog: null,
      hint: null,
      showHelp: false,
      chapterDone: 0,
      partyVersion: s.partyVersion + 1,
    }))
  },
  togglePause: () => {
    if (get().phase !== 'playing') return
    runtime.path = null
    set((s) => ({ paused: !s.paused, menu: null }))
  },
  openMenu: (tab) => {
    const s = get()
    if (s.phase !== 'playing' || s.dialog) return
    // 再按一次同一個分頁的快捷鍵就關閉
    if (s.menu === tab) return s.closeMenu()
    runtime.path = null
    set({ menu: tab, paused: true, showHelp: false })
  },
  closeMenu: () => {
    if (!get().menu) return
    set({ menu: null, paused: false })
    get().saveGame()
  },
  bumpGear: () => set((s) => ({ gearVersion: s.gearVersion + 1 })),
  partyChanged: () => set((s) => ({ partyVersion: s.partyVersion + 1, gearVersion: s.gearVersion + 1 })),
  setChapterDone: (chapterDone) => set({ chapterDone }),
  setRegion: (region) => {
    if (get().region !== region) set({ region })
  },
  openDialog: (dialog) => set({ dialog }),
  choose: (i) => {
    const d = get().dialog
    const c = d?.choices?.[i]
    if (!d || !c || c.disabled || d.index < d.lines.length - 1) return
    set({ dialog: null })
    c.run()
  },
  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),
  resetCamera: () => set((s) => ({ cameraResetTick: s.cameraResetTick + 1 })),
  setCamMode: (camMode) => {
    if (get().camMode === camMode) return
    set({ camMode })
    try {
      localStorage.setItem('starwish.cam', camMode)
    } catch {
      /* 無痕模式 */
    }
  },
  setZoom: (zoom) => {
    if (get().zoom !== zoom) set({ zoom })
  },
  setHint: (hint) => {
    if (get().hint !== hint) set({ hint })
  },
  showToast: (text) => set({ toast: { id: ++toastSeq, text } }),
  advanceDialog: () => {
    const d = get().dialog
    if (!d) return
    if (d.index + 1 < d.lines.length) return set({ dialog: { ...d, index: d.index + 1 } })
    if (d.choices?.length) return // 最後一句有選項：等玩家選擇
    set({ dialog: null })
    d.onEnd?.()
  },
  closeDialog: () => set({ dialog: null }),
}))
