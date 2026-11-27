// 含動畫片段的人物模型（村莊引導員、商人、第二章夥伴）：待機播放 Idle，有移動速度時切換 Walk / Run。
// 隊友（暗殺者、藥師）另外會播 Attack（出手時）、指定的特殊動作（Heal）與 Death（倒下）。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RUN_SPEED, WALK_SPEED } from '../../game/runtime'
import { useGame } from '../../game/store'
import { crossFade, useClipModel } from './clipModel'
import type { CharacterModelProps } from './types'
import { ClipEquipment } from './ClipEquipment'

/** 與 GlbCharacter 相同的人物高度，NPC 站在一起比例才一致 */
const TARGET_HEIGHT = 1.4

export function ClipCharacter({ appearance, motion }: CharacterModelProps) {
  const model = useClipModel(appearance.clipModelUrl!, appearance.clipHeight ?? TARGET_HEIGHT)
  const cur = useRef<THREE.AnimationAction | undefined>(undefined)
  /** 一次性動作（攻擊、治療、倒下）播放中：播完前不切回移動動作 */
  const once = useRef<{ action: THREE.AnimationAction; until: number } | null>(null)
  const prev = useRef({ attack: 0, seq: motion?.current?.actionSeq ?? 0, dead: false })
  const clock = useRef(0)

  useEffect(() => {
    for (const name of appearance.clipHide ?? []) {
      const o = model.scene.getObjectByName(name)
      if (o) o.visible = false
    }
    for (const a of Object.values(model.actions)) {
      if (a.getClip().name === 'Idle' || a.getClip().name === 'Walk' || a.getClip().name === 'Run') continue
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
    }
    const idle = model.actions.Idle
    if (!idle) return
    idle.reset().play()
    idle.time = Math.random() * idle.getClip().duration // 多個 NPC 不要同步呼吸
    cur.current = idle
  }, [model, appearance.clipHide])

  useFrame((_, dtRaw) => {
    if (useGame.getState().paused) return
    const dt = Math.min(dtRaw, 0.05)
    clock.current += dt
    const m = motion?.current
    const speed = m?.speed ?? 0
    const p = prev.current

    // 一次性動作：倒下 > 特殊動作 > 攻擊
    const play = (name: string, seconds?: number) => {
      const a = model.actions[name]
      if (!a) return
      const len = a.getClip().duration
      a.timeScale = seconds ? Math.max(1, len / seconds) : 1
      // 同一個動作連續播放（連續出手）：直接從頭播，不要淡出自己
      if (cur.current === a) a.reset().setEffectiveWeight(1).play()
      else crossFade(cur.current, a, 0.1)
      cur.current = a
      once.current = { action: a, until: clock.current + len / a.timeScale }
    }
    const dead = !!m?.dead
    if (dead && !p.dead) play('Death')
    if (!dead && p.dead) once.current = null // 復活：回到待機
    p.dead = dead
    if (!dead) {
      const seq = m?.actionSeq ?? 0
      if (seq !== p.seq && m?.actionClip) play(m.actionClip)
      p.seq = seq
      const atk = m?.attack ?? 0
      if (atk > p.attack + 0.3) play('Attack', m?.attackTime)
      p.attack = atk
    }

    const busy = dead || (once.current && clock.current < once.current.until)
    if (!busy) {
      once.current = null
      const want = speed > RUN_SPEED * 0.8 ? 'Run' : speed > 0.3 ? 'Walk' : 'Idle'
      const next = model.actions[want]
      if (next && cur.current !== next) {
        crossFade(cur.current, next)
        cur.current = next
      }
      const base = want === 'Run' ? RUN_SPEED : WALK_SPEED
      model.mixer.timeScale = want === 'Idle' ? 1 : THREE.MathUtils.clamp(speed / base, 0.6, 1.6)
    } else model.mixer.timeScale = 1
    model.mixer.update(dt)
  })

  return <>
    <primitive object={model.scene} scale={model.scale} position={[0, model.offsetY, 0]} />
    {appearance.clipEquipment && <ClipEquipment scene={model.scene} equipment={appearance.clipEquipment} />}
  </>
}
