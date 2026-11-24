// 遊戲裡播放技能時間軸：
// - 動作 → 設定單位的攻擊動作（attackAnim，GLB 有動畫片段時用 actionClip 的名稱）
// - 特效 → 放進 vfxBus，由畫面層播放
// - 命中 / 發射 → 呼叫施放時傳進來的函式（命中判定與傷害在 actions.ts）
// - 音效 → 主角附近才播
import { DEMO_SKILLS, type DemoSkill, type DemoSkillId } from '../../skills/demoSkills'
import { playSfx } from '../../skills/sfxNames'
import { vfxBus } from '../../vfx/bus'
import { anchorFromCaster, type CueName } from '../../vfx/cues'
import { TimelinePlayer, type TimelineEvent } from '../../vfx/timeline'
import { runtime } from '../runtime'
import type { Unit } from './types'

interface Pos {
  x: number
  z: number
}

interface Run {
  skill: DemoSkill
  caster: Unit
  /** 目標（單位或固定位置）；命中反應時是被打中的位置 */
  target: Pos | null
  onHit?: () => void
  onLaunch?: () => void
}

/** 離主角太遠的特效與音效不播（畫面外，省效能） */
const VFX_RANGE = 34
const SFX_RANGE = 24
const near = (p: Pos, r: number) => Math.hypot(p.x - runtime.player.x, p.z - runtime.player.z) < r

function dispatch(ev: TimelineEvent, run: Run) {
  const u = run.caster
  switch (ev.kind) {
    case 'anim':
      u.attackAnim = 1
      if (ev.name) {
        u.actionClip = ev.name
        u.actionSeq++
      }
      break
    case 'vfx': {
      const at = ev.where === 'target' && run.target ? run.target : null
      if (!near(at ?? u, VFX_RANGE)) break
      const p = run.skill.params
      const pos = at ? { x: at.x, y: 0.7, z: at.z } : anchorFromCaster(u.x, u.z, u.facing, p.offset)
      vfxBus.push({ cue: ev.name as CueName, skill: run.skill.id, x: pos.x, y: pos.y, z: pos.z, facing: u.facing })
      break
    }
    case 'sfx':
      if (near(u, SFX_RANGE)) playSfx(ev.name)
      break
    case 'hit':
      run.onHit?.()
      break
    case 'launch':
      run.onLaunch?.()
      break
  }
}

const player = new TimelinePlayer<Run>(dispatch, 96)

/** 施放技能時間軸 */
export function playSkill(id: DemoSkillId, caster: Unit, target: Pos | null, h: { onHit?: () => void; onLaunch?: () => void } = {}) {
  player.play(DEMO_SKILLS[id].cast, { skill: DEMO_SKILLS[id], caster, target, ...h })
}

/** 命中反應（每個被打中的目標一次）：只有特效與音效 */
export function playImpact(id: DemoSkillId, caster: Unit, at: Pos) {
  player.play(DEMO_SKILLS[id].impact, { skill: DEMO_SKILLS[id], caster, target: { x: at.x, z: at.z } })
}

export function updateSkillRuns(dt: number) {
  // 施放者倒下或被暈眩：還沒到的命中與發射取消
  player.cancel((r) => !r.caster.alive || r.caster.stun > 0)
  player.update(dt)
}

export function clearSkillRuns() {
  player.clear()
}

export const skillRunStats = () => ({ active: player.active })
