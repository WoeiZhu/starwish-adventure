// 存檔：localStorage 單一存檔。記錄角色、成長、背包與所在位置。
import { CLASSES, CLASS_ORDER, MAX_LEVEL, type ClassId } from '../data/classes'
import type { Gender } from '../data/appearance'
import { SLOTS, type Item } from '../data/items'
import { BOUNDS } from '../data/world'
import { STORY_STEPS, progress, type MemberProgress, type StoryState } from './progress'

const SAVE_KEY = 'starwish.save.v1'
const VERSION = 1
const STEPS: readonly StoryState['step'][] = STORY_STEPS

export interface SaveProfile {
  name: string
  gender: Gender
  classId: ClassId
}

export interface SaveData {
  version: number
  savedAt: number
  profile: SaveProfile
  pos: { x: number; z: number }
  members: Record<ClassId, MemberProgress>
  inventory: Item[]
  gold: number
  potions: number
  kills: number
  recruited: ClassId[]
  story: StoryState
}

export function writeSave(profile: SaveProfile, pos: { x: number; z: number }) {
  const data: SaveData = {
    version: VERSION,
    savedAt: Date.now(),
    profile,
    pos: { x: pos.x, z: pos.z },
    members: progress.members,
    inventory: progress.inventory,
    gold: progress.gold,
    potions: progress.potions,
    kills: progress.kills,
    recruited: progress.recruited,
    story: progress.story,
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false // 無痕模式或空間不足時略過
  }
}

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback

/** 讀取並檢查存檔；格式不對就當作沒有存檔 */
export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<SaveData>
    if (d.version !== VERSION || !d.profile || !d.members || !(d.profile.classId in CLASSES)) return null
    const heroClass = d.profile.classId
    const inventory = (Array.isArray(d.inventory) ? d.inventory : []).filter(
      (i): i is Item => !!i && typeof i.uid === 'string' && SLOTS.includes(i.slot) && typeof i.stats === 'object',
    )
    const uids = new Set(inventory.map((i) => i.uid))
    const members = {} as Record<ClassId, MemberProgress>
    for (const c of CLASS_ORDER) {
      const m = d.members[c]
      const equip: MemberProgress['equip'] = {}
      for (const s of SLOTS) {
        const uid = m?.equip?.[s]
        if (uid && uids.has(uid)) equip[s] = uid
      }
      members[c] = {
        level: Math.round(num(m?.level, 1, MAX_LEVEL, 1)),
        exp: num(m?.exp, 0, 1e9, 0),
        nodes: m?.nodes && typeof m.nodes === 'object' ? { ...m.nodes } : {},
        equip,
      }
    }
    return {
      version: VERSION,
      savedAt: num(d.savedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      profile: {
        name: String(d.profile.name ?? '小星').slice(0, 8) || '小星',
        gender: d.profile.gender === 'boy' ? 'boy' : 'girl',
        classId: d.profile.classId,
      },
      pos: { x: num(d.pos?.x, BOUNDS.minX, BOUNDS.maxX, 0), z: num(d.pos?.z, BOUNDS.minZ, BOUNDS.maxZ, 6) },
      members,
      inventory,
      gold: Math.round(num(d.gold, 0, 1e9, 0)),
      potions: Math.round(num(d.potions, 0, 999, 0)),
      kills: Math.round(num(d.kills, 0, 1e9, 0)),
      // 階段 C 的舊存檔沒有這兩個欄位：當作已招募全員、直接挑戰 Boss
      recruited: Array.isArray(d.recruited)
        ? CLASS_ORDER.filter((c) => c !== heroClass && d.recruited!.includes(c)).sort(
            (a, b) => d.recruited!.indexOf(a) - d.recruited!.indexOf(b),
          )
        : CLASS_ORDER.filter((c) => c !== heroClass),
      story:
        d.story && STEPS.includes(d.story.step)
          ? {
              step: d.story.step,
              huntKills: Math.round(num(d.story.huntKills, 0, 99, 0)),
              chests: Array.isArray(d.story.chests) ? d.story.chests.filter((c) => typeof c === 'string') : [],
              // 第二章以前的存檔沒有這兩個欄位
              c2Wolf: Math.round(num(d.story.c2Wolf, 0, 99, 0)),
              c2Shroom: Math.round(num(d.story.c2Shroom, 0, 99, 0)),
            }
          : { step: 'boss', huntKills: 0, chests: [], c2Wolf: 0, c2Shroom: 0 },
    }
  } catch {
    return null
  }
}

/** 把存檔內容套用到成長資料 */
export function applySave(d: SaveData) {
  progress.members = d.members
  progress.inventory = d.inventory
  progress.gold = d.gold
  progress.potions = d.potions
  progress.kills = d.kills
  progress.recruited = d.recruited
  progress.story = d.story
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* 略過 */
  }
}
