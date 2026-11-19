// 含動畫片段的人物模型（村莊引導員、商人）：待機播放 Idle，有移動速度時切換 Walk / Run。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RUN_SPEED, WALK_SPEED } from '../../game/runtime'
import { useGame } from '../../game/store'
import { crossFade, useClipModel } from './clipModel'
import type { CharacterModelProps } from './types'

/** 與 GlbCharacter 相同的人物高度，NPC 站在一起比例才一致 */
const TARGET_HEIGHT = 1.4

export function ClipCharacter({ appearance, motion }: CharacterModelProps) {
  const model = useClipModel(appearance.clipModelUrl!, TARGET_HEIGHT)
  const cur = useRef<THREE.AnimationAction | undefined>(undefined)

  useEffect(() => {
    const idle = model.actions.Idle
    if (!idle) return
    idle.reset().play()
    idle.time = Math.random() * idle.getClip().duration // 多個 NPC 不要同步呼吸
    cur.current = idle
  }, [model])

  useFrame((_, dtRaw) => {
    if (useGame.getState().paused) return
    const speed = motion?.current?.speed ?? 0
    const want = speed > RUN_SPEED * 0.8 ? 'Run' : speed > 0.3 ? 'Walk' : 'Idle'
    const next = model.actions[want]
    if (next && cur.current !== next) {
      crossFade(cur.current, next)
      cur.current = next
    }
    const base = want === 'Run' ? RUN_SPEED : WALK_SPEED
    model.mixer.timeScale = want === 'Idle' ? 1 : THREE.MathUtils.clamp(speed / base, 0.6, 1.6)
    model.mixer.update(Math.min(dtRaw, 0.05))
  })

  return <primitive object={model.scene} scale={model.scale} position={[0, model.offsetY, 0]} />
}
