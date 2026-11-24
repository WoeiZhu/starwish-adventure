// 角色手上的武器與盾牌：優先用武器包的 GLB，載入中或失敗時用程序化武器。
// 只掛到骨頭上，不另外畫東西；弓有「拉弦放箭」動畫，攻擊時播放一次。
import { Suspense, useLayoutEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Appearance } from '../../data/appearance'
import { useGame } from '../../game/store'
import { LoadBoundary } from '../ErrorBoundary'
import { prepareProp, withMeshopt } from '../gltf'
import type { CharacterMotion } from './types'
import { attachModelGear, attachProceduralGear, detachGear, type Hands } from './weapons'

interface GearProps {
  hands: Hands
  appearance: Appearance
  /** 角色模型的整體縮放 */
  scale: number
  armDown: number
  motion?: RefObject<CharacterMotion>
}

function ProceduralGear({ hands, appearance, scale, armDown }: GearProps) {
  useLayoutEffect(() => {
    const list = attachProceduralGear(hands, appearance, scale, armDown)
    return () => detachGear(list)
  }, [hands, appearance, scale, armDown])
  return null
}

function ModelGear({ hands, appearance, scale, armDown, motion }: GearProps) {
  const parts: { url: string; kind: 'weapon' | 'shield' }[] = []
  if (appearance.weaponModel) parts.push({ url: appearance.weaponModel, kind: 'weapon' })
  if (appearance.shieldModel) parts.push({ url: appearance.shieldModel, kind: 'shield' })
  const gltfs = useLoader(
    GLTFLoader,
    parts.map((p) => p.url),
    withMeshopt,
  )
  const anim = useRef<{ mixer: THREE.AnimationMixer; action: THREE.AnimationAction } | null>(null)
  const lastAttack = useRef(0)

  useLayoutEffect(() => {
    const list: THREE.Object3D[] = []
    gltfs.forEach((gltf, i) => {
      const { kind } = parts[i]
      const clone = prepareProp(gltf.scene).clone(true)
      const holder = attachModelGear(hands, appearance, clone, kind, scale, armDown)
      if (!holder) return
      list.push(holder)
      const clip = kind === 'weapon' && appearance.weaponClip ? gltf.animations.find((c) => c.name === appearance.weaponClip) : undefined
      if (clip) {
        const mixer = new THREE.AnimationMixer(clone)
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = false
        anim.current = { mixer, action }
      }
    })
    return () => {
      if (anim.current) {
        anim.current.mixer.stopAllAction()
        anim.current.mixer.uncacheRoot(anim.current.mixer.getRoot())
        anim.current = null
      }
      // 幾何體、材質、貼圖是載入快取裡的共用資源，不釋放
      detachGear(list)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltfs, hands, appearance, scale, armDown])

  useFrame((_, dtRaw) => {
    const a = anim.current
    if (!a || useGame.getState().paused) return
    // 出手時 attack 會跳到 1 再遞減：偵測到跳升就重播一次拉弦放箭
    const atk = motion?.current?.attack ?? 0
    if (atk > lastAttack.current + 0.2) a.action.reset().setEffectiveTimeScale(1.8).play()
    lastAttack.current = atk
    a.mixer.update(Math.min(dtRaw, 0.05))
  })
  return null
}

export function Gear(props: GearProps) {
  const { weaponModel, shieldModel } = props.appearance
  if (!weaponModel && !shieldModel) return <ProceduralGear {...props} />
  const fallback = <ProceduralGear {...props} />
  return (
    <LoadBoundary key={`${weaponModel}|${shieldModel}`} fallback={fallback}>
      <Suspense fallback={fallback}>
        <ModelGear {...props} />
      </Suspense>
    </LoadBoundary>
  )
}
