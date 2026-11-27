// 戰鬥狀態單例：每幀變動，不進 Zustand。units[0] 永遠是主角。
import { CLASSES, HERO_CLASSES, MAX_ACTIVE, type ClassId } from '../../data/classes'
import { ENEMY, SPECIES, scaledEnemyLevel, slimeStats, type Species } from '../../data/enemies'
import { MONSTERS, SPAWN, type AreaBossDef, type MonsterDef } from '../../data/world'
import { computeStats, progress } from '../progress'
import { RUN_SPEED } from '../runtime'
import { clearFx } from './fx'
import { AI } from '../../world/config'
import type { Drop, EnemyTier, FeedLine, Floater, Hazard, Later, Projectile, Spore, Unit, UnitKind, Zone } from './types'

export const FLOATER_POOL = 28

export const combat = {
  units: [] as Unit[],
  projectiles: [] as Projectile[],
  zones: [] as Zone[],
  /** 藥師的毒孢子（倒數中的大蘑菇） */
  spores: [] as Spore[],
  /** 延後執行的技能段落 */
  later: [] as Later[],
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
    poisonTime: 0,
    poisonDmg: 0,
    poisonTick: 0,
    poisonBy: null,
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

/** 出戰中的隊友（招募名單扣掉休息中的），依加入順序 */
export const activeCompanions = () => progress.recruited.filter((c) => !progress.bench.includes(c))

/** 隊伍人數（含主角；只算出戰的） */
export const partySize = () => 1 + activeCompanions().length

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
  // 野豬與蝙蝠一接戰就先衝撞／俯衝，不用等 4 秒
  if (u.species === 'boar' || u.species === 'bat') u.special = 0.8
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

/**
 * 招募隊友：加入名單、等級跟主角一樣。出戰人數未滿就在主角身邊生成；滿了就先在名單上休息。
 * 回傳 true = 直接出戰
 */
export function recruitAlly(classId: ClassId) {
  if (progress.recruited.includes(classId)) return false
  const h = combat.units[0]
  const m = progress.members[classId]
  if (m.level < h.level) {
    m.level = h.level
    m.exp = 0
  }
  const fight = activeCompanions().length < MAX_ACTIVE
  progress.recruited.push(classId)
  if (!fight) {
    progress.bench.push(classId)
    return false
  }
  spawnAlly(classId)
  return true
}

/** 在主角身邊放上一位出戰的隊友 */
function spawnAlly(classId: ClassId) {
  const h = combat.units[0]
  const slot = FORMATION[(combat.units.filter((u) => u.kind === 'ally').length) % FORMATION.length]
  const u = partyUnit(allyId(classId), 'ally', CLASSES[classId].companion, classId, h.x + slot.x, h.z + slot.z)
  // 插在怪物之前，保持「隊伍在前、怪物在後」的順序
  const firstEnemy = combat.units.findIndex((x) => x.team === 'enemy')
  combat.units.splice(firstEnemy < 0 ? combat.units.length : firstEnemy, 0, u)
  rescaleIdleEnemies()
}

/** 隊伍人數變了：沒在戰鬥的野怪跟著調整強度 */
function rescaleIdleEnemies() {
  for (const e of combat.units) {
    if (e.team === 'enemy' && e.respawns && e.alive && !e.targetId) setEnemyLevel(e, e.level)
  }
}

/**
 * 出戰名單：active 是要出戰的隊友（最多 MAX_ACTIVE 位，必須在招募名單裡）。
 * 休息的隊友從戰場上移除；新出戰的在主角身邊出現。戰鬥中不能換。回傳錯誤訊息或 null。
 */
export function setActiveCompanions(active: ClassId[]): string | null {
  if (combat.inCombat) return '戰鬥中不能換人'
  const want = progress.recruited.filter((c) => active.includes(c))
  if (want.length > MAX_ACTIVE) return `最多 ${MAX_ACTIVE} 位隊友出戰`
  progress.bench = progress.recruited.filter((c) => !want.includes(c))
  combat.units = combat.units.filter((u) => u.kind !== 'ally' || (u.classId && want.includes(u.classId)))
  for (const c of want) if (!combat.units.some((u) => u.classId === c && u.kind === 'ally')) spawnAlly(c)
  // 依出戰順序重排（隊形位置跟著順序）
  const allies = want.map((c) => combat.units.find((u) => u.classId === c && u.kind === 'ally')!).filter(Boolean)
  combat.units = [combat.units[0], ...allies, ...combat.units.filter((u) => u.team === 'enemy')]
  rescaleIdleEnemies()
  return null
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

/** 主角未選的三個職業：依序對應草原、森林、石環三個招募事件（第二章的暗殺者、藥師不在其中） */
export const companionClasses = (heroClass: ClassId) => HERO_CLASSES.filter((c) => c !== heroClass)
export const allyId = (classId: ClassId) => `ally-${classId}`

// ── 切換地圖：野外的怪物與掉落物先收起來，回到野外再放回去 ──
// 城鎮裡沒有怪物。收起來的期間，死亡的怪物照樣累積重生時間（回來時一次補上），重生規則不變。
let stash: { units: Unit[]; drops: Drop[]; time: number } | null = null

/** 進城：收起所有怪物、掉落物，清掉投射物、範圍效果與隊伍的目標 */
export function stashWorld() {
  if (stash) return
  stash = { units: combat.units.filter((u) => u.team === 'enemy'), drops: combat.drops, time: combat.time }
  combat.units = combat.units.filter((u) => u.team !== 'enemy')
  clearBattlefield()
}

/** 回到野外：把收起來的怪物放回去，追擊中的怪物放棄目標、走回出生點 */
export function restoreWorld() {
  if (!stash) return
  const elapsed = Math.max(0, combat.time - stash.time)
  for (const u of stash.units) {
    u.targetId = null
    u.tauntTime = 0
    u.ai.path = null
    u.ai.returning = true
    if (!u.alive) u.deadTime += elapsed
  }
  combat.units.push(...stash.units)
  combat.drops = stash.drops
  stash = null
  clearBattlefield()
  updateEnemySlots()
}

/** 收起來（不在目前地圖上）的怪物 */
export const stashedUnits = (): readonly Unit[] => stash?.units ?? []

function clearBattlefield() {
  combat.projectiles = []
  combat.zones = []
  combat.spores = []
  combat.later = []
  combat.hazards = []
  if (stash) combat.drops = []
  slotUnits.fill(undefined)
  for (const u of combat.units) {
    u.targetId = null
    u.ai.path = null
    u.tauntBy = null
    u.tauntTime = 0
  }
  combat.inCombat = false
  clearFx()
}

/** 把主角與隊友放到新位置（隊友排在主角身後） */
export function placeParty(at: { x: number; z: number }, facing: number) {
  let i = 0
  for (const u of combat.units) {
    if (u.team !== 'party') continue
    if (u.kind === 'hero') {
      u.x = at.x
      u.z = at.z
    } else {
      const f = FORMATION[i++ % FORMATION.length]
      // 隊形是主角本地座標（x 右、z 後），依面向轉到世界座標
      const s = Math.sin(facing)
      const c = Math.cos(facing)
      u.x = at.x + f.x * c - f.z * s
      u.z = at.z - f.x * s - f.z * c
    }
    u.facing = facing
    u.homeX = u.x
    u.homeZ = u.z
  }
}

export function initCombat(heroName: string, heroClass: ClassId, at = SPAWN) {
  stash = null
  const heroLevel = progress.members[heroClass].level
  combat.units = [
    partyUnit('hero', 'hero', heroName, heroClass, at.x, at.z),
    ...activeCompanions()
      .filter((c) => c !== heroClass)
      .map((c, i) => partyUnit(allyId(c), 'ally', CLASSES[c].companion, c, at.x + FORMATION[i % 3].x, at.z - FORMATION[i % 3].z)),
    ...MONSTERS.map((m) => monsterUnit(m, heroLevel)),
  ]
  slotUnits.fill(undefined)
  combat.projectiles = []
  combat.zones = []
  combat.spores = []
  combat.later = []
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
  // 同一個位置剛冒出的飄字：往上錯開，不要疊在一起
  let stack = 0
  for (const o of combat.floaters) if (o !== f && o.life > 0.45 && Math.abs(o.x - f.x) < 1.6 && Math.abs(o.z - u.z) < 1.6 && Math.abs(o.y - y) < 0.9) stack++
  f.y = y + Math.min(stack, 4) * 0.36
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
