// 戰鬥動作：傷害、治療、增益、普攻、技能施放。全部由資料表（classes.ts）驅動，
// 並在每個動作上觸發對應的特效、音效與打擊回饋。
import { CLASSES, type BuffStat, type SkillEffect } from '../../data/classes'
import { inSafeZone } from '../../data/world'
import { sfx } from '../../systems/sfx'
import { runtime } from '../runtime'
import { burst, emit, flash, pillar, ring, shake, slash } from './fx'
import { onEnemyKilled } from './rewards'
import { addFloater, combat, dist, removeBuffs, unitById } from './state'
import type { CastResult, Unit } from './types'

export const BUFF_COLOR: Record<BuffStat, string> = {
  atkSpeed: '#9dff8a',
  atk: '#ff9c5a',
  def: '#8ab6ff',
  maxHp: '#ffe27a',
  guard: '#bfe0ff',
}
const ENEMY_HIT = '#ff6b6b'

const buffSum = (u: Unit, stat: BuffStat) => u.buffs.reduce((s, b) => (b.stat === stat ? s + b.amount : s), 0)
export const atkOf = (u: Unit) => u.atk * (1 + buffSum(u, 'atk'))
export const defOf = (u: Unit) => u.def * (1 + buffSum(u, 'def'))
export const intervalOf = (u: Unit) => u.interval / (1 + buffSum(u, 'atkSpeed'))
export const hasBuff = (u: Unit, stat: BuffStat) => u.buffs.some((b) => b.stat === stat)
const attackColor = (u: Unit) => (u.classId ? CLASSES[u.classId].attack.color : ENEMY_HIT)
/** 離主角太遠的事件不出聲 */
const audible = (u: { x: number; z: number }) => Math.hypot(u.x - runtime.player.x, u.z - runtime.player.z) < 24

export function faceTarget(u: Unit, t: { x: number; z: number }) {
  u.facing = Math.atan2(t.x - u.x, t.z - u.z)
  // 主角朝向由 Player 控制：只有站著不動時才轉向目標
  if (u.kind === 'hero' && runtime.player.speed < 0.5) runtime.player.facing = u.facing
}

export function kill(u: Unit) {
  u.alive = false
  u.hp = 0
  u.deadTime = 0
  u.targetId = null
  u.tauntTime = 0
  u.stun = 0
  u.slow = 0
  removeBuffs(u)
  if (u.team === 'enemy') {
    onEnemyKilled(u)
    addFloater(u, '擊敗！', '#ffe27a', true, 1.4)
    // 史萊姆被打爆：大量果凍碎塊濺開
    burst(u.x, 0.4, u.z, u.color, 34, 5.5, { up: 5, gravity: 14, size: 0.16, life: 0.8 })
    flash(u.x, 0.45, u.z, '#ffffff', 1.6, 0.2)
    ring(u.x, u.z, u.color, 0.3, 2.4, 0.45)
    shake(0.22)
    combat.hitStop = Math.max(combat.hitStop, 0.07)
    if (audible(u)) sfx.kill()
  } else {
    addFloater(u, '倒下', '#ff7a7a', true)
    burst(u.x, 0.8, u.z, '#ff7a7a', 14, 3, { up: 3 })
  }
}

export function damage(src: Unit, dst: Unit, power: number, heavy = false) {
  if (!dst.alive) return
  // 安全區內的隊伍打不到野怪（避免站在村裡隔空刷怪）；事件怪物不受限
  if (src.team === 'party' && dst.team === 'enemy' && dst.respawns && inSafeZone(src.x, src.z)) return
  if (dst.invuln > 0) return addFloater(dst, '閃避', '#bfe9ff')
  let d = atkOf(src) * power - defOf(dst) * 0.5
  const crit = Math.random() < src.crit
  if (crit) d *= 1.6
  d *= 0.9 + Math.random() * 0.2
  d *= 1 - Math.min(0.9, buffSum(dst, 'guard'))
  if (dst.vulnTime > 0) d *= 1 + dst.vuln // 破甲
  d = Math.max(1, Math.round(d))
  dst.hp -= d
  dst.hitFlash = 0.18
  addFloater(
    dst,
    crit ? `${d}!` : `${d}`,
    dst.team === 'party' ? '#ff8f8f' : crit ? '#ffd23c' : '#ffffff',
    crit,
    dst.team === 'enemy' ? 1.1 : 1.7,
  )

  // 打擊回饋：命中火花、閃光、擊退、音效；主角參與時加鏡頭震動與頓幀
  const strong = crit || heavy || power >= 1.8
  const y = dst.team === 'enemy' ? 0.45 : 0.9
  const color = attackColor(src)
  const kx = dst.x - src.x
  const kz = dst.z - src.z
  const kd = Math.hypot(kx, kz) || 1
  burst(dst.x, y, dst.z, color, strong ? 14 : 7, strong ? 5 : 3.2, { up: 2.5, size: strong ? 0.12 : 0.085 })
  burst(dst.x, y, dst.z, '#ffffff', strong ? 5 : 3, 2.2, { up: 1.5, size: 0.06, life: 0.25 })
  flash(dst.x - (kx / kd) * 0.25, y, dst.z - (kz / kd) * 0.25, strong ? '#ffffff' : color, strong ? 1.1 : 0.65)
  if (dst.team === 'enemy') {
    const push = Math.min(0.55, 0.14 + power * 0.1) * (crit ? 1.4 : 1)
    dst.x += (kx / kd) * push
    dst.z += (kz / kd) * push
    dst.squash = 1
  }
  const heroInvolved = src.kind === 'hero' || dst.kind === 'hero'
  if (heroInvolved) {
    shake(strong ? 0.2 : 0.08)
    if (src.kind === 'hero' && (strong || !src.ranged)) combat.hitStop = Math.max(combat.hitStop, strong ? 0.07 : 0.035)
  } else if (strong) shake(0.06)
  if (audible(dst)) dst.team === 'party' ? sfx.hurt() : sfx.hit(strong)

  // 被打的怪物若還沒有目標，就鎖定攻擊者
  if (dst.team === 'enemy' && !dst.targetId && dst.tauntTime <= 0 && src.alive) {
    dst.targetId = src.id
    dst.ai.returning = false
  }
  if (dst.hp <= 0) kill(dst)
}

export function heal(u: Unit, amount: number) {
  if (!u.alive) return
  const before = u.hp
  u.hp = Math.min(u.maxHp, u.hp + Math.round(amount))
  if (u.hp <= before) return
  addFloater(u, `+${Math.round(u.hp - before)}`, '#8dffb0')
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2
    emit(u.x + Math.cos(a) * 0.4, 0.2 + Math.random() * 0.4, u.z + Math.sin(a) * 0.4, '#8dffb0', {
      vy: 1.6 + Math.random(),
      life: 0.7,
      size: 0.08,
    })
  }
  ring(u.x, u.z, '#8dffb0', 0.3, 1, 0.4)
  if (audible(u)) sfx.heal()
}

function addBuff(u: Unit, stat: BuffStat, amount: number, duration: number) {
  pillar(u.x, u.z, BUFF_COLOR[stat], 0.6, 3, 0.6)
  ring(u.x, u.z, BUFF_COLOR[stat], 0.3, 1.3, 0.45)
  const old = u.buffs.find((b) => b.stat === stat)
  if (old) {
    old.time = duration // 同種增益只刷新時間，不疊加
    return
  }
  let value = 0
  if (stat === 'maxHp') {
    // 最大 HP 提升時同步補足增加的生命值
    value = Math.round(u.maxHp * amount)
    u.maxHp += value
    u.hp += value
  }
  u.buffs.push({ stat, amount, time: duration, value })
}

/** 怪物的遠程攻擊（星晶魔靈）：追蹤目標的光彈，delay 秒後才出手（配合射擊動作） */
export function enemyShot(u: Unit, t: Unit, power: number, color: string, delay = 0.3, big = false) {
  const d = dist(u, t) || 1
  u.atkTimer = u.interval
  u.attackAnim = 1
  faceTarget(u, t)
  combat.projectiles.push({
    owner: u,
    targetId: t.id,
    x: u.x,
    z: u.z,
    dirX: (t.x - u.x) / d,
    dirZ: (t.z - u.z) / d,
    speed: 11,
    power,
    delay,
    pierce: false,
    splash: 0,
    travelled: 0,
    hit: [],
    color,
    big,
  })
  if (audible(u)) sfx.shoot(true)
}

function spawnProjectile(u: Unit, t: Unit, power: number, delay: number, pierce: boolean, splash: number, big: boolean) {
  const d = dist(u, t) || 1
  combat.projectiles.push({
    owner: u,
    targetId: pierce ? null : t.id,
    x: u.x,
    z: u.z,
    dirX: (t.x - u.x) / d,
    dirZ: (t.z - u.z) / d,
    speed: pierce ? 26 : 20,
    power,
    delay,
    pierce,
    splash,
    travelled: 0,
    hit: [],
    color: CLASSES[u.classId!].attack.color,
    big,
  })
}

export function basicAttack(u: Unit, t: Unit) {
  u.atkTimer = intervalOf(u)
  u.attackAnim = 1
  faceTarget(u, t)
  const color = attackColor(u)
  if (u.ranged) {
    spawnProjectile(u, t, 1, 0.12, false, 0, false)
    // 出手閃光
    flash(u.x + Math.sin(u.facing) * 0.5, 0.85, u.z + Math.cos(u.facing) * 0.5, color, 0.5, 0.12)
    if (audible(u)) sfx.shoot(u.classId !== 'archer')
  } else {
    if (u.team === 'party') {
      slash(u.x, u.z, u.facing, '#ffffff', 1.7)
      if (audible(u)) sfx.slash()
    }
    damage(u, t, 1)
  }
}

const party = () => combat.units.filter((u) => u.team === 'party' && u.alive)
const enemies = () => combat.units.filter((u) => u.team === 'enemy' && u.alive)

function applyEffect(u: Unit, t: Unit | undefined, e: SkillEffect, idx: number) {
  // 技能樹加成
  const mods = u.mods
  const mul = mods ? mods.power[idx] : 1
  const healMul = 1 + (mods?.heal ?? 0)
  switch (e.type) {
    case 'projectile':
      if (t) {
        for (let i = 0; i < e.count; i++) {
          spawnProjectile(u, t, e.power * mul, 0.1 + i * (e.interval ?? 0), !!e.pierce, e.splash ?? 0, e.power >= 2)
        }
        flash(u.x + Math.sin(u.facing) * 0.5, 0.85, u.z + Math.cos(u.facing) * 0.5, attackColor(u), 0.9, 0.16)
      }
      break
    case 'melee':
      if (t) {
        // 重擊：大刀光 + 衝擊波
        slash(u.x, u.z, u.facing, '#ffe9a8', 2.3, 0.26)
        ring(t.x, t.z, '#ffe9a8', 0.2, 1.8, 0.3)
        if (audible(u)) sfx.slash()
        damage(u, t, e.power * mul, true)
        if (e.stun && t.alive) {
          t.stun = Math.max(t.stun, e.stun)
          addFloater(t, '暈眩', '#ffe27a', false, 1.5)
          burst(t.x, 1, t.z, '#ffe27a', 10, 2.5, { up: 2, gravity: 2, life: 0.7 })
        }
      }
      break
    case 'taunt':
      // 嘲諷：紅色衝擊波擴散到作用範圍
      ring(u.x, u.z, '#ff5a5a', 0.5, e.radius, 0.5)
      ring(u.x, u.z, '#ffb0b0', 0.3, e.radius * 0.6, 0.35)
      shake(0.12)
      if (audible(u)) sfx.taunt()
      for (const en of enemies()) {
        if (dist(u, en) > e.radius) continue
        en.targetId = u.id
        en.tauntBy = u.id
        en.tauntTime = e.duration
        en.ai.returning = false
        addFloater(en, '!', '#ff5a5a', true, 1.3)
        burst(en.x, 0.9, en.z, '#ff5a5a', 6, 2, { up: 2.5, gravity: 4 })
      }
      break
    case 'heal': {
      const members = party()
      const targets = e.party
        ? members
        : members.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1)
      for (const m of targets) {
        pillar(m.x, m.z, '#8dffb0', 0.55, 2.6, 0.5)
        heal(m, m.maxHp * e.ratio * healMul)
      }
      break
    }
    case 'buff':
      // 第 3 個技能是職業強化：效果量與持續時間吃技能樹加成
      for (const m of e.party ? party() : [u]) {
        const own = idx === 2 && mods
        addBuff(m, e.stat, e.amount * (own ? 1 + mods.buffAmount : 1), e.duration + (own ? mods.buffDuration : 0))
      }
      break
    case 'zone': {
      const at = e.at === 'target' && t ? t : u
      combat.zones.push({
        owner: u,
        x: at.x,
        z: at.z,
        radius: e.radius + (mods?.radius[idx] ?? 0),
        time: 0,
        duration: e.duration,
        tick: e.tick,
        tickTimer: 0.15,
        power: (e.power ?? 0) * mul,
        heal: (e.heal ?? 0) * healMul,
        slow: e.slow ?? 0,
        color: e.color,
        style: e.style,
      })
      ring(at.x, at.z, e.color, 0.3, e.radius, 0.35)
      if (e.style === 'frost') {
        // 冰霜衝擊：冰晶向外炸開
        flash(at.x, 0.6, at.z, '#dff4ff', e.radius * 1.2, 0.25)
        burst(at.x, 0.4, at.z, '#bfe9ff', 46, 7, { up: 3, gravity: 6, size: 0.14, life: 0.7 })
        shake(0.18)
        if (audible(at)) sfx.explode()
      }
      break
    }
  }
}

/** 技能實際冷卻秒數（扣掉技能樹的冷卻縮減） */
export function skillCooldown(u: Unit, idx: number) {
  const base = CLASSES[u.classId!].skills[idx].cooldown
  return Math.max(1, base - (u.mods?.cooldown[idx] ?? 0))
}

/** 施放第 idx 個技能（0–3）。主角與隊友 AI 共用。 */
export function castSkill(u: Unit, idx: number): CastResult {
  if (!u.classId || !u.alive || u.stun > 0) return 'unable'
  const sk = CLASSES[u.classId].skills[idx]
  if (u.cooldowns[idx] > 0) return 'cooldown'
  if (u.mp < sk.mp) return 'mp'
  const t = unitById(u.targetId)
  if (sk.needsTarget) {
    if (!t || !t.alive) return 'target'
    if (dist(u, t) > sk.range + t.radius) return 'range'
    faceTarget(u, t)
  }
  u.cooldowns[idx] = skillCooldown(u, idx)
  u.mp -= sk.mp
  u.attackAnim = 1
  u.gcd = 0.9
  addFloater(u, sk.name, sk.ultimate ? '#ffcf4a' : '#bfe9ff', !!sk.ultimate, 2.1)

  // 施法特效：腳下光環；必殺技再加光柱、粒子與震動
  const color = attackColor(u)
  ring(u.x, u.z, color, 0.3, sk.ultimate ? 2.6 : 1.5, sk.ultimate ? 0.55 : 0.35)
  if (sk.ultimate) {
    pillar(u.x, u.z, '#ffe9a8', 1, 6, 0.8)
    ring(u.x, u.z, '#ffffff', 0.2, 3.6, 0.7)
    burst(u.x, 0.3, u.z, '#ffe9a8', 30, 4.5, { up: 6, gravity: 5, size: 0.11, life: 0.9 })
    shake(u.kind === 'hero' ? 0.3 : 0.14)
    if (audible(u)) sfx.ultimate()
  } else if (audible(u)) sfx.cast()

  for (const e of sk.effects) applyEffect(u, t, e, idx)

  // 技能樹「破甲」：必殺技範圍內的敵人暫時受到更多傷害
  if (sk.ultimate && u.mods && u.mods.vuln > 0) {
    const center = sk.needsTarget && t ? t : u
    for (const en of enemies()) {
      if (dist(center, en) > 7) continue
      en.vuln = u.mods.vuln
      en.vulnTime = 6
      addFloater(en, '破甲', '#ffb347', false, 1.5)
    }
  }
  return 'ok'
}
