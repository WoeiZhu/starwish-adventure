// 怪物顯示：每個槽位對應戰鬥模擬中的第 N 隻怪物，依階級換成對應的 GLB 模型並播放自帶動作。
//   普通 → 星芽史萊姆 / 精英 → 森林菁英哥布林 / Boss → 星核石像
// 位置、等級、狀態都由 Unit 決定，這裡只負責外觀與動作。載入中或失敗時退回程序化史萊姆。
import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { modelUrl } from '../data/appearance'
import { enemyAt, hero } from '../game/combat/state'
import type { Unit } from '../game/combat/types'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { ModelBoundary } from './characters/CharacterModel'
import { addPose, crossFade, useClipModel } from './characters/clipModel'
import { Slime } from './Slime'

type Kind = 'slime' | 'goblin' | 'guardian'

interface KindConfig {
  url: string
  /** 等級 1 時的顯示高度 */
  height: number
  /** 血條在頭上的額外高度 */
  barGap: number
  /** 死亡動作播完前保持顯示的秒數 */
  deathHold: number
  /** 攻擊表現秒數；有 attackClip 時播放模型片段（從 from 秒開始、倍速 speed），否則由程式揮拳 */
  attackTime: number
  attackClip?: { from: number; speed: number }
}

const CONFIG: Record<Kind, KindConfig> = {
  slime: {
    url: modelUrl('slime.glb'),
    height: 0.77,
    barGap: 0.3,
    deathHold: 1.3,
    attackTime: 0.8,
    attackClip: { from: 0, speed: 1.6 },
  },
  goblin: {
    url: modelUrl('elite-goblin.glb'),
    height: 1.5,
    barGap: 0.3,
    deathHold: 2.2,
    // 模型的 Attack 片段長 7.3 秒且會位移，不適合戰鬥節奏，改用程式揮拳
    attackTime: 0.5,
  },
  guardian: {
    url: modelUrl('guardian-boss.glb'),
    height: 3.0,
    barGap: 0.35,
    deathHold: 2.2,
    // Attack 片段 3.5 秒：1.0～2.7 秒是蓄力、雙拳前擊、收招，取這段並加速
    attackTime: 0.77,
    attackClip: { from: 1.0, speed: 2.2 },
  },
}

/** 外觀模型：Boss 是石像、精英是大哥布林，普通怪依種族（史萊姆或小哥布林） */
function kindOf(u: Unit): Kind {
  if (u.tier === 'boss') return 'guardian'
  if (u.tier === 'elite') return 'goblin'
  return u.species === 'goblin' ? 'goblin' : 'slime'
}

/** 普通哥布林比精英小一圈 */
const GOBLIN_NORMAL_SCALE = 0.72

/** 等級越高怪物越大（與 state.ts 的 setEnemyLevel 同一公式）；再乘上種族與階級的體型 */
const levelFactor = (u: Unit) => (1 + (u.baseLevel - 1) * 0.12) * (u.tier === 'normal' && u.species === 'goblin' ? GOBLIN_NORMAL_SCALE : 1)

/** 血條位置：頭頂上方 */
export function enemyBarTop(u: Unit) {
  const c = CONFIG[kindOf(u)]
  return c.height * levelFactor(u) + c.barGap
}

const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')
const RAGE = new THREE.Color('#ff3b3b')
const TINT_AMOUNT = 0.5

function EnemyView({ slot, kind }: { slot: number; kind: Kind }) {
  const cfg = CONFIG[kind]
  const m = useClipModel(cfg.url, cfg.height)
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const st = useRef({
    id: '',
    shown: 0,
    alive: true,
    cur: undefined as THREE.AnimationAction | undefined,
    atk: 0,
    hit: 0,
    side: 1,
    prevAtk: 0,
    prevSquash: 0,
    color: '',
  })

  const play = (name: string, fade = 0.2, once = false) => {
    const s = st.current
    const next = m.actions[name]
    if (!next || s.cur === next) return
    if (once) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity)
    }
    crossFade(s.cur, next, fade)
    next.timeScale = 1
    s.cur = next
  }

  useFrame((_, dtRaw) => {
    if (useGame.getState().paused) return
    const u = enemyAt(slot)
    const s = st.current
    const dt = Math.min(dtRaw, 0.05)
    if (!u) {
      root.current.visible = false
      return
    }
    const alive = u.alive

    // 槽位換成另一隻怪物（舊的被移除）：動作歸零
    if (u.id !== s.id) {
      s.id = u.id
      m.mixer.stopAllAction()
      s.cur = undefined
      s.alive = alive
      s.atk = 0
      s.hit = 0
      s.prevAtk = u.attackAnim
      s.prevSquash = u.squash
      s.color = ''
      play(alive ? 'Idle' : 'Death', 0, !alive)
    }
    // 倒下播死亡動作；重生時回到待機
    if (alive !== s.alive) {
      s.alive = alive
      s.atk = 0
      s.hit = 0
      if (alive) {
        m.mixer.stopAllAction()
        s.cur = undefined
        play('Idle', 0)
      } else {
        play('Death', 0.1, true)
      }
    }

    // 死亡時先播完動作再縮小消失，重生或生成時再長出來
    const show = alive || u.deadTime < cfg.deathHold
    s.shown += ((show ? 1 : 0) - s.shown) * (1 - Math.exp(-dt * (show ? 5 : 12)))
    root.current.visible = s.shown > 0.02
    if (!root.current.visible) return
    root.current.position.set(u.x, 0, u.z)
    root.current.rotation.y = u.facing
    root.current.scale.setScalar(s.shown * levelFactor(u))

    if (alive) {
      // 出手：攻擊倒數由 1 開始，偵測到重新拉高就是新的一擊
      if (u.attackAnim > s.prevAtk + 0.3) {
        s.atk = cfg.attackTime
        s.side = -s.side
        if (cfg.attackClip) {
          play('Attack', 0.08, true)
          const a = m.actions.Attack
          if (a) {
            a.time = cfg.attackClip.from
            a.timeScale = cfg.attackClip.speed
          }
        }
      }
      // 受擊：史萊姆播受擊動作（人形用下面的後仰）
      if (kind === 'slime' && u.squash > s.prevSquash + 0.5 && s.atk <= 0) {
        play('Hit', 0.05, true)
        if (m.actions.Hit) m.actions.Hit.timeScale = 1.5
        s.hit = 0.65
      }
      s.atk = Math.max(0, s.atk - dt)
      s.hit = Math.max(0, s.hit - dt)

      if (s.atk <= 0 && s.hit <= 0) {
        // 移動中走路 / 跑步（跳躍），停下來待機
        const sp = u.speed
        let want = 'Idle'
        let ts = 1
        if (kind === 'slime') {
          if (sp > 0.3) {
            want = 'Hop'
            ts = THREE.MathUtils.clamp(0.7 + sp / 3.5, 0.8, 1.8)
          }
        } else if (sp > 2.6) {
          want = 'Run'
          ts = THREE.MathUtils.clamp(sp / 3.6, 0.8, 1.5)
        } else if (sp > 0.3) {
          want = 'Walk'
          ts = THREE.MathUtils.clamp(sp / 1.5, 0.6, 1.5)
        }
        play(want)
        if (s.cur) s.cur.timeScale = ts
      }
    }
    s.prevAtk = u.attackAnim
    s.prevSquash = u.squash

    // 暈眩時幾乎凍結動作
    m.mixer.timeScale = alive && u.stun > 0 ? 0.1 : 1
    m.mixer.update(dt)

    // 哥布林出拳與人形受擊後仰：在動作之上疊加骨頭旋轉與整體位移
    let lunge = 0
    let recoil = 0
    if (kind !== 'slime' && alive) {
      recoil = Math.sin(u.squash * Math.PI) * 0.12
      if (kind === 'goblin' && s.atk > 0) {
        const swing = Math.sin((1 - s.atk / cfg.attackTime) * Math.PI)
        const arm = s.side > 0 ? 'RightArm' : 'LeftArm'
        const fore = s.side > 0 ? 'RightForeArm' : 'LeftForeArm'
        addPose(m.bones[arm], -1.6 * swing, 0, 0)
        addPose(m.bones[fore], -0.3 * swing, 0, 0)
        addPose(m.bones.Spine02, 0.15 * swing, 0.5 * swing * s.side, 0)
        lunge = 0.3 * swing
      }
    }
    if (kind === 'guardian' && alive && s.atk > 0) lunge = 0.2 * Math.sin((1 - s.atk / cfg.attackTime) * Math.PI)
    body.current.position.z = lunge - recoil
    body.current.rotation.x = -recoil

    // 受擊閃白；狂暴時泛紅；史萊姆依個體染色
    const flashing = u.hitFlash > 0
    const emissive = flashing ? WHITE : u.enraged ? RAGE : BLACK
    const intensity = flashing ? 0.7 : u.enraged ? 0.35 : 0
    const retint = kind === 'slime' && s.color !== u.color
    if (retint) s.color = u.color
    for (const mat of m.materials) {
      mat.emissive.copy(emissive)
      mat.emissiveIntensity = intensity
      if (retint) mat.color.copy(WHITE).lerp(new THREE.Color(u.color), TINT_AMOUNT)
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const g = useGame.getState()
    const u = enemyAt(slot)
    if (g.phase !== 'playing' || g.paused || g.dialog || !u?.alive || e.nativeEvent.button !== 0) return
    // 點擊怪物：鎖定並自動走到攻擊距離
    hero().targetId = u.id
    runtime.approach = true
    runtime.marker.life = 0
  }

  return (
    <group ref={root} visible={false} onClick={onClick}>
      <group ref={body}>
        <primitive object={m.scene} scale={m.scale} position={[0, m.offsetY, 0]} />
      </group>
    </group>
  )
}

export function Enemy({ slot }: { slot: number }) {
  const [kind, setKind] = useState<Kind>('slime')

  // 槽位的怪物階級改變（例如精英、Boss 出現）時換模型
  useFrame(() => {
    const u = enemyAt(slot)
    if (!u) return
    const want = kindOf(u)
    if (want !== kind) setKind(want)
  })

  const fallback = <Slime slot={slot} />
  return (
    <ModelBoundary fallback={fallback} resetKey={kind}>
      <Suspense fallback={fallback}>
        <EnemyView key={kind} slot={slot} kind={kind} />
      </Suspense>
    </ModelBoundary>
  )
}
