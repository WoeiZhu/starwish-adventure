// 存檔：localStorage 單一存檔。記錄角色、成長、背包與所在位置。
import { CLASSES, CLASS_ORDER, HERO_CLASSES, MAX_ACTIVE, MAX_LEVEL, type ClassId } from '../data/classes'
import type { Gender } from '../data/appearance'
import { SLOTS, type Item } from '../data/items'
import { BRIDGES } from '../data/terrain'
import { TOWN_BOUNDS, TOWN_ID, TOWN_PORTAL, TOWN_SPAWN, type MapId } from '../data/town'
import { BOUNDS, refreshGates, regionAt, type RegionId } from '../data/world'
import { isTownBlocked, nearestWalkableOverworld } from '../systems/pathfinding'
import { STORY_STEPS, progress, type MemberProgress, type StoryState } from './progress'
import { combat } from './combat/state'
import type { MapSpot } from './travel'

// 存檔鍵沿用 v1 的名稱，舊存檔才找得到；格式版本記在資料裡的 version
const SAVE_KEY = 'starwish.save.v1'
/**
 * 版本紀錄：
 *   1：角色、成長、背包、劇情、位置
 *   2：加上 unlocks（地圖捷徑）與 region（所在區域）。讀到 1 版會自動轉換：
 *      捷徑視為未解鎖；位置若剛好落在新地形（河流、山脊）裡，移到最近的可走處
 *   3：加上 mapId（所在地圖：主線世界 / 星光鎮）與 returnPortal（在城裡時，出城後回到的位置）。
 *      讀到 1、2 版：當作在主線世界、沒有返回位置，其他進度照舊
 *   （3 版之後加的 bench＝休息名單是選填欄位：沒有就當作全員出戰，不用升版本）
 */
const VERSION = 3
// 'intro_town'：第一次進星光鎮的過場已經看過（game/cutscene.ts 的 INTRO_FLAG；這裡寫死字串，避免模組互相引用）
const UNLOCK_IDS = new Set([...BRIDGES.filter((b) => b.locked).map((b) => b.id), 'intro_town'])
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
  /** 所在地圖上的位置 */
  pos: { x: number; z: number }
  /** 存檔時所在地圖：讀檔時先載入這張地圖，再放上人物 */
  mapId: MapId
  /** 在城裡存檔時：出城後回到的主線世界位置；在野外時為 null */
  returnPortal: MapSpot | null
  /** 存檔時所在區域（在城裡時是城門外那一區）：讀檔時先準備這一區，再放上人物 */
  region: RegionId
  members: Record<ClassId, MemberProgress>
  inventory: Item[]
  gold: number
  potions: number
  kills: number
  recruited: ClassId[]
  /** 休息中的隊友（舊存檔沒有：全員出戰） */
  bench: ClassId[]
  /** 事件 Boss 的血量比例（選填欄位，舊存檔沒有） */
  bossHp: Record<string, number>
  story: StoryState
  unlocks: string[]
}

/** 事件 Boss（石環史萊姆王、月泉靈鹿）受傷的血量比例：場上還活著就記下目前的，已經不在場就沿用先前的 */
function snapshotBossHp() {
  for (const tag of ['boss', 'boss2']) {
    const u = combat.units.find((x) => x.tag === tag && x.alive)
    if (u && u.hp < u.maxHp) progress.bossHp[tag] = Math.max(0.02, u.hp / u.maxHp)
  }
  return { ...progress.bossHp }
}

export function writeSave(profile: SaveProfile, pos: { x: number; z: number }, mapId: MapId, returnPortal: MapSpot | null) {
  const ret = mapId === 'overworld' ? null : returnPortal ?? { ...TOWN_PORTAL.ret }
  const outside = ret ?? pos
  const data: SaveData = {
    version: VERSION,
    savedAt: Date.now(),
    profile,
    pos: { x: pos.x, z: pos.z },
    mapId,
    returnPortal: ret && { x: ret.x, z: ret.z, facing: ret.facing },
    region: regionAt(outside.x, outside.z),
    members: progress.members,
    inventory: progress.inventory,
    gold: progress.gold,
    potions: progress.potions,
    kills: progress.kills,
    recruited: progress.recruited,
    bench: progress.bench,
    bossHp: snapshotBossHp(),
    story: progress.story,
    unlocks: progress.unlocks,
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
    if (![1, 2, VERSION].includes(d.version ?? 0) || !d.profile || !d.members || !(d.profile.classId in CLASSES) || !HERO_CLASSES.includes(d.profile.classId)) return null
    const heroClass = d.profile.classId
    // 1、2 版沒有 mapId：一律當作在主線世界
    const mapId: MapId = d.mapId === TOWN_ID ? TOWN_ID : 'overworld'
    let pos: { x: number; z: number }
    let returnPortal: MapSpot | null = null
    if (mapId === 'overworld') {
      // 位置：限制在可行走範圍內；落在障礙物裡（例如舊存檔站的地方後來變成河）就移到最近的可走處
      pos = nearestWalkableOverworld({ x: num(d.pos?.x, BOUNDS.minX, BOUNDS.maxX, 0), z: num(d.pos?.z, BOUNDS.minZ, BOUNDS.maxZ, 6) })
    } else {
      // 城裡：位置要在城鎮範圍內的可走處，不行就放回進城落點
      const p = { x: num(d.pos?.x, TOWN_BOUNDS.minX, TOWN_BOUNDS.maxX, TOWN_SPAWN.x), z: num(d.pos?.z, TOWN_BOUNDS.minZ, TOWN_BOUNDS.maxZ, TOWN_SPAWN.z) }
      pos = isTownBlocked(p.x, p.z) ? { x: TOWN_SPAWN.x, z: TOWN_SPAWN.z } : p
      // 返回位置：缺少或超出野外範圍就用城門外的預設位置；落在障礙物裡就移到最近的可走處
      const r = d.returnPortal
      const ok = r && Number.isFinite(r.x) && Number.isFinite(r.z) && r.x >= BOUNDS.minX && r.x <= BOUNDS.maxX && r.z >= BOUNDS.minZ && r.z <= BOUNDS.maxZ
      returnPortal = ok
        ? { ...nearestWalkableOverworld(r), facing: Number.isFinite(r.facing) ? r.facing : TOWN_PORTAL.ret.facing }
        : { ...TOWN_PORTAL.ret }
    }
    const outside = returnPortal ?? pos
    // 階段 C 的舊存檔沒有招募名單：當作第一章三位夥伴都已加入
    const recruited = Array.isArray(d.recruited)
      ? CLASS_ORDER.filter((c) => c !== heroClass && d.recruited!.includes(c)).sort((a, b) => d.recruited!.indexOf(a) - d.recruited!.indexOf(b))
      : HERO_CLASSES.filter((c) => c !== heroClass)
    // 休息名單：只留名單上的人，且出戰的不超過上限（多的從後面加入的開始休息）
    const bench = Array.isArray(d.bench) ? recruited.filter((c) => d.bench!.includes(c)) : []
    for (const c of [...recruited].reverse()) if (recruited.length - bench.length > MAX_ACTIVE && !bench.includes(c)) bench.push(c)
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
      pos,
      mapId,
      returnPortal,
      region: regionAt(outside.x, outside.z),
      members,
      inventory,
      gold: Math.round(num(d.gold, 0, 1e9, 0)),
      potions: Math.round(num(d.potions, 0, 999, 0)),
      kills: Math.round(num(d.kills, 0, 1e9, 0)),
      recruited,
      bench,
      bossHp: Object.fromEntries(
        Object.entries(d.bossHp && typeof d.bossHp === 'object' ? d.bossHp : {}).filter(([k, v]) => (k === 'boss' || k === 'boss2') && typeof v === 'number' && v > 0 && v < 1),
      ),
      // 階段 C 的舊存檔沒有劇情欄位：直接挑戰 Boss
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
      // 1 版沒有這個欄位；只保留目前地圖上存在的捷徑 id
      unlocks: Array.isArray(d.unlocks) ? [...new Set(d.unlocks.filter((u) => typeof u === 'string' && UNLOCK_IDS.has(u)))] : [],
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
  progress.bench = [...d.bench]
  progress.bossHp = { ...d.bossHp }
  progress.story = d.story
  progress.unlocks = [...d.unlocks]
  refreshGates(progress.unlocks)
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* 略過 */
  }
}
