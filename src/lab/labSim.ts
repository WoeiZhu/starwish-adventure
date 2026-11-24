// 技能測試頁的模擬：施放者、訓練木樁、投射物與時間軸。
// 和遊戲用同一份技能資料（demoSkills）、同一套命中判定（hitTest）與傷害公式（damageCalc），
// 只是目標換成木樁，方便單獨看特效。
import type { ClassId } from '../data/classes'
import { rollDamage } from '../game/combat/damageCalc'
import { DEMO_SKILLS, SKILL_OF_CLASS, type DemoSkill, type DemoSkillId } from '../skills/demoSkills'
import { arcTargets, radiusTargets, reaches } from '../skills/hitTest'
import { playSfx } from '../skills/sfxNames'
import { anchorFromCaster, CUES, type CueName } from '../vfx/cues'
import { TimelinePlayer, type TimelineEvent } from '../vfx/timeline'
import type { FxParams } from '../vfx/types'
import type { VfxWorld, Tracker } from '../vfx/VfxWorld'

export interface Dummy {
  id: string
  name: string
  team: 'enemy' | 'ally'
  x: number
  z: number
  radius: number
  hp: number
  maxHp: number
  def: number
  flash: number
  wobble: number
}

export interface LabFloater {
  x: number
  y: number
  z: number
  text: string
  color: string
  life: number
  big: boolean
  seq: number
}

interface Caster {
  x: number
  z: number
  facing: number
  /** 攻擊動作進度 1 → 0（和遊戲一樣 0.4 秒） */
  attack: number
  ghost: boolean
}

interface Run {
  skill: DemoSkill
  p: FxParams
  caster: Caster
  target: Dummy | null
}

interface LabProjectile {
  alive: boolean
  skill: DemoSkill
  p: FxParams
  caster: Caster
  target: Dummy
  x: number
  z: number
  tracker: Tracker
}

const PROJECTILE_Y = 0.85
const ATK = 24

function makeDummies(): Dummy[] {
  const d = (id: string, name: string, team: Dummy['team'], x: number, z: number): Dummy => ({
    id,
    name,
    team,
    x,
    z,
    radius: 0.45,
    hp: 400,
    maxHp: 400,
    def: 4,
    flash: 0,
    wobble: 0,
  })
  return [
    d('near', '近身木樁', 'enemy', 0.25, 1.75),
    d('near2', '近身木樁 2', 'enemy', -1.3, 1.3),
    d('far', '遠距木樁', 'enemy', 0, 7),
    d('side', '旁邊的木樁', 'enemy', 1.6, 7.6),
    d('ally', '受傷的隊友', 'ally', -2.2, 0.6),
  ]
}

export const lab = {
  classId: 'knight' as ClassId,
  skillId: 'warrior_slash' as DemoSkillId,
  /** 每個技能目前的參數（從預設值複製，可在面板調整） */
  params: Object.fromEntries(Object.values(DEMO_SKILLS).map((s) => [s.id, structuredClone(s.params)])) as Record<DemoSkillId, FxParams>,
  caster: { x: 0, z: 0, facing: 0, attack: 0, ghost: false } as Caster,
  dummies: makeDummies(),
  projectiles: [] as LabProjectile[],
  floaters: Array.from({ length: 24 }, (): LabFloater => ({ x: 0, y: 0, z: 0, text: '', color: '#fff', life: 0, big: false, seq: 0 })),
  floaterSeq: 0,
  cooldown: 0,
  ignoreCooldown: false,
  auto: false,
  /** 最近一次施放後經過的秒數（時間軸面板的播放頭） */
  sinceCast: 99,
  message: '',
  messageTime: 0,
  shake: 0,
  world: null as VfxWorld | null,
  casts: 0,
  hits: 0,
}

export function resetParams(id: DemoSkillId) {
  lab.params[id] = structuredClone(DEMO_SKILLS[id].params)
}

export function selectClass(c: ClassId) {
  lab.classId = c
  lab.skillId = SKILL_OF_CLASS[c]
  lab.cooldown = 0
}

function floater(x: number, y: number, z: number, text: string, color: string, big = false) {
  const f = lab.floaters[lab.floaterSeq++ % lab.floaters.length]
  Object.assign(f, { x: x + (Math.random() - 0.5) * 0.3, y, z, text, color, life: 1, big, seq: lab.floaterSeq })
}

function say(text: string) {
  lab.message = text
  lab.messageTime = 1.6
}

// ── 時間軸事件的處理（測試頁版本） ──
function dispatch(ev: TimelineEvent, run: Run) {
  const w = lab.world
  const c = run.caster
  switch (ev.kind) {
    case 'anim':
      if (!c.ghost) c.attack = 1
      break
    case 'vfx': {
      if (!w) break
      const at = ev.where === 'target' && run.target ? { x: run.target.x, y: 0.75, z: run.target.z } : anchorFromCaster(c.x, c.z, c.facing, run.p.offset)
      CUES[ev.name as CueName]?.(w, { ...at, facing: c.facing, p: run.p, shake: (n) => (lab.shake = Math.max(lab.shake, n)) })
      break
    }
    case 'sfx':
      if (!c.ghost) playSfx(ev.name)
      break
    case 'hit':
      resolveHit(run)
      break
    case 'launch':
      launch(run)
      break
  }
}

const player = new TimelinePlayer<Run>(dispatch, 128)

const enemies = () => lab.dummies.filter((d) => d.team === 'enemy')

function hurt(d: Dummy, power: number, run: Run) {
  const { amount, crit } = rollDamage({ atk: ATK, def: d.def, power, critChance: 0.15 })
  d.hp = Math.max(1, d.hp - amount) // 木樁不會倒
  d.flash = 0.18
  d.wobble = 1
  lab.hits++
  floater(d.x, 1.9, d.z, crit ? `${amount}!` : `${amount}`, crit ? '#ffd23c' : '#ffffff', crit)
  player.play(run.skill.impact, { ...run, target: d })
}

/** 命中判定：近戰（扇形）與治療在時間軸的 hit 事件；投射物在飛到目標時 */
function resolveHit(run: Run) {
  const { skill, p, caster } = run
  if (skill.hit.shape === 'arc') {
    for (const d of arcTargets(enemies(), caster.x, caster.z, caster.facing, p.range, skill.hit.arc ?? 160, skill.hit.maxTargets ?? Infinity, run.target ?? undefined)) hurt(d, skill.hit.power, run)
  } else if (skill.hit.shape === 'heal' && run.target) {
    const t = run.target
    const amount = Math.round(t.maxHp * skill.hit.power)
    t.hp = Math.min(t.maxHp, t.hp + amount)
    floater(t.x, 1.9, t.z, `+${amount}`, '#8dffb0')
    lab.hits++
    player.play(skill.impact, run)
  }
}

function launch(run: Run) {
  const w = lab.world
  if (!w || !run.target || !run.skill.projectile) return
  const pr = run.skill.projectile
  const at = anchorFromCaster(run.caster.x, run.caster.z, run.caster.facing, run.p.offset)
  const model = pr.model && w.hasModel(pr.model.key) ? pr.model : undefined
  const tracker = w.track(pr.style, run.p, at.x, PROJECTILE_Y, at.z, run.caster.facing, true, model?.key, model?.scale ?? 1)
  let p = lab.projectiles.find((q) => !q.alive)
  if (!p) {
    p = {} as LabProjectile
    lab.projectiles.push(p)
  }
  Object.assign(p, { alive: true, skill: run.skill, p: run.p, caster: run.caster, target: run.target, x: at.x, z: at.z, tracker })
}

function updateProjectiles(dt: number) {
  const w = lab.world
  for (const p of lab.projectiles) {
    if (!p.alive) continue
    const step = (p.skill.projectile?.speed ?? 15) * dt
    const t = p.target
    if (reaches(p.x, p.z, step, t)) {
      p.alive = false
      w?.untrack(p.tracker)
      const run: Run = { skill: p.skill, p: p.p, caster: p.caster, target: t }
      if (p.skill.hit.shape === 'splash') {
        // 爆炸：命中的目標全額，周圍半徑內的打六成（和遊戲相同）
        hurt(t, p.skill.hit.power, run)
        for (const d of radiusTargets(enemies(), t.x, t.z, p.p.radius)) if (d !== t) hurt(d, p.skill.hit.power * 0.6, { ...run, target: d })
      } else hurt(t, p.skill.hit.power, run)
      continue
    }
    const dx = t.x - p.x
    const dz = t.z - p.z
    const d = Math.hypot(dx, dz) || 1
    p.x += (dx / d) * step
    p.z += (dz / d) * step
    w?.move(p.tracker, p.x, PROJECTILE_Y, p.z)
  }
}

/** 這個技能要打誰：近戰看前方、投射物打遠距木樁、治療找受傷的隊友 */
function pickTarget(skill: DemoSkill) {
  if (skill.hit.shape === 'heal') return lab.dummies.find((d) => d.team === 'ally') ?? null
  if (skill.hit.shape === 'arc') return lab.dummies.find((d) => d.id === 'near') ?? null
  return lab.dummies.find((d) => d.id === 'far') ?? null
}

/** 施放目前的技能；回傳失敗原因 */
export function cast(): string | null {
  const skill = DEMO_SKILLS[lab.skillId]
  const p = lab.params[lab.skillId]
  if (lab.cooldown > 0 && !lab.ignoreCooldown) return '冷卻中'
  const target = pickTarget(skill)
  const c = lab.caster
  if (target && skill.hit.shape !== 'arc') {
    const d = Math.hypot(target.x - c.x, target.z - c.z) - target.radius
    if (d > p.range) {
      say(`目標超出射程（${d.toFixed(1)} m > ${p.range.toFixed(1)} m）`)
      return '超出射程'
    }
  }
  // 面向目標（治療隊友時也轉過去）
  if (target && skill.hit.shape !== 'arc') c.facing = Math.atan2(target.x - c.x, target.z - c.z)
  else c.facing = 0
  lab.cooldown = p.cooldown
  lab.sinceCast = 0
  lab.casts++
  player.play(skill.cast, { skill, p, caster: c, target })
  return null
}

/** 壓力測試：在主角周圍一圈同時施放 n 次（測物件池與效能） */
export function stress(n = 20) {
  const skill = DEMO_SKILLS[lab.skillId]
  const p = lab.params[lab.skillId]
  const target = pickTarget(skill)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 3.2 + (i % 3) * 0.9
    const ghost: Caster = { x: Math.sin(a) * r, z: 3.5 + Math.cos(a) * r, facing: 0, attack: 0, ghost: true }
    const t = skill.hit.shape === 'heal' ? target : skill.hit.shape === 'arc' ? null : target
    ghost.facing = t ? Math.atan2(t.x - ghost.x, t.z - ghost.z) : a + Math.PI
    player.play(skill.cast, { skill, p, caster: ghost, target: t })
  }
  lab.casts += n
}

export function updateLab(dt: number) {
  player.update(dt)
  updateProjectiles(dt)
  lab.cooldown = Math.max(0, lab.cooldown - dt)
  lab.sinceCast += dt
  lab.caster.attack = Math.max(0, lab.caster.attack - dt / 0.4)
  lab.messageTime = Math.max(0, lab.messageTime - dt)
  for (const d of lab.dummies) {
    d.flash = Math.max(0, d.flash - dt)
    d.wobble = Math.max(0, d.wobble - dt * 2.5)
    // 木樁慢慢回血；隊友慢慢掉血，讓治療有數字可以看
    if (d.team === 'enemy') d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.08 * dt)
    else d.hp = Math.max(d.maxHp * 0.2, d.hp - d.maxHp * 0.06 * dt)
  }
  for (const f of lab.floaters) {
    if (f.life <= 0) continue
    f.life -= dt / 0.9
    f.y += dt * 0.9
  }
  if (lab.auto && lab.cooldown <= 0) cast()
}

export const labTimelines = () => player.active
export const labProjectiles = () => lab.projectiles.filter((p) => p.alive).length

export function clearLab() {
  player.clear()
  for (const p of lab.projectiles) {
    if (p.alive) lab.world?.untrack(p.tracker)
    p.alive = false
  }
  lab.world?.clear()
}
