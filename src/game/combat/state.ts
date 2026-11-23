// 戰鬥狀態單例：每幀變動，不進 Zustand。units[0] 永遠是主角。
import { CLASSES, CLASS_ORDER, type ClassId } from '../../data/classes'
import { ENEMY, SPECIES, scaledEnemyLevel, slimeStats, type Species } from '../../data/enemies'
import { MONSTERS, SPAWN, type AreaBossDef, type MonsterDef } from '../../data/world'
import { computeStats, progress } from '../progress'
import { RUN_SPEED } from '../runtime'
import { clearFx } from './fx'
import { AI } from '../../world/config'
import type { Drop, EnemyTier, FeedLine, Floater, Hazard, Projectile, Unit, UnitKind, Zone } from './types'

export const FLOATER_POOL = 28

export const combat = {
  units: [] as Unit[],
  projectiles: [] as Projectile[],
  zones: [] as Zone[],
  /** 怪物的範圍重擊警示 */
  hazards: [] as Hazard[],
  /** 地上的掉落物（金幣、藥水、裝備） */
  drops: [] as Drop[],
  /** 畫面左下的訊息列（獲得物品、升級） */
  feed: [] as FeedLine[],
  floaters: Array.from(
    { length: FLOATER_POOL },
    (): Floater => ({ seq: 0, x: 0, y: 0, z: 0, text: '', color: '#fff', life: 0, big: false }),
  ),
  floaterSeq: 0,
  time: 0,
  inCombat: false,
  /** 距離上次戰鬥結束的秒數（用於回血與隊友復活） */
  calm: 99,
  heroDown: 0,
  /** 頓幀：大於 0 時戰鬥時間暫時變慢，強調命中瞬間 */
  hitStop: 0,
  potionCd: 0,
}

/** 隊友跟隨主角時的隊形位置（主角本地座標：x 右、z 後） */
export const FORMATION = [
  { x: -1.3, z: 1.4 },
  { x: 1.3, z: 1.4 },
  { x: 0, z: 2.6 },
]

function baseUnit(id: string, kind: UnitKind, name: string, x: number, z: number): Unit {
  return {
    id,
    team: kind === 'slime' ? 'enemy' : 'party',
    kind,
    name,
    color: '#ffffff',
    level: 1,
    baseLevel: 1,
    tier: 'normal',
    tag: null,
    respawns: true,
    species: 'slime',
    respawnTime: ENEMY.respawn,
    area: null,
    scale: 1,
    special: 4,
    special2: 8,
    enraged: false,
    actionClip: '',
    actionSeq: 0,
    dashT: 0,
    dashX: x,
    dashZ: z,
    dashPower: 0,
    castT: 0,
    castKind: '',
    x,
    z,
    facing: 0,
    radius: 0.32,
    homeX: x,
    homeZ: z,
    hp: 1,
    maxHp: 1,
    mp: 0,
    maxMp: 0,
    atk: 1,
    def: 0,
    range: 1,
    interval: 1,
    moveSpeed: RUN_SPEED,
    ranged: false,
    crit: 0,
    mods: null,
    alive: true,
    deadTime: 0,
    targetId: null,
    atkTimer: 0,
    cooldowns: [0, 0, 0, 0],
    gcd: 0,
    buffs: [],
    stun: 0,
    slow: 0,
    invuln: 0,
    vuln: 0,
    vulnTime: 0,
    tauntBy: null,
    tauntTime: 0,
    speed: 0,
    moved: 0,
    attackAnim: 0,
    hitFlash: 0,
    squash: 0,
    ai: { path: null, repath: 0, blocked: 0, wander: Math.random() * 3, wx: x, wz: z, returning: false },
  }
}

export function expireBuff(u: Unit, i: number) {
  const b = u.buffs[i]
  if (b.stat === 'maxHp') {
    u.maxHp -= b.value
    u.hp = Math.min(u.hp, u.maxHp) // 結束後現有 HP 不可超過最大值
  }
  u.buffs.splice(i, 1)
}
export function removeBuffs(u: Unit) {
  for (let i = u.buffs.length - 1; i >= 0; i--) expireBuff(u, i)
}

/** 依等級、技能樹、裝備重算隊員能力（升級、換裝、配點後呼叫）；full = 順便補滿 */
export function applyStats(u: Unit, full = false) {
  if (!u.classId) return
  removeBuffs(u) // 增益會改最大 HP，重算前先清掉
  const s = computeStats(u.classId)
  const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1
  u.level = progress.members[u.classId].level
  u.maxHp = s.maxHp
  u.maxMp = s.maxMp
  u.atk = s.atk
  u.def = s.def
  u.crit = s.crit
  u.interval = s.interval
  u.mods = s.mods
  u.hp = full ? s.maxHp : Math.max(1, Math.round(s.maxHp * ratio))
  u.mp = full ? s.maxMp : Math.min(u.mp, s.maxMp)
}

/** 換裝或配點後，重算所有隊員 */
export function refreshParty() {
  for (const u of combat.units) if (u.team === 'party' && u.alive) applyStats(u)
}

function partyUnit(id: string, kind: UnitKind, name: string, classId: ClassId, x: number, z: number): Unit {
  const c = CLASSES[classId]
  const u: Unit = {
    ...baseUnit(id, kind, name, x, z),
    classId,
    color: c.colors.primary,
    range: c.attack.range,
    ranged: c.attack.ranged,
  }
  applyStats(u, true)
  return u
}

/** 隊伍人數（含主角） */
export const partySize = () => 1 + progress.recruited.length

/** 隊伍越少人，怪物越弱：讓單人開局也打得贏 */
const PARTY_SCALE = [
  { hp: 0.3, atk: 0.5 },
  { hp: 0.55, atk: 0.75 },
  { hp: 0.8, atk: 0.9 },
  { hp: 1, atk: 1 },
]
const TIER: Record<EnemyTier, { hp: number; atk: number; scale: number; radius: number }> = {
  normal: { hp: 1, atk: 1, scale: 1, radius: 0.45 },
  elite: { hp: 2.2, atk: 1.1, scale: 1.7, radius: 0.75 },
  boss: { hp: 6, atk: 1.25, scale: 2.8, radius: 1.25 },
}

/** 把怪物設成指定等級的能力值並補滿（依階級與隊伍人數調整） */
export function setEnemyLevel(u: Unit, level: number) {
  const s = slimeStats(level)
  const p = PARTY_SCALE[Math.min(3, partySize() - 1)]
  const t = TIER[u.tier]
  const sp = SPECIES[u.species]
  // 新手期：1～4 級的怪物再弱一些，5 級起恢復正常
  const early = level >= 5 ? 1 : 0.75 + (level - 1) * 0.0625
  u.level = level
  u.maxHp = u.hp = Math.round(s.hp * p.hp * t.hp * sp.hp * early)
  u.atk = Math.round(s.atk * p.atk * t.atk * sp.atk * early)
  u.def = s.def
  u.interval = s.interval * sp.interval
  u.moveSpeed = s.moveSpeed * sp.speed
  u.scale = t.scale * (1 + (u.baseLevel - 1) * 0.12)
  u.radius = t.radius
  u.range = sp.range ?? 0.45
  u.ranged = !!sp.range
  u.enraged = false
  u.castT = 0
  u.castKind = ''
  u.dashT = 0
  u.dashPower = 0
}

/** 事件生成的怪物（招募戰、精英、Boss、Boss 召喚）：不重生，生成時立刻鎖定主角 */
export function spawnEnemy(o: {
  name: string
  color: string
  x: number
  z: number
  level: number
  tier?: EnemyTier
  tag: string
  species?: Species
}) {
  const u: Unit = {
    ...baseUnit(`e${++enemySeq}`, 'slime', o.name, o.x, o.z),
    color: o.color,
    range: 0.45,
    tier: o.tier ?? 'normal',
    species: o.species ?? 'slime',
    tag: o.tag,
    respawns: false,
    targetId: 'hero',
  }
  setEnemyLevel(u, Math.max(1, o.level))
  combat.units.push(u)
  return u
}
let enemySeq = 0

/** 招募隊友：加入名單、在主角身邊生成、等級跟主角一樣 */
export function recruitAlly(classId: ClassId) {
  if (progress.recruited.includes(classId)) return
  const h = combat.units[0]
  const m = progress.members[classId]
  if (m.level < h.level) {
    m.level = h.level
    m.exp = 0
  }
  const slot = FORMATION[progress.recruited.length % FORMATION.length]
  progress.recruited.push(classId)
  const u = partyUnit(allyId(classId), 'ally', CLASSES[classId].companion, classId, h.x + slot.x, h.z + slot.z)
  // 插在怪物之前，保持「隊伍在前、怪物在後」的順序
  const firstEnemy = combat.units.findIndex((x) => x.team === 'enemy')
  combat.units.splice(firstEnemy < 0 ? combat.units.length : firstEnemy, 0, u)
  // 隊伍變強了：沒在戰鬥的野怪跟著調整
  for (const e of combat.units) {
    if (e.team === 'enemy' && e.respawns && e.alive && !e.targetId) setEnemyLevel(e, e.level)
  }
}

function monsterUnit(def: MonsterDef, heroLevel: number): Unit {
  const u: Unit = {
    ...baseUnit(def.id, 'slime', def.name, def.x, def.z),
    color: def.color,
    baseLevel: def.level,
    species: def.species,
    tier: def.tier,
    // 精英營地的怪物重生比較慢
    respawnTime: def.tier === 'elite' ? ENEMY.respawn * 3 : ENEMY.respawn,
    range: 0.45,
  }
  setEnemyLevel(u, scaledEnemyLevel(def.level, heroLevel))
  return u
}

/**
 * 建立區域首領。一開始是「沉睡中」：還要等 firstDelay 秒才會現身，
 * 之後每次被擊敗都會在 respawn 秒後在原地重生（由 sim.ts 的 enemyAI 處理）。
 */
export function spawnAreaBoss(def: AreaBossDef, heroLevel: number) {
  const u: Unit = {
    ...baseUnit(`ab-${def.id}`, 'slime', def.name, def.x, def.z),
    color: def.color,
    range: 0.45,
    tier: def.tier,
    species: def.species,
    tag: def.id,
    area: def.id,
    respawnTime: def.respawn,
  }
  setEnemyLevel(u, heroLevel + def.levelBonus)
  u.alive = false
  u.hp = 0
  u.deadTime = def.respawn - def.firstDelay
  combat.units.push(u)
}

/** 主角未選的三個職業：依序對應草原、森林、石環三個招募事件 */
export const companionClasses = (heroClass: ClassId) => CLASS_ORDER.filter((c) => c !== heroClass)
export const allyId = (classId: ClassId) => `ally-${classId}`

export function initCombat(heroName: string, heroClass: ClassId, at = SPAWN) {
  const heroLevel = progress.members[heroClass].level
  combat.units = [
    partyUnit('hero', 'hero', heroName, heroClass, at.x, at.z),
    ...progress.recruited.filter((c) => c !== heroClass).map((c, i) =>
      partyUnit(allyId(c), 'ally', CLASSES[c].companion, c, at.x + FORMATION[i % 3].x, at.z - FORMATION[i % 3].z),
    ),
    ...MONSTERS.map((m) => monsterUnit(m, heroLevel)),
  ]
  slotUnits.fill(undefined)
  combat.projectiles = []
  combat.zones = []
  combat.hazards = []
  combat.drops = []
  combat.feed = []
  for (const f of combat.floaters) f.life = 0
  combat.time = 0
  combat.inCombat = false
  combat.calm = 99
  combat.heroDown = 0
  combat.hitStop = 0
  combat.potionCd = 0
  clearFx()
  updateEnemySlots()
}

export function addFloater(u: { x: number; z: number }, text: string, color: string, big = false, y = 1.7) {
  const f = combat.floaters[combat.floaterSeq % FLOATER_POOL]
  f.seq = ++combat.floaterSeq
  f.x = u.x + (Math.random() - 0.5) * 0.5
  f.y = y
  f.z = u.z
  f.text = text
  f.color = color
  f.life = 1
  f.big = big
}

export function addFeed(text: string, color = '#4a3b52') {
  combat.feed.push({ text, color, time: combat.time })
  if (combat.feed.length > 6) combat.feed.shift()
}

// ── 怪物顯示槽位 ─────────────────────────────────────
// 地圖上有幾十隻怪物，但畫面只需要顯示附近的：固定數量的槽位，每個槽位分配給一隻附近的怪物。
// 怪物離開範圍就釋放槽位；槽位全滿時，較近的怪物會擠掉最遠的那隻。
export const ENEMY_SLOTS = 28
const SLOT_RANGE = AI.displayRadius
const slotUnits: (Unit | undefined)[] = new Array(ENEMY_SLOTS).fill(undefined)

/** 第 slot 個顯示槽位目前對應的怪物 */
export const enemyAt = (slot: number) => slotUnits[slot]

export function updateEnemySlots() {
  const h = combat.units[0]
  if (!h) return
  const near = new Set<Unit>()
  for (const u of combat.units) if (u.team === 'enemy' && dist(u, h) < SLOT_RANGE) near.add(u)
  // 釋放：已被移除或離太遠的
  for (let i = 0; i < ENEMY_SLOTS; i++) {
    const u = slotUnits[i]
    if (u && !near.has(u)) slotUnits[i] = undefined
  }
  const held = new Set(slotUnits)
  const need = [...near].filter((u) => !held.has(u)).sort((a, b) => dist(a, h) - dist(b, h))
  for (const u of need) {
    let at = slotUnits.indexOf(undefined)
    if (at < 0) {
      // 槽位全滿：比較遠的讓位（多留 3 的緩衝，避免兩隻來回互換）
      let far = dist(u, h) + 3
      for (let i = 0; i < ENEMY_SLOTS; i++) {
        const d = dist(slotUnits[i]!, h)
        if (d > far) {
          far = d
          at = i
        }
      }
      if (at < 0) break
    }
    slotUnits[at] = u
  }
}

export const hero = () => combat.units[0]
export const unitById = (id: string | null) => (id ? combat.units.find((u) => u.id === id) : undefined)
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
