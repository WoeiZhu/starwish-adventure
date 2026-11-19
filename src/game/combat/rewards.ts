// 戰鬥獎勵：擊殺後的經驗與升級、掉落物、拾取、藥水。
import { slimeStats } from '../../data/enemies'
import { QUALITIES, makeItem, rollItem, type Item, type Quality, type Slot } from '../../data/items'
import { sfx } from '../../systems/sfx'
import { POTION_HEAL, addExp, addItem, pointsLeft, progress } from '../progress'
import { storyOnKill } from '../story'
import { burst, emit, flash, pillar, ring } from './fx'
import { addFeed, addFloater, applyStats, combat, dist, hero } from './state'
import type { Unit } from './types'

const PICKUP_RANGE = 1.2
const MAGNET_RANGE = 3.2
const DROP_LIFETIME = 90

function spawnDrop(e: Unit, kind: 'gold' | 'potion' | 'item', amount: number, item?: Item) {
  const a = Math.random() * Math.PI * 2
  const r = 0.5 + Math.random() * 0.9
  combat.drops.push({
    x: e.x + Math.cos(a) * r,
    z: e.z + Math.sin(a) * r,
    kind,
    amount,
    item,
    age: 0,
    color: kind === 'gold' ? '#ffd23c' : kind === 'potion' ? '#ff6b8a' : QUALITIES[item!.quality].color,
  })
}

/** 怪物被擊敗：全隊存活成員各自獲得經驗，並在地上留下掉落物 */
export function onEnemyKilled(e: Unit) {
  progress.kills++
  const stats = slimeStats(e.level)
  const mult = e.tier === 'boss' ? 12 : e.tier === 'elite' ? 4 : 1
  stats.exp *= mult
  stats.gold *= mult
  for (const u of combat.units) {
    if (u.team !== 'party' || !u.alive || !u.classId) continue
    addFloater(u, `+${stats.exp} EXP`, '#c9a6ff', false, 2.3)
    const ups = addExp(u.classId, stats.exp)
    if (!ups) continue
    // 升級：重算能力並補滿，獲得技能點
    applyStats(u, true)
    addFloater(u, 'LEVEL UP!', '#ffe27a', true, 2.6)
    pillar(u.x, u.z, '#ffe27a', 0.9, 5, 0.9)
    ring(u.x, u.z, '#ffe27a', 0.3, 2.6, 0.6)
    burst(u.x, 0.3, u.z, '#ffe27a', 26, 4, { up: 6, gravity: 5, life: 1 })
    addFeed(`${u.name} 升到 LV.${u.level}，技能點 +${ups}（可用 ${pointsLeft(u.classId)} 點）`, '#b8860b')
    sfx.levelUp()
  }

  spawnDrop(e, 'gold', Math.round(stats.gold * (0.8 + Math.random() * 0.6)))
  const classes = combat.units.filter((u) => u.team === 'party' && u.classId).map((u) => u.classId!)
  if (e.tier === 'normal') {
    if (Math.random() < 0.3) spawnDrop(e, 'potion', 1)
    if (Math.random() < 0.4) spawnDrop(e, 'item', 1, rollItem(e.level, classes))
  } else {
    // 精英保底稀有、Boss 保底史詩並有機會出傳說；每位隊員的武器各掉一把
    const boss = e.tier === 'boss'
    const slots: Slot[] = boss ? ['weapon', 'weapon', 'armor', 'accessory'] : ['weapon', 'armor']
    slots.forEach((slot, i) => {
      const q: Quality = boss ? (Math.random() < 0.35 ? 4 : 3) : Math.random() < 0.3 ? 3 : 2
      spawnDrop(e, 'item', 1, makeItem(slot, e.level + 1, q, classes[i % classes.length]))
    })
    for (let i = 0; i < (boss ? 3 : 2); i++) spawnDrop(e, 'potion', 1)
  }
  storyOnKill(e)
}

function collect(i: number) {
  const d = combat.drops[i]
  const h = hero()
  if (d.kind === 'gold') {
    progress.gold += d.amount
    addFloater(h, `+${d.amount} 金幣`, '#ffd23c', false, 2)
  } else if (d.kind === 'potion') {
    progress.potions += d.amount
    addFloater(h, '+1 藥水', '#ff8fa8', false, 2)
    addFeed('獲得 生命藥水')
  } else if (d.item) {
    if (!addItem(d.item)) {
      // 背包滿了：留在地上，稍後再提示
      if (d.age - (d.warned ?? -9) > 3) {
        d.warned = d.age
        addFeed('背包已滿，請先整理背包', '#e0525a')
      }
      return
    }
    addFloater(h, d.item.name, d.color, d.item.quality >= 2, 2.2)
    addFeed(`獲得 ${d.item.name}`, d.color)
  }
  burst(d.x, 0.4, d.z, d.color, 10, 2.5, { up: 4, gravity: 6 })
  flash(d.x, 0.5, d.z, d.color, 0.7)
  sfx.pickup(d.kind === 'item')
  combat.drops.splice(i, 1)
}

/** 掉落物更新：靠近會被吸過來並自動拾取，太久沒撿會消失 */
export function updateDrops(dt: number) {
  const h = hero()
  for (let i = combat.drops.length - 1; i >= 0; i--) {
    const d = combat.drops[i]
    d.age += dt
    if (d.age > DROP_LIFETIME) {
      combat.drops.splice(i, 1)
      continue
    }
    if (d.kind === 'item' && Math.random() < dt * 6) {
      emit(d.x + (Math.random() - 0.5) * 0.3, 0.3, d.z + (Math.random() - 0.5) * 0.3, d.color, { vy: 1.5, life: 0.8, size: 0.06 })
    }
    if (!h.alive || d.age < 0.5) continue
    const dd = dist(d, h)
    if (dd < MAGNET_RANGE && dd > 0.01) {
      const pull = Math.min(dd, (10 * dt * (MAGNET_RANGE - dd + 0.6)) / MAGNET_RANGE)
      d.x += ((h.x - d.x) / dd) * pull
      d.z += ((h.z - d.z) / dd) * pull
    }
    if (dist(d, h) < PICKUP_RANGE) collect(i)
  }
  combat.potionCd = Math.max(0, combat.potionCd - dt)
}

/** 喝藥水：回復主角 45% 最大 HP，冷卻 8 秒。回傳失敗原因或 null */
export function usePotion(): string | null {
  const h = hero()
  if (!h.alive) return '倒下時無法使用'
  if (progress.potions <= 0) return '沒有藥水了'
  if (combat.potionCd > 0) return null
  if (h.hp >= h.maxHp) return '生命已滿'
  progress.potions--
  combat.potionCd = 8
  const amount = Math.round(h.maxHp * POTION_HEAL)
  h.hp = Math.min(h.maxHp, h.hp + amount)
  addFloater(h, `+${amount}`, '#8dffb0', true)
  pillar(h.x, h.z, '#ff8fa8', 0.6, 3, 0.6)
  ring(h.x, h.z, '#8dffb0', 0.3, 1.4, 0.4)
  sfx.heal()
  return null
}
