// 區塊：把世界切成固定大小的方格，每格記錄落在裡面的裝飾（樹、草、花、石頭…）。
// 資料常駐在記憶體（很小），畫面上的網格才依距離載入／卸載。
// 程序生成的支線區塊之後從 GENERATORS 接進來：內容只由「世界種子＋區塊座標＋生成器版本」決定，
// 不受載入順序影響；玩家進度（寶箱、解鎖）另外存在 progress，不放在區塊裡。
import { BORDER_TREES, CRYSTALS, FERNS, FLOWERS, GRASS, ROCKS, SHROOMS, TREES, type Tuft, type Vec2 } from '../data/world'
import { CLIFFS, RIDGE_ROCKS, type Boulder } from '../data/terrain'
import { GENERATOR_VERSION, STREAM, WORLD_SEED } from './config'

export const CS = STREAM.chunkSize
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`
export const chunkOf = (x: number, z: number) => ({ cx: Math.floor(x / CS), cz: Math.floor(z / CS) })
export const chunkCenter = (cx: number, cz: number): Vec2 => ({ x: (cx + 0.5) * CS, z: (cz + 0.5) * CS })

/** 區塊的範圍：有裝飾或地面細節的地方（再往外只有低解析度遠景地面） */
export const CHUNK_RANGE = { minCx: -5, maxCx: 4, minCz: -7, maxCz: 4 }
export const chunkExists = (cx: number, cz: number) =>
  cx >= CHUNK_RANGE.minCx && cx <= CHUNK_RANGE.maxCx && cz >= CHUNK_RANGE.minCz && cz <= CHUNK_RANGE.maxCz

export interface ChunkContent {
  key: string
  cx: number
  cz: number
  /** TREES 陣列中的索引（樹要個別淡出，所以記索引） */
  trees: number[]
  grass: Tuft[]
  flowers: Tuft[]
  rocks: Tuft[]
  ferns: Tuft[]
  borderTrees: Tuft[]
  crystals: Tuft[]
  shrooms: Tuft[]
  boulders: Boulder[]
  cliffs: Boulder[]
}

/** 程序生成器：之後的洞窟、野外支路從這裡接入（目前沒有） */
export interface ChunkGenerator {
  id: string
  version: number
  generate(seed: number, cx: number, cz: number): Partial<Omit<ChunkContent, 'key' | 'cx' | 'cz'>>
}
export const GENERATORS: ChunkGenerator[] = []

/** 區塊種子：只由世界種子、區塊座標、生成器版本決定（雜湊，與載入順序無關） */
export function chunkSeed(cx: number, cz: number, version = GENERATOR_VERSION, world = WORLD_SEED) {
  let h = Math.imul(world ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (cx * 0x27d4eb2d), 0xc2b2ae35)
  h = Math.imul(h ^ (cz * 0x165667b1), 0x27d4eb2d)
  h = Math.imul(h ^ version, 0x85ebca6b)
  return (h ^ (h >>> 16)) >>> 0
}

// ── 把設計好的裝飾分到各區塊（啟動時做一次） ──
const contents = new Map<string, ChunkContent>()
function bucket(cx: number, cz: number) {
  const k = chunkKey(cx, cz)
  let c = contents.get(k)
  if (!c) {
    c = { key: k, cx, cz, trees: [], grass: [], flowers: [], rocks: [], ferns: [], borderTrees: [], crystals: [], shrooms: [], boulders: [], cliffs: [] }
    contents.set(k, c)
  }
  return c
}
const at = (p: Vec2) => {
  const { cx, cz } = chunkOf(p.x, p.z)
  return bucket(cx, cz)
}
TREES.forEach((t, i) => at(t).trees.push(i))
for (const g of GRASS) at(g).grass.push(g)
for (const f of FLOWERS) at(f).flowers.push(f)
ROCKS.forEach((r, i) => at(r).rocks.push({ ...r, color: i % 2 ? '#b7bcc4' : '#a3a9b3' }))
for (const f of FERNS) at(f).ferns.push(f)
for (const b of BORDER_TREES) at(b).borderTrees.push(b)
for (const c of CRYSTALS) at(c).crystals.push(c)
for (const m of SHROOMS) at(m).shrooms.push(m)
for (const b of RIDGE_ROCKS) at(b).boulders.push(b)
for (const b of CLIFFS) at(b).cliffs.push(b)

/** 區塊內容：設計好的裝飾＋程序生成的部分（生成結果快取，同一區塊永遠相同） */
export function chunkContent(cx: number, cz: number): ChunkContent {
  const c = bucket(cx, cz)
  if (GENERATORS.length && !(c as { generated?: boolean }).generated) {
    for (const g of GENERATORS) {
      const extra = g.generate(chunkSeed(cx, cz, g.version), cx, cz)
      for (const [k, v] of Object.entries(extra)) (c as unknown as Record<string, unknown[]>)[k].push(...(v as unknown[]))
    }
    ;(c as { generated?: boolean }).generated = true
  }
  return c
}
