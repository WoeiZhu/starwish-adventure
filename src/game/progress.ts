// 成長資料（會存檔）：每位隊員的等級、經驗、技能樹、裝備，以及共用的背包、金幣、藥水。
// 這個模組只管資料與計算，不碰戰鬥狀態與畫面。
import { CLASSES, CLASS_ORDER, MAX_LEVEL, type ClassId } from '../data/classes'
import { SLOTS, itemScore, type Item, type Slot } from '../data/items'
import { TREES, type TreeNode } from '../data/skilltree'

export interface MemberProgress {
  level: number
  exp: number
  /** 節點 id → 已投入點數 */
  nodes: Record<string, number>
  /** 部位 → 背包中物品的 uid */
  equip: Partial<Record<Slot, string>>
}

export interface SkillMods {
  /** 四個技能的威力倍率 */
  power: number[]
  /** 四個技能的冷卻減少秒數 */
  cooldown: number[]
  /** 四個技能的範圍增加量 */
  radius: number[]
  buffAmount: number
  buffDuration: number
  heal: number
  vuln: number
}

export interface DerivedStats {
  maxHp: number
  maxMp: number
  atk: number
  def: number
  crit: number
  interval: number
  mods: SkillMods
}

/**
 * 劇情進度（依序推進）：
 *   第一章 talk → hunt → recruit → boss → done
 *   第二章 done（向村長報告）→ c2_scout（調查月光石碑）→ c2_hunt（淨化山谷）→ c2_crystal（星晶林）→ c2_boss（月泉）→ c2_done
 */
export const STORY_STEPS = ['talk', 'hunt', 'recruit', 'boss', 'done', 'c2_scout', 'c2_hunt', 'c2_crystal', 'c2_boss', 'c2_done'] as const
export type StoryStep = (typeof STORY_STEPS)[number]
export interface StoryState {
  step: StoryStep
  /** 教學任務已擊敗的史萊姆數 */
  huntKills: number
  /** 已開啟的寶箱 id */
  chests: string[]
  /** 第二章淨化山谷：已擊敗的幼狼與蘑菇數 */
  c2Wolf: number
  c2Shroom: number
}
export const HUNT_GOAL = 3
/** 第二章淨化山谷：幼狼與蘑菇各要打倒幾隻 */
export const C2_HUNT_GOAL = 4
const newStory = (): StoryState => ({ step: 'talk', huntKills: 0, chests: [], c2Wolf: 0, c2Shroom: 0 })
/** 劇情是否已經推進到（或超過）某一步 */
export const storyReached = (step: StoryStep) => STORY_STEPS.indexOf(progress.story.step) >= STORY_STEPS.indexOf(step)

export const BAG_LIMIT = 40
export const POTION_HEAL = 0.45

const newMember = (): MemberProgress => ({ level: 1, exp: 0, nodes: {}, equip: {} })

export const progress = {
  members: Object.fromEntries(CLASS_ORDER.map((c) => [c, newMember()])) as Record<ClassId, MemberProgress>,
  inventory: [] as Item[],
  gold: 0,
  potions: 3,
  kills: 0,
  /** 已招募的隊友職業（依加入順序）；主角不在其中 */
  recruited: [] as ClassId[],
  story: newStory(),
}

export function resetProgress() {
  for (const c of CLASS_ORDER) progress.members[c] = newMember()
  progress.inventory = []
  progress.gold = 0
  progress.potions = 3
  progress.kills = 0
  progress.recruited = []
  progress.story = newStory()
}

export const expToNext = (level: number) => Math.round(30 * Math.pow(level, 1.45) + 20)
export const itemByUid = (uid: string | undefined) => (uid ? progress.inventory.find((i) => i.uid === uid) : undefined)
export const equippedItem = (classId: ClassId, slot: Slot) => itemByUid(progress.members[classId].equip[slot])
/** 物品目前被誰裝備（沒有則回傳 undefined） */
export const equippedBy = (uid: string) => CLASS_ORDER.find((c) => SLOTS.some((s) => progress.members[c].equip[s] === uid))

export const spentPoints = (classId: ClassId) =>
  Object.values(progress.members[classId].nodes).reduce((a, b) => a + b, 0)
/** 每升一級得 1 點 */
export const pointsLeft = (classId: ClassId) => progress.members[classId].level - 1 - spentPoints(classId)

/** 節點能否再加點；不行時回傳原因 */
export function nodeBlock(classId: ClassId, node: TreeNode): string | null {
  const m = progress.members[classId]
  const rank = m.nodes[node.id] ?? 0
  if (rank >= node.maxRank) return '已達上限'
  if (m.level < node.reqLevel) return `需要 LV.${node.reqLevel}`
  if (node.row > 0) {
    const prev = TREES[classId].find((n) => n.branch === node.branch && n.row === node.row - 1)!
    if (!(m.nodes[prev.id] ?? 0)) return `需先學習「${prev.name}」`
  }
  if (pointsLeft(classId) <= 0) return '沒有技能點'
  return null
}

export function addRank(classId: ClassId, node: TreeNode) {
  if (nodeBlock(classId, node)) return false
  const m = progress.members[classId]
  m.nodes[node.id] = (m.nodes[node.id] ?? 0) + 1
  return true
}

/** 技能重置：退還所有點數 */
export function resetTree(classId: ClassId) {
  progress.members[classId].nodes = {}
}

export function canEquip(classId: ClassId, item: Item) {
  return item.slot !== 'weapon' || item.classId === classId
}

export function equip(classId: ClassId, item: Item) {
  if (!canEquip(classId, item)) return false
  // 同一件裝備只能給一個人穿：先從原本的人身上卸下
  const owner = equippedBy(item.uid)
  if (owner) delete progress.members[owner].equip[item.slot]
  progress.members[classId].equip[item.slot] = item.uid
  return true
}

export function unequip(classId: ClassId, slot: Slot) {
  delete progress.members[classId].equip[slot]
}

/** 加入背包；背包滿了回傳 false */
export function addItem(item: Item) {
  if (progress.inventory.length >= BAG_LIMIT) return false
  progress.inventory.push(item)
  return true
}

/** 丟棄未裝備的物品，換成少量金幣 */
export function sellItem(uid: string) {
  const i = progress.inventory.findIndex((it) => it.uid === uid)
  if (i < 0 || equippedBy(uid)) return 0
  const [item] = progress.inventory.splice(i, 1)
  const gold = Math.max(1, Math.round(itemScore(item) * 0.4))
  progress.gold += gold
  return gold
}

/** 給經驗值；回傳升了幾級 */
export function addExp(classId: ClassId, amount: number) {
  const m = progress.members[classId]
  if (m.level >= MAX_LEVEL) return 0
  m.exp += amount
  let ups = 0
  while (m.level < MAX_LEVEL && m.exp >= expToNext(m.level)) {
    m.exp -= expToNext(m.level)
    m.level++
    ups++
  }
  if (m.level >= MAX_LEVEL) m.exp = 0
  return ups
}

/** 由等級、技能樹、裝備算出實際戰鬥能力 */
export function computeStats(classId: ClassId): DerivedStats {
  const c = CLASSES[classId]
  const m = progress.members[classId]
  const k = m.level - 1
  const pct = { atk: 0, def: 0, hp: 0, mp: 0 }
  let crit = c.attack.crit
  let atkSpeed = 0
  const mods: SkillMods = {
    power: [1, 1, 1, 1],
    cooldown: [0, 0, 0, 0],
    radius: [0, 0, 0, 0],
    buffAmount: 0,
    buffDuration: 0,
    heal: 0,
    vuln: 0,
  }

  for (const node of TREES[classId]) {
    const rank = m.nodes[node.id] ?? 0
    if (!rank) continue
    const e = node.effect
    const v = e.perRank * rank
    switch (e.type) {
      case 'skillPower':
        mods.power[e.skill] += v
        break
      case 'skillCooldown':
        mods.cooldown[e.skill] += v
        break
      case 'zoneRadius':
        mods.radius[e.skill] += v
        break
      case 'buffAmount':
        mods.buffAmount += v
        break
      case 'buffDuration':
        mods.buffDuration += v
        break
      case 'vuln':
        mods.vuln += v
        break
      case 'stat':
        if (e.stat === 'crit') crit += v
        else if (e.stat === 'atkSpeed') atkSpeed += v
        else if (e.stat === 'heal') mods.heal += v
        else pct[e.stat] += v
    }
  }

  const flat = { atk: 0, def: 0, hp: 0, mp: 0 }
  for (const slot of SLOTS) {
    const s = equippedItem(classId, slot)?.stats
    if (!s) continue
    flat.atk += s.atk ?? 0
    flat.def += s.def ?? 0
    flat.hp += s.hp ?? 0
    flat.mp += s.mp ?? 0
    crit += s.crit ?? 0
  }

  return {
    maxHp: Math.round(c.base.hp * (1 + 0.08 * k) * (1 + pct.hp) + flat.hp),
    maxMp: Math.round(c.base.mp * (1 + 0.03 * k) * (1 + pct.mp) + flat.mp),
    atk: Math.round((c.base.atk * (1 + 0.07 * k) * (1 + pct.atk) + flat.atk) * 10) / 10,
    def: Math.round((c.base.def * (1 + 0.06 * k) * (1 + pct.def) + flat.def) * 10) / 10,
    crit: Math.min(0.75, crit),
    interval: c.attack.interval / (1 + atkSpeed),
    mods,
  }
}
