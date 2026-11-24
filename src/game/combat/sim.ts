// 戰鬥模擬：每幀更新計時器、怪物 AI、隊友 AI、主角自動普攻、投射物與範圍效果。
import { CLASSES } from '../../data/classes'
import { ENEMY, SPECIES, aggroRange, scaledEnemyLevel } from '../../data/enemies'
import { AREA_BOSSES, SPAWN, inSafeZone } from '../../data/world'
import { resolveCollisions } from '../../systems/collision'
import { findPath } from '../../systems/pathfinding'
import { inTown } from '../../world/maps'
import { RUN_SPEED, WALK_SPEED, runtime } from '../runtime'
import { useGame } from '../store'
import { moveAxis } from '../../systems/input'
import { sfx } from '../../systems/sfx'
import { AI } from '../../world/config'
import { BUFF_COLOR, basicAttack, castSkill, damage, enemyShot, faceTarget, hasBuff, heal } from './actions'
import { burst, emit, flash, pillar, ring, shake, updateFx } from './fx'
import { updateDrops } from './rewards'
import { playImpact, updateSkillRuns } from './skillRunner'
import { areaBossUnlocked } from '../story'
import {
  FORMATION,
  addFeed,
  addFloater,
  combat,
  dist,
  expireBuff,
  hero,
  setEnemyLevel,
  spawnAreaBoss,
  spawnEnemy,
  unitById,
  updateEnemySlots,
} from './state'
import type { Unit, Zone } from './types'

/** 離主角太遠的事件不出聲 */
const audible = (p: { x: number; z: number }) => Math.hypot(p.x - runtime.player.x, p.z - runtime.player.z) < 24

function dampAngle(a: number, b: number, k: number, dt: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-k * dt))
}

/** 直線朝目標移動並處理碰撞；回傳剩餘距離 */
function moveToward(u: Unit, tx: number, tz: number, speed: number, dt: number) {
  const dx = tx - u.x
  const dz = tz - u.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-3) return 0
  const step = Math.min(d, speed * dt)
  const ox = u.x
  const oz = u.z
  u.x += (dx / d) * step
  u.z += (dz / d) * step
  resolveCollisions(u, u.radius)
  u.facing = dampAngle(u.facing, Math.atan2(dx, dz), 12, dt)
  u.moved = Math.hypot(u.x - ox, u.z - oz) / dt
  return d - step
}

/** 隊友移動：平常直走，被擋住或距離遠時改用 A* 路徑 */
function navTo(u: Unit, tx: number, tz: number, speed: number, dt: number) {
  const ai = u.ai
  ai.repath -= dt
  const d = Math.hypot(tx - u.x, tz - u.z)
  if ((d > 9 || ai.blocked > 0.35) && ai.repath <= 0) {
    ai.path = findPath(u, { x: tx, z: tz })
    ai.repath = 0.8
    ai.blocked = 0
  }
  if (ai.path) {
    while (ai.path.length && Math.hypot(ai.path[0].x - u.x, ai.path[0].z - u.z) < 0.3) ai.path.shift()
    if (!ai.path.length) ai.path = null
  }
  const wp = ai.path ? ai.path[0] : { x: tx, z: tz }
  moveToward(u, wp.x, wp.z, speed, dt)
  ai.blocked = u.moved < speed * 0.3 ? ai.blocked + dt : 0
}

function nearest(list: Unit[], from: Unit, maxDist = Infinity) {
  let best: Unit | undefined
  let bestD = maxDist
  for (const u of list) {
    const d = dist(u, from)
    if (d < bestD) {
      bestD = d
      best = u
    }
  }
  return best
}

function tickTimers(u: Unit, dt: number) {
  for (let i = 0; i < 4; i++) u.cooldowns[i] = Math.max(0, u.cooldowns[i] - dt)
  u.atkTimer = Math.max(0, u.atkTimer - dt)
  u.gcd = Math.max(0, u.gcd - dt)
  u.stun = Math.max(0, u.stun - dt)
  u.slow = Math.max(0, u.slow - dt)
  u.invuln = Math.max(0, u.invuln - dt)
  u.vulnTime = Math.max(0, u.vulnTime - dt)
  u.tauntTime = Math.max(0, u.tauntTime - dt)
  u.attackAnim = Math.max(0, u.attackAnim - dt / 0.4)
  u.hitFlash = Math.max(0, u.hitFlash - dt)
  u.squash = Math.max(0, u.squash - dt / 0.25)
  for (let i = u.buffs.length - 1; i >= 0; i--) {
    u.buffs[i].time -= dt
    if (u.buffs[i].time <= 0) expireBuff(u, i)
  }
}

/** 怪物重生：一般怪依主角等級調整，區域首領固定比主角高一級，並廣播出現的訊息 */
function reviveEnemy(e: Unit) {
  const def = e.area ? AREA_BOSSES.find((d) => d.id === e.area) : undefined
  e.alive = true
  setEnemyLevel(e, def ? hero().level + def.levelBonus : scaledEnemyLevel(e.baseLevel, hero().level))
  e.x = e.homeX
  e.z = e.homeZ
  e.ai.returning = false
  e.targetId = null
  e.atkTimer = 0
  e.special = 4
  e.special2 = 8
  if (def) {
    addFeed(`${e.name}在${def.place}再度現身了！`, '#a96bf0')
    pillar(e.x, e.z, def.color, 1.2, 7, 1)
    ring(e.x, e.z, def.color, 0.5, 5, 0.8)
    if (dist(e, hero()) < 30) sfx.taunt()
  }
}

/** 每秒檢查一次：解鎖條件達成的區域首領還沒建立就建立（以沉睡狀態開始倒數） */
function syncAreaBosses() {
  // 在城裡時野外的怪物收起來了，不能因為「找不到」就再建一隻
  if (inTown()) return
  for (const d of AREA_BOSSES) {
    if (combat.units.some((u) => u.area === d.id)) continue
    if (areaBossUnlocked(d.id)) spawnAreaBoss(d, hero().level)
  }
}
let bossSync = 0

// ── 怪物 AI：待機遊走 → 發現隊伍追擊 → 近身攻擊 → 離家太遠就回去 ──
function enemyAI(e: Unit, party: Unit[], dt: number) {
  if (!e.alive) {
    e.deadTime += dt
    if (e.respawns && e.deadTime > e.respawnTime) reviveEnemy(e)
    return
  }
  if (e.stun > 0) {
    // 暈眩可以打斷治癒之光
    if (e.castKind === 'heal') {
      e.castT = 0
      e.castKind = ''
      addFloater(e, '打斷！', '#ffe27a', true, 3.2)
    }
    return
  }

  // 撲擊 / 衝撞中：直線衝向終點，落地時咬一口
  if (e.dashT > 0) {
    const left = Math.hypot(e.dashX - e.x, e.dashZ - e.z)
    moveToward(e, e.dashX, e.dashZ, left / Math.max(dt, e.dashT), dt)
    e.dashT -= dt
    if (e.dashT <= 0 && e.dashPower > 0) {
      const t = unitById(e.targetId)
      if (t?.alive && dist(e, t) - t.radius - e.radius < 1) damage(e, t, e.dashPower, true)
      burst(e.x, 0.2, e.z, '#e8f0ff', 10, 3, { up: 2, size: 0.08, life: 0.4 })
      e.dashPower = 0
    }
    return
  }
  // 原地動作中（蓄力、詠唱）：站著面向目標，時間到才生效
  if (e.castT > 0) {
    e.castT -= dt
    const t = unitById(e.targetId)
    if (t) e.facing = dampAngle(e.facing, Math.atan2(t.x - e.x, t.z - e.z), 6, dt)
    if (e.castT <= 0) {
      if (e.castKind === 'heal') finishHeal(e)
      e.castKind = ''
    }
    return
  }

  const homeD = Math.hypot(e.x - e.homeX, e.z - e.homeZ)
  let t = unitById(e.targetId)
  if (e.tauntTime > 0) {
    const taunter = unitById(e.tauntBy)
    if (taunter?.alive) t = taunter
  }
  // 野怪不會追進安全區：目標躲進村子就放棄；事件怪物（不重生）不受影響
  if (t && e.respawns && inSafeZone(t.x, t.z)) {
    t = undefined
    e.ai.returning = homeD > 2.6
  }
  // 事件怪物（不重生）不會放棄追擊
  if (t && (!t.alive || (e.respawns && (homeD > ENEMY.leash || dist(e, t) > 16)))) {
    t = undefined
    e.ai.returning = homeD > 2.6
  }
  if (e.ai.returning && homeD < 1) e.ai.returning = false
  if (!t && !e.ai.returning) {
    const prey = e.respawns ? party.filter((p) => !inSafeZone(p.x, p.z)) : party
    t = nearest(prey, e, e.respawns ? aggroRange(e.tier) : 30)
  }
  e.targetId = t ? t.id : null

  if (!t) {
    if (e.ai.returning) {
      moveToward(e, e.homeX, e.homeZ, e.moveSpeed * 1.4, dt)
    } else {
      e.ai.wander -= dt
      if (e.ai.wander <= 0) {
        e.ai.wander = 3 + Math.random() * 4
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 2.2
        e.ai.wx = e.homeX + Math.cos(a) * r
        e.ai.wz = e.homeZ + Math.sin(a) * r
      }
      if (Math.hypot(e.ai.wx - e.x, e.ai.wz - e.z) > 0.2) moveToward(e, e.ai.wx, e.ai.wz, 0.9, dt)
    }
    // 野怪脫戰回血；事件怪物不回血，主角倒下重來時已打掉的血量會保留
    if (e.respawns) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt)
      // 首領回滿血後解除狂暴，下次交戰重新計算
      if (e.enraged && e.hp >= e.maxHp * 0.98) setEnemyLevel(e, e.level)
    }
    return
  }

  const gap = dist(e, t) - t.radius - e.radius
  const speed = e.moveSpeed * (e.slow > 0 ? 0.5 : 1)
  if (e.ranged) {
    // 遠程（星晶魔靈）：保持射程；被貼身就往後飄，拉開距離再射
    const d = dist(e, t) || 1
    if (gap > e.range * 0.9) moveToward(e, t.x, t.z, speed, dt)
    else if (gap < 2) moveToward(e, e.x + ((e.x - t.x) / d) * 2, e.z + ((e.z - t.z) / d) * 2, speed * 0.8, dt)
    else e.facing = dampAngle(e.facing, Math.atan2(t.x - e.x, t.z - e.z), 10, dt)
  } else if (gap > 0.25) moveToward(e, t.x, t.z, speed, dt)
  else e.facing = dampAngle(e.facing, Math.atan2(t.x - e.x, t.z - e.z), 10, dt)
  enemySpecial(e, t, dt)
  if (e.castT > 0 || e.dashT > 0) return
  if (gap <= e.range && e.atkTimer <= 0) {
    if (e.ranged) {
      // 移動中不射擊（跟隊伍同樣的規則）
      if (e.moved < 0.3) enemyShot(e, t, 1, e.tier === 'normal' ? '#9fd8ff' : '#c9b6ff', 0.3, e.tier !== 'normal')
    } else {
      e.atkTimer = e.interval
      e.attackAnim = 1
      damage(e, t, 1)
    }
  }
}

/** 讓畫面播放一次特技動作片段 */
function action(e: Unit, clip: string) {
  e.actionClip = clip
  e.actionSeq++
}

/** Boss 半血狂暴：攻速、移速提高，並召喚兩隻手下 */
function enrage(e: Unit) {
  e.enraged = true
  e.interval *= 0.7
  e.moveSpeed += 0.8
  e.special = 1.5
  addFloater(e, '狂暴！', '#ff5a5a', true, 3.4)
  addFeed(`${e.name}進入狂暴狀態，並召喚了手下！`, '#e0525a')
  ring(e.x, e.z, '#ff5a5a', 0.5, 7, 0.7)
  burst(e.x, 1, e.z, '#ff5a5a', 40, 7, { up: 6, gravity: 8, size: 0.15, life: 0.9 })
  shake(0.5)
  sfx.ultimate()
  const s = SPECIES[e.species].summon
  if (!s) return
  for (const side of [-1, 1]) {
    spawnEnemy({ name: s.name, color: s.color, species: s.species, x: e.x + side * 3, z: e.z + 1.5, level: e.level - 1, tag: e.tag ?? 'boss' })
  }
}

/** 月影幼狼：隔一段距離時撲向目標，落地咬一口 */
function wolfPounce(e: Unit, t: Unit) {
  const gap = dist(e, t) - t.radius - e.radius
  if (e.special > 0 || gap < 1.6 || gap > 6) return
  e.special = 6 + Math.random() * 2.5
  const d = dist(e, t) || 1
  const stop = t.radius + e.radius + 0.1
  e.dashX = t.x - ((t.x - e.x) / d) * stop
  e.dashZ = t.z - ((t.z - e.z) / d) * stop
  e.dashT = 0.42
  e.dashPower = e.tier === 'normal' ? 1.3 : 1.6
  e.atkTimer = Math.max(e.atkTimer, 0.8)
  action(e, 'Pounce')
  addFloater(e, '撲擊！', '#c9d8ff', false, 1.4)
}

/** 孢子蘑菇：目標靠近時在自己周圍噴出毒霧（綠圈，會留在地上一陣子） */
function mushroomSpore(e: Unit, t: Unit) {
  if (e.special > 0 || dist(e, t) - t.radius > 3) return
  e.special = 7 + Math.random() * 2
  const delay = 0.9
  combat.hazards.push({ owner: e, x: e.x, z: e.z, radius: e.tier === 'normal' ? 2.4 : 3.4, delay, total: delay, power: 0.35, linger: 3.5, tick: 0.7, tickTimer: 0, color: '#8fdc5a' })
  e.castT = delay
  e.castKind = 'hold'
  action(e, 'Spore')
  addFloater(e, '孢子毒霧！', '#a8e87a', false, 1.5)
}

/** 精英星晶魔靈：在目標周圍落下三道星晶（紅圈） */
function crystalBarrage(e: Unit, t: Unit) {
  if (e.special > 0 || dist(e, t) > 11) return
  e.special = e.area ? 6 : 7.5
  const delay = 1.3
  const d = dist(e, t) || 1
  const px = -(t.z - e.z) / d
  const pz = (t.x - e.x) / d
  for (const k of [-2.3, 0, 2.3]) {
    combat.hazards.push({ owner: e, x: t.x + px * k, z: t.z + pz * k, radius: 1.8, delay: delay + Math.abs(k) * 0.08, total: delay, power: 1.25 })
  }
  e.castT = 0.9
  e.castKind = 'hold'
  e.atkTimer = Math.max(e.atkTimer, delay)
  action(e, 'Shoot')
  addFloater(e, '星晶彈幕！', '#bfe9ff', true, 2.6)
  sfx.taunt()
}

/** 苔蘚靈鹿：蓄力後衝撞目標所在位置；血量偏低時詠唱治癒之光，治療自己與身邊的手下 */
function stagSkills(e: Unit, t: Unit) {
  if (e.special2 <= 0 && e.hp < e.maxHp * 0.7) {
    e.special2 = e.enraged ? 12 : 15
    e.castT = 1.6
    e.castKind = 'heal'
    action(e, 'Heal')
    addFloater(e, '治癒之光…', '#8dffb0', true, 3.6)
    pillar(e.x, e.z, '#8dffb0', 1.4, 5, 1.6)
    ring(e.x, e.z, '#8dffb0', 0.5, 8, 1.6)
    addFeed(`${e.name}開始詠唱治癒之光！快打斷牠（暈眩技能有效）`, '#2f9e52')
    return
  }
  if (e.special > 0 || dist(e, t) > 12) return
  e.special = e.enraged ? 5 : 7
  const delay = 1.25
  combat.hazards.push({ owner: e, x: t.x, z: t.z, radius: 2.5, delay, total: delay, power: 1.7, dash: true })
  e.castT = delay - 0.3
  e.castKind = 'hold'
  e.atkTimer = Math.max(e.atkTimer, delay + 0.3)
  addFloater(e, '蓄力衝撞！', '#ff8f8f', true, 3.6)
  sfx.taunt()
}

/** 治癒之光生效：靈鹿回復 8%，8 公尺內的其他怪物回復 20% */
function finishHeal(e: Unit) {
  heal(e, e.maxHp * 0.08)
  for (const o of combat.units) {
    if (o !== e && o.team === 'enemy' && o.alive && dist(o, e) < 8) heal(o, o.maxHp * 0.2)
  }
  ring(e.x, e.z, '#8dffb0', 0.5, 8, 0.6)
  burst(e.x, 1, e.z, '#8dffb0', 30, 5, { up: 5, gravity: 4, size: 0.12, life: 1 })
}

/** 精英與 Boss：定時對目標腳下放範圍重擊（先出紅圈預兆）；Boss 半血時狂暴並召喚小怪。第二章的種族各有特技 */
function enemySpecial(e: Unit, t: Unit, dt: number) {
  const boss = e.tier === 'boss'
  if (boss && !e.enraged && e.hp < e.maxHp * 0.5) enrage(e)
  e.special -= dt
  e.special2 -= dt
  switch (e.species) {
    case 'wolf':
      return wolfPounce(e, t)
    case 'mushroom':
      return mushroomSpore(e, t)
    case 'crystal':
      if (e.tier !== 'normal') crystalBarrage(e, t)
      return
    case 'stag':
      return stagSkills(e, t)
  }
  if (e.tier === 'normal') return
  if (e.special > 0 || dist(e, t) > 10) return
  e.special = boss ? (e.enraged ? 4 : 6.5) : 7
  const delay = boss ? 1.3 : 1.1
  combat.hazards.push({ owner: e, x: t.x, z: t.z, radius: boss ? 4 : 2.6, delay, total: delay, power: boss ? 1.8 : 1.5 })
  e.attackAnim = 1
  e.atkTimer = Math.max(e.atkTimer, delay) // 蓄力期間不普攻
  addFloater(e, '蓄力重擊！', '#ff8f8f', true, boss ? 3.4 : 2.2)
  sfx.taunt()
}

/** 範圍重擊：倒數結束時傷害圈內隊員（閃避的無敵時間可以躲掉） */
function updateHazards(dt: number) {
  const list = combat.hazards
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i]
    const wasWaiting = z.delay > 0
    z.delay -= dt
    // 衝撞：生效前 0.3 秒怪物衝向圈中心
    if (z.dash && z.delay <= 0.3) {
      z.dash = false
      const o = z.owner
      if (o.alive && o.stun <= 0) {
        o.castT = 0
        o.castKind = ''
        o.dashX = z.x
        o.dashZ = z.z
        o.dashT = 0.3
        o.dashPower = 0
        action(o, 'Charge')
      }
    }
    if (z.delay > 0) continue
    // 毒霧：生效後留在地上，每隔一段時間傷害圈內隊員
    if (z.linger !== undefined) {
      if (wasWaiting) {
        burst(z.x, 0.3, z.z, z.color ?? '#8fdc5a', 30, 3.5, { up: 2.5, gravity: 1, size: 0.18, life: 1.2 })
        if (audible(z)) sfx.explode()
      }
      z.linger -= dt
      z.tickTimer = (z.tickTimer ?? 0) - dt
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * z.radius
        emit(z.x + Math.cos(a) * r, 0.15, z.z + Math.sin(a) * r, z.color ?? '#8fdc5a', { vy: 0.6 + Math.random() * 0.6, life: 1.1, size: 0.16 })
      }
      if (z.tickTimer <= 0) {
        z.tickTimer += z.tick ?? 0.7
        for (const u of combat.units) {
          if (u.team !== 'party' || !u.alive) continue
          if (Math.hypot(u.x - z.x, u.z - z.z) <= z.radius + u.radius) damage(z.owner, u, z.power * (u.kind === 'ally' ? 0.5 : 1))
        }
      }
      if (z.linger <= 0) list.splice(i, 1)
      continue
    }
    list.splice(i, 1)
    flash(z.x, 0.6, z.z, '#ff8f8f', z.radius * 1.1, 0.25)
    ring(z.x, z.z, '#ff5a5a', z.radius * 0.4, z.radius * 1.15, 0.4)
    burst(z.x, 0.3, z.z, '#ff7a7a', 30, 6.5, { up: 6, gravity: 12, size: 0.14, life: 0.7 })
    shake(0.4)
    sfx.explode()
    if (!z.owner.alive) continue
    for (const u of combat.units) {
      if (u.team !== 'party' || !u.alive) continue
      // 隊友 AI 不會主動躲紅圈，所以對隊友的傷害減半
      if (Math.hypot(u.x - z.x, u.z - z.z) <= z.radius + u.radius) damage(z.owner, u, z.power * (u.kind === 'ally' ? 0.5 : 1), true)
    }
  }
}

// ── 隊友 AI ──
function follow(u: Unit, h: Unit, slot: number, dt: number) {
  const f = FORMATION[slot % FORMATION.length]
  const sin = Math.sin(h.facing)
  const cos = Math.cos(h.facing)
  // 主角本地座標 → 世界座標（前方為 (sin, cos)）
  const tx = h.x - sin * f.z + cos * f.x
  const tz = h.z - cos * f.z - sin * f.x
  const d = Math.hypot(tx - u.x, tz - u.z)
  if (d > 30) {
    // 走散太遠直接回到主角身邊
    u.x = tx
    u.z = tz
    resolveCollisions(u, u.radius)
    u.ai.path = null
    return
  }
  // 主角站著時容許較大誤差，避免隊友原地抖動
  if (d > (h.speed > 0.5 ? 0.35 : 1.1)) {
    navTo(u, tx, tz, d > 3.5 ? RUN_SPEED * 1.05 : Math.min(WALK_SPEED * 1.1, Math.max(1.2, d * 3)), dt)
  }
}

const SKILL = { first: 0, second: 1, buff: 2, ult: 3 }

/** 依職業決定要不要放技能（一次只放一個，之後有共用冷卻） */
function allySkills(u: Unit, t: Unit, engaged: Unit[], party: Unit[]) {
  const lowest = party.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b))
  const lowRatio = lowest.hp / lowest.maxHp
  const many = engaged.length >= 3
  const cast = (i: number) => castSkill(u, i) === 'ok'
  switch (u.classId) {
    case 'knight': {
      // 嘲諷：有怪物在打別的隊友時拉回來
      if (engaged.some((e) => e.targetId !== u.id && e.tauntTime <= 0 && dist(e, u) < 9) && cast(SKILL.second)) return
      if ((many || lowRatio < 0.35) && cast(SKILL.ult)) return
      if (u.hp / u.maxHp < 0.6 && !hasBuff(u, 'def') && cast(SKILL.buff)) return
      cast(SKILL.first)
      return
    }
    case 'cleric': {
      const hurt = party.filter((m) => m.hp / m.maxHp < 0.6).length
      if ((hurt >= 2 || many) && cast(SKILL.ult)) return
      if (lowRatio < 0.7 && cast(SKILL.second)) return
      if (lowRatio < 0.5 && !hasBuff(lowest, 'maxHp') && cast(SKILL.buff)) return
      cast(SKILL.first)
      return
    }
    case 'archer': {
      if (many && cast(SKILL.ult)) return
      if (!hasBuff(u, 'atkSpeed') && cast(SKILL.buff)) return
      if (cast(SKILL.first)) return
      cast(SKILL.second)
      return
    }
    case 'mage': {
      if (many && cast(SKILL.ult)) return
      if (!hasBuff(u, 'atk') && cast(SKILL.buff)) return
      // 群怪時優先用範圍術
      if (engaged.filter((e) => dist(e, t) < 3.5).length >= 2 && cast(SKILL.second)) return
      cast(SKILL.first)
      return
    }
  }
}

function allyAI(u: Unit, slot: number, h: Unit, engaged: Unit[], party: Unit[], dt: number) {
  if (!u.alive) {
    u.deadTime += dt
    if (combat.calm > 4) {
      u.alive = true
      u.hp = Math.round(u.maxHp * 0.4)
      addFloater(u, '復活', '#8dffb0', true)
    }
    return
  }
  if (u.stun > 0) return

  // 目標：優先打主角鎖定的怪，否則打離自己最近、正在攻擊隊伍的怪；不追離主角太遠的怪
  let t = unitById(h.targetId)
  if (!t || !t.alive || !h.alive) t = nearest(engaged, u)
  if (t && dist(t, h) > 20) t = undefined
  u.targetId = t ? t.id : null
  if (!t) return follow(u, h, slot, dt)

  const d = dist(u, t) - t.radius
  if (u.ranged) {
    // 遠程：保持射程；被怪物貼身時後退，交給戰士拉怪
    const threat = engaged.find((e) => e.targetId === u.id && dist(e, u) < 2.6)
    if (threat) {
      const k = dist(u, threat) || 1
      moveToward(u, u.x + ((u.x - threat.x) / k) * 3, u.z + ((u.z - threat.z) / k) * 3, RUN_SPEED * 0.8, dt)
    } else if (d > u.range * 0.85) navTo(u, t.x, t.z, RUN_SPEED * 0.95, dt)
    else u.facing = dampAngle(u.facing, Math.atan2(t.x - u.x, t.z - u.z), 10, dt)
  } else if (d > u.range * 0.75) navTo(u, t.x, t.z, RUN_SPEED, dt)
  else u.facing = dampAngle(u.facing, Math.atan2(t.x - u.x, t.z - u.z), 10, dt)

  if (u.gcd <= 0) allySkills(u, t, engaged, party)
  // 移動中不出手（站定才射擊 / 揮擊）；安全區內也不攻擊
  if (d <= u.range && u.atkTimer <= 0 && u.gcd < 0.6 && u.moved < 0.3 && !inSafeZone(u.x, u.z)) basicAttack(u, t)
}

// ── 主角：選目標與技能時機由玩家決定，普通攻擊自動執行 ──
function respawnHero(h: Unit) {
  runtime.player.x = SPAWN.x
  runtime.player.z = SPAWN.z
  runtime.path = null
  runtime.approach = false
  h.alive = true
  h.hp = h.maxHp
  h.mp = h.maxMp
  h.targetId = null
  combat.heroDown = 0
  combat.units.forEach((u, i) => {
    if (u.team === 'enemy') {
      u.targetId = null
      u.tauntTime = 0
      u.ai.returning = true
    } else if (u.kind === 'ally') {
      u.alive = true
      u.hp = u.maxHp
      u.x = SPAWN.x + FORMATION[(i - 1) % 3].x
      u.z = SPAWN.z - FORMATION[(i - 1) % 3].z
      u.ai.path = null
    }
  })
  useGame.getState().showToast('回到星光村，隊伍已恢復')
}

function heroUpdate(h: Unit, engaged: Unit[], dt: number) {
  if (!h.alive) {
    if (combat.heroDown === 0) useGame.getState().showToast('你倒下了… 3 秒後回到星光村')
    combat.heroDown += dt
    return
  }
  let t = unitById(h.targetId)
  if (t && (!t.alive || dist(h, t) > 24)) t = undefined
  // 沒有目標但被攻擊時，自動鎖定最近的怪
  if (!t) t = nearest(engaged, h, 12)
  h.targetId = t ? t.id : null
  if (!t) runtime.queuedSkill = null
  if (!t || h.stun > 0 || runtime.dodge.time > 0) return
  // 先前因距離不夠而排隊的技能：進入射程就放
  if (runtime.queuedSkill !== null) {
    const sk = CLASSES[h.classId!].skills[runtime.queuedSkill]
    if (dist(h, t) <= sk.range + t.radius - 0.2) {
      const idx = runtime.queuedSkill
      runtime.queuedSkill = null
      runtime.approach = false
      runtime.path = null
      castSkill(h, idx)
    }
  }
  // 普通攻擊只在站定時進行：邊走邊跑不會出手（要拉怪就停下來射），安全區內也不能攻擊
  // 按下移動鍵 / 搖桿或正在走路徑的那一幀也算移動，避免起步瞬間多打一發
  const axis = moveAxis()
  const standing = h.speed < 0.3 && axis.x === 0 && axis.y === 0 && !runtime.path
  if (standing &&!inSafeZone(h.x, h.z) && dist(h, t) - t.radius <= h.range && h.atkTimer <= 0) basicAttack(h, t)
}

/** 玩家按 1–4：施放技能並用提示訊息回報失敗原因 */
export function heroCast(idx: number) {
  const h = hero()
  const toast = useGame.getState().showToast
  // 還沒選目標就按技能：自動鎖定最近的怪物
  if (h.classId && CLASSES[h.classId].skills[idx].needsTarget && !unitById(h.targetId)?.alive) {
    const near = nearest(
      combat.units.filter((u) => u.team === 'enemy' && u.alive),
      h,
      16,
    )
    if (near) h.targetId = near.id
  }
  const r = castSkill(h, idx)
  runtime.queuedSkill = null
  if (r === 'mp') toast('MP 不足')
  else if (r === 'target') toast('附近沒有怪物')
  else if (r === 'range') {
    // 距離不夠：自動跑進射程後施放（按方向鍵可取消）
    runtime.queuedSkill = idx
    runtime.approach = true
  } else if (r === 'ok') {
    const t = unitById(h.targetId)
    if (t) faceTarget(h, t)
  }
}

/** 玩家按 Tab：在附近的怪物之間切換鎖定 */
export function cycleTarget() {
  const h = hero()
  const list = combat.units
    .filter((u) => u.team === 'enemy' && u.alive && dist(u, h) < 18)
    .sort((a, b) => dist(a, h) - dist(b, h))
  if (!list.length) return useGame.getState().showToast('附近沒有怪物')
  const i = list.findIndex((u) => u.id === h.targetId)
  h.targetId = list[(i + 1) % list.length].id
}

function updateProjectiles(dt: number) {
  const list = combat.projectiles
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]
    if (p.delay > 0) {
      p.delay -= dt
      p.x = p.owner.x
      p.z = p.owner.z
      continue
    }
    const step = p.speed * dt
    // 拖尾：技能特效系統負責的投射物由 scene/SkillVfx.tsx 畫；其他的箭是細長光痕，法球是發光粒子
    const arrow = p.owner.classId === 'archer'
    if (!p.vfx) {
      emit(p.x, 0.75, p.z, p.color, { life: arrow ? 0.16 : 0.3, size: (arrow ? 0.07 : 0.13) * (p.big ? 1.6 : 1), vy: arrow ? 0 : 0.6 })
      if (!arrow) emit(p.x + (Math.random() - 0.5) * 0.3, 0.75 + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3, '#ffffff', { life: 0.2, size: 0.05 })
    }
    if (p.pierce) {
      p.x += p.dirX * step
      p.z += p.dirZ * step
      p.travelled += step
      for (const e of combat.units) {
        if (e.team !== 'enemy' || !e.alive || p.hit.includes(e.id)) continue
        if (Math.hypot(e.x - p.x, e.z - p.z) < e.radius + 0.45) {
          p.hit.push(e.id)
          damage(p.owner, e, p.power, false, !!p.vfx)
          if (p.vfx) playImpact(p.vfx, p.owner, e)
        }
      }
      if (p.travelled > 13) list.splice(i, 1)
      continue
    }
    const t = unitById(p.targetId)
    if (!t || !t.alive) {
      list.splice(i, 1)
      continue
    }
    const dx = t.x - p.x
    const dz = t.z - p.z
    const d = Math.hypot(dx, dz)
    if (d <= step + t.radius) {
      // 命中判定在這裡；有技能特效的投射物，命中反應（爆炸、火花、音效）交給技能時間軸
      const own = !!p.vfx
      const hx = t.x
      const hz = t.z
      damage(p.owner, t, p.power, p.big, own)
      if (p.splash > 0) {
        if (!own) {
          // 爆炸：火光、衝擊波與碎屑
          flash(t.x, 0.6, t.z, '#ffd08a', p.splash * 1.3, 0.22)
          ring(t.x, t.z, p.color, 0.3, p.splash, 0.35)
          burst(t.x, 0.5, t.z, p.color, 26, 6, { up: 4, size: 0.13, life: 0.6 })
          shake(0.2)
          sfx.explode()
        }
        for (const e of combat.units) {
          if (e.team === 'enemy' && e.alive && e !== t && dist(e, t) < p.splash) damage(p.owner, e, p.power * 0.6, false, own)
        }
      }
      if (p.vfx) playImpact(p.vfx, p.owner, { x: hx, z: hz })
      list.splice(i, 1)
    } else {
      p.dirX = dx / d
      p.dirZ = dz / d
      p.x += p.dirX * step
      p.z += p.dirZ * step
    }
  }
}

/** 範圍技能的持續視覺：箭雨落箭、隕石拖尾、聖域升起的光點 */
function zoneAmbient(z: Zone, dt: number) {
  const rate = z.style === 'rain' ? 70 : z.style === 'holy' ? 40 : z.style === 'meteor' ? 26 : 0
  let n = rate * dt
  while (n > 0) {
    if (n < 1 && Math.random() > n) break
    n--
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * z.radius
    const x = z.x + Math.cos(a) * r
    const zz = z.z + Math.sin(a) * r
    if (z.style === 'rain') emit(x, 7, zz, z.color, { vy: -24, life: 0.29, size: 0.07, streak: true })
    else if (z.style === 'meteor') emit(x, 0.1, zz, '#ffb347', { vy: 2 + Math.random() * 2, life: 0.5, size: 0.1 })
    else emit(x, 0.1, zz, z.color, { vy: 1.2 + Math.random() * 1.6, life: 1, size: 0.07 })
  }
}

/** 每次生效時的脈衝：隕石砸落爆炸、箭雨濺起、聖域光環 */
function zonePulse(z: Zone) {
  if (z.style === 'meteor') {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * z.radius * 0.6
    const x = z.x + Math.cos(a) * r
    const zz = z.z + Math.sin(a) * r
    for (let i = 0; i < 10; i++) emit(x + i * 0.12, 0.6 + i * 0.5, zz, i % 2 ? '#ff7a3c' : '#ffd08a', { life: 0.25, size: 0.3 - i * 0.02, streak: true })
    flash(x, 0.7, zz, '#ffd08a', 3.2, 0.26)
    ring(x, zz, '#ff7a3c', 0.4, z.radius * 0.8, 0.4)
    burst(x, 0.4, zz, '#ff7a3c', 30, 7.5, { up: 6, gravity: 12, size: 0.16, life: 0.7 })
    burst(x, 0.4, zz, '#5a4a42', 10, 4, { up: 5, gravity: 14, size: 0.12, life: 0.8 })
    shake(0.38)
    sfx.explode()
  } else if (z.style === 'rain') {
    ring(z.x, z.z, z.color, z.radius * 0.5, z.radius, 0.3)
    sfx.shoot(false)
  } else if (z.style === 'holy') {
    ring(z.x, z.z, z.color, 0.4, z.radius, 0.5)
  }
}

/** 範圍技能對還沒開打的怪的有效半徑比例 */
const IDLE_ZONE_REACH = 0.5

function updateZones(dt: number) {
  const list = combat.zones
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i]
    z.time += dt
    z.tickTimer -= dt
    zoneAmbient(z, dt)
    if (z.tickTimer <= 0) {
      z.tickTimer += z.tick
      zonePulse(z)
      for (const u of combat.units) {
        if (!u.alive) continue
        const d = Math.hypot(u.x - z.x, u.z - z.z)
        // 已經在打的怪：碰到範圍就算。還沒開打的怪（同營地或旁邊營地的）要在範圍中心一半內才算，
        // 這樣對鎖定的怪放大招，不會把旁邊幾公尺外還沒開打的怪一起拉進來
        const reach = u.team === 'enemy' && u.targetId === null ? z.radius * IDLE_ZONE_REACH : z.radius + u.radius
        if (d > reach) continue
        if (u.team === 'enemy') {
          if (z.power) damage(z.owner, u, z.power)
          if (z.slow) u.slow = Math.max(u.slow, z.slow)
        } else if (z.heal) heal(u, u.maxHp * z.heal)
      }
    }
    if (z.time >= z.duration) list.splice(i, 1)
  }
}

/** 遠處閒置的怪物：直接回到出生點、慢慢回血，不做尋敵與移動計算 */
function idleFar(e: Unit, dt: number) {
  if (e.ai.returning || e.castT > 0 || e.dashT > 0) {
    e.x = e.homeX
    e.z = e.homeZ
    e.ai.returning = false
    e.castT = 0
    e.castKind = ''
    e.dashT = 0
  }
  if (e.respawns && e.hp < e.maxHp) {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt)
    if (e.enraged && e.hp >= e.maxHp * 0.98) setEnemyLevel(e, e.level)
  }
}
/** 每幀有幾隻怪物跑完整 AI、幾隻只做簡化更新（測試與效能紀錄用） */
export const aiStats = { full: 0, idle: 0 }

/** 單位互相推開，避免重疊；主角不被推動。只處理主角附近的單位 */
function separate() {
  const h = combat.units[0]
  const us = combat.units.filter((u) => u.alive && dist(u, h) < AI.fullRadius + 4)
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i]
      const b = us[j]
      if (!a.alive || !b.alive) continue
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      const min = a.radius + b.radius
      if (d >= min || d < 1e-4) continue
      const push = (min - d) / d
      if (a.kind === 'hero') {
        b.x += dx * push
        b.z += dz * push
      } else {
        a.x -= dx * push * 0.5
        a.z -= dz * push * 0.5
        b.x += dx * push * 0.5
        b.z += dz * push * 0.5
      }
    }
  }
}

let auraTimer = 0

export function updateCombat(dt: number) {
  const c = combat
  const h = c.units[0]
  c.time += dt

  // 主角位置由 Player 控制，這裡只同步
  h.x = runtime.player.x
  h.z = runtime.player.z
  h.facing = runtime.player.facing
  h.speed = runtime.player.speed

  const party = c.units.filter((u) => u.team === 'party' && u.alive)
  const engaged = c.units.filter((u) => u.team === 'enemy' && u.alive && u.targetId !== null)
  c.inCombat = engaged.length > 0
  c.calm = c.inCombat ? 0 : c.calm + dt

  let slot = 0
  aiStats.full = 0
  aiStats.idle = 0
  for (const u of c.units) {
    tickTimers(u, dt)
    if (u.kind === 'hero') continue
    u.moved = 0
    if (u.team === 'enemy') {
      // 遠處沒在戰鬥的怪物不跑完整 AI：只回家、回血（死亡的照常計算重生時間）
      if (u.alive && !u.targetId && dist(u, h) > AI.fullRadius) {
        idleFar(u, dt)
        aiStats.idle++
      } else {
        enemyAI(u, party, dt)
        aiStats.full++
      }
    } else allyAI(u, slot++, h, engaged, party, dt)
    u.speed += (u.moved - u.speed) * (1 - Math.exp(-dt * 12))
  }

  heroUpdate(h, engaged, dt)
  if (!h.alive && c.heroDown > 3) respawnHero(h)
  separate()
  updateSkillRuns(dt)
  updateProjectiles(dt)
  updateZones(dt)

  // 增益光環：身上有增益的隊友持續冒出對應顏色的光點
  auraTimer += dt
  if (auraTimer > 0.07) {
    auraTimer = 0
    for (const u of party) {
      for (const b of u.buffs) {
        const a = Math.random() * Math.PI * 2
        emit(u.x + Math.cos(a) * 0.45, 0.1 + Math.random() * 0.3, u.z + Math.sin(a) * 0.45, BUFF_COLOR[b.stat], { vy: 1.4 + Math.random(), life: 0.7, size: 0.07 })
      }
    }
  }
  updateFx(dt)
  updateDrops(dt)
  updateHazards(dt)
  bossSync -= dt
  if (bossSync <= 0) {
    bossSync = 1
    syncAreaBosses()
  }
  // 事件怪物死亡後不重生：倒下動畫播完就移除
  if (c.units.some((u) => !u.alive && !u.respawns && u.team === 'enemy' && u.deadTime > 2.5)) {
    c.units = c.units.filter((u) => u.alive || u.respawns || u.team !== 'enemy' || u.deadTime <= 2.5)
  }
  updateEnemySlots()

  for (const f of c.floaters) {
    if (f.life <= 0) continue
    f.life -= dt / 0.9
    f.y += dt * 0.9
  }

  // 回復：MP 持續回復；脫戰數秒後 HP 緩慢回復
  for (const u of party) {
    u.mp = Math.min(u.maxMp, u.mp + 3 * dt)
    if (c.calm > 3) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt)
  }
}
