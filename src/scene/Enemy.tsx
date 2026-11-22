// 怪物顯示：每個槽位對應戰鬥模擬中的第 N 隻怪物，依種族與階級換成對應的 GLB 模型並播放自帶動作。
//   第一章：普通 → 星芽史萊姆 / 小哥布林；精英 → 森林菁英哥布林；Boss → 星核石像
//   第二章：月影幼狼、孢子蘑菇、星晶魔靈、苔蘚靈鹿（同一個模型依階級放大）
// 位置、等級、狀態都由 Unit 決定，這裡只負責外觀與動作。載入中或失敗時退回程序化史萊姆。
import { Suspense, useEffect, useRef, useState } from 'react'
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

type Kind = 'slime' | 'goblin' | 'guardian' | 'wolf' | 'mushroom' | 'crystal' | 'stag'

interface KindConfig {
  url: string
  /** 等級 1、普通階級時的顯示高度 */
  height: number
  /** 血條在頭上的額外高度 */
  barGap: number
  /** 死亡動作播完前保持顯示的秒數 */
  deathHold: number
  /** 攻擊表現秒數；有 attackClip 時播放模型片段（從 from 秒開始、倍速 speed），否則由程式揮拳 */
  attackTime: number
  attackClip?: { name: string; from: number; speed: number }
  /** 移動動作：走路片段、跑步片段（沒有就一直用走路）、切換成跑步的速度 */
  walk: string
  run?: string
  runAt?: number
  /** 走路動作倍速的基準速度 */
  walkRef: number
  /** 被打時播放模型的 Hit 片段（否則用程式做後仰） */
  hitClip: boolean
  /** 依個體顏色染色 */
  tint: boolean
  /** 同一個模型當精英 / Boss 時放大 */
  tierScale: boolean
  /** 特技片段的倍速（u.actionClip 指定播放哪一段） */
  clipSpeed?: Record<string, number>
  /** 模型裡要隱藏的節點（例如自帶的投射物，改由遊戲的光彈表現） */
  hide?: string[]
}

const CONFIG: Record<Kind, KindConfig> = {
  slime: {
    url: modelUrl('slime.glb'),
    height: 0.77,
    barGap: 0.3,
    deathHold: 1.3,
    attackTime: 0.8,
    attackClip: { name: 'Attack', from: 0, speed: 1.6 },
    walk: 'Hop',
    walkRef: 3.5,
    hitClip: true,
    tint: true,
    tierScale: false,
  },
  goblin: {
    url: modelUrl('elite-goblin.glb'),
    height: 1.5,
    barGap: 0.3,
    deathHold: 2.2,
    // 模型的 Attack 片段長 7.3 秒且會位移，不適合戰鬥節奏，改用程式揮拳
    attackTime: 0.5,
    walk: 'Walk',
    run: 'Run',
    runAt: 2.6,
    walkRef: 1.5,
    hitClip: false,
    tint: false,
    tierScale: false,
  },
  guardian: {
    url: modelUrl('guardian-boss.glb'),
    height: 3.0,
    barGap: 0.35,
    deathHold: 2.2,
    // Attack 片段 3.5 秒：1.0～2.7 秒是蓄力、雙拳前擊、收招，取這段並加速
    attackTime: 0.77,
    attackClip: { name: 'Attack', from: 1.0, speed: 2.2 },
    walk: 'Walk',
    run: 'Run',
    runAt: 2.6,
    walkRef: 1.5,
    hitClip: false,
    tint: false,
    tierScale: false,
  },
  wolf: {
    url: modelUrl('moon-wolf.glb'),
    height: 0.8,
    barGap: 0.3,
    deathHold: 1.6,
    attackTime: 0.6,
    attackClip: { name: 'Pounce', from: 0.35, speed: 1.8 },
    walk: 'Walk',
    run: 'Run',
    runAt: 2.4,
    walkRef: 1.6,
    hitClip: true,
    tint: false,
    tierScale: true,
    clipSpeed: { Pounce: 1.3 },
  },
  mushroom: {
    url: modelUrl('spore-mushroom.glb'),
    height: 0.9,
    barGap: 0.3,
    deathHold: 1.6,
    attackTime: 0.8,
    attackClip: { name: 'Bonk', from: 0, speed: 1.5 },
    walk: 'Walk',
    walkRef: 1.4,
    hitClip: true,
    tint: false,
    tierScale: true,
    clipSpeed: { Spore: 1.4 },
    hide: ['AnimatedProjectile'],
  },
  crystal: {
    url: modelUrl('star-crystal.glb'),
    height: 1.15,
    barGap: 0.3,
    deathHold: 1.7,
    attackTime: 0.9,
    attackClip: { name: 'Shoot', from: 0.1, speed: 1.5 },
    walk: 'Float',
    walkRef: 1.4,
    hitClip: true,
    tint: false,
    tierScale: true,
    clipSpeed: { Shoot: 1.5 },
    hide: ['AnimatedProjectile'],
  },
  stag: {
    url: modelUrl('moss-stag.glb'),
    height: 1.6,
    barGap: 0.35,
    deathHold: 1.9,
    attackTime: 0.6,
    attackClip: { name: 'Charge', from: 0.4, speed: 2 },
    walk: 'Walk',
    run: 'Run',
    runAt: 2.8,
    walkRef: 1.6,
    hitClip: true,
    tint: false,
    tierScale: true,
    clipSpeed: { Charge: 1.4, Heal: 1.25 },
  },
}

/** 外觀模型：第一章的精英是大哥布林、Boss 是石像；其餘依種族 */
function kindOf(u: Unit): Kind {
  switch (u.species) {
    case 'wolf':
    case 'mushroom':
    case 'crystal':
    case 'stag':
      return u.species
  }
  if (u.tier === 'boss') return 'guardian'
  if (u.tier === 'elite') return 'goblin'
  return u.species === 'goblin' ? 'goblin' : 'slime'
}

/** 普通哥布林比精英小一圈 */
const GOBLIN_NORMAL_SCALE = 0.72
/** 第二章的怪物：同一個模型當精英、Boss 時放大的倍率 */
const TIER_SCALE = { normal: 1, elite: 1.4, boss: 2 }

/** 等級越高怪物越大（與 state.ts 的 setEnemyLevel 同一公式）；再乘上種族與階級的體型 */
function levelFactor(u: Unit, kind: Kind) {
  let k = 1 + (u.baseLevel - 1) * 0.12
  // 第二章的營地從 6 級起跳：從 6 級開始才慢慢變大，避免幼狼長得比主角還大
  if (CONFIG[kind].tierScale) k = (1 + Math.max(0, u.baseLevel - 6) * 0.05) * TIER_SCALE[u.tier]
  if (u.tier === 'normal' && u.species === 'goblin') k *= GOBLIN_NORMAL_SCALE
  return k
}

/** 血條位置：頭頂上方 */
export function enemyBarTop(u: Unit) {
  const kind = kindOf(u)
  const c = CONFIG[kind]
  return c.height * levelFactor(u, kind) + c.barGap
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
    prevSeq: 0,
    color: '',
  })

  useEffect(() => {
    for (const name of cfg.hide ?? []) {
      const o = m.scene.getObjectByName(name)
      if (o) o.visible = false
    }
  }, [m, cfg])

  const play = (name: string, fade = 0.2, once = false) => {
    const s = st.current
    const next = m.actions[name]
    if (!next) return
    if (s.cur === next && !once) return
    if (once) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity)
    }
    crossFade(s.cur === next ? undefined : s.cur, next, fade)
    next.timeScale = 1
    s.cur = next
  }

  /** 播放一次特技或攻擊片段，回傳實際的播放秒數 */
  const playOnce = (name: string, from: number, speed: number) => {
    const a = m.actions[name]
    if (!a) return 0
    play(name, 0.08, true)
    a.time = from
    a.timeScale = speed
    return (a.getClip().duration - from) / speed
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
      s.prevSeq = u.actionSeq
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
    root.current.scale.setScalar(s.shown * levelFactor(u, kind))

    if (alive) {
      // 特技（撲擊、放毒、衝撞、治療）：模擬端把 actionSeq 加 1
      if (u.actionSeq !== s.prevSeq) {
        s.prevSeq = u.actionSeq
        const sp = cfg.clipSpeed?.[u.actionClip] ?? 1
        const t = playOnce(u.actionClip, 0, sp)
        if (t > 0) s.atk = t
      } else if (u.attackAnim > s.prevAtk + 0.3) {
        // 普攻：攻擊倒數由 1 開始，偵測到重新拉高就是新的一擊
        s.side = -s.side
        if (cfg.attackClip) {
          playOnce(cfg.attackClip.name, cfg.attackClip.from, cfg.attackClip.speed)
          s.atk = cfg.attackTime
        } else s.atk = cfg.attackTime
      }
      // 受擊：有 Hit 片段的模型播受擊動作（人形用下面的後仰）
      if (cfg.hitClip && u.squash > s.prevSquash + 0.5 && s.atk <= 0) {
        play('Hit', 0.05, true)
        if (m.actions.Hit) m.actions.Hit.timeScale = 1.5
        s.hit = 0.55
      }
      s.atk = Math.max(0, s.atk - dt)
      s.hit = Math.max(0, s.hit - dt)

      if (s.atk <= 0 && s.hit <= 0) {
        // 移動中走路 / 跑步，停下來待機
        const sp = u.speed
        let want = 'Idle'
        let ts = 1
        if (cfg.run && cfg.runAt && sp > cfg.runAt) {
          want = cfg.run
          ts = THREE.MathUtils.clamp(sp / (cfg.runAt * 1.4), 0.8, 1.6)
        } else if (sp > 0.3) {
          want = cfg.walk
          ts = THREE.MathUtils.clamp(0.4 + sp / cfg.walkRef, 0.6, 1.8)
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
    if (!cfg.hitClip && alive) {
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
    const retint = cfg.tint && s.color !== u.color
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

  // 槽位的怪物種族或階級改變（例如精英、Boss 出現）時換模型
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
