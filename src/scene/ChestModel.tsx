// 寶箱模型（wooden-chest）：沒開時播放待機動作；剛打開時播放開箱動作，停在打開的樣子；讀檔時已開的直接是打開的樣子。
import { Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { LOOT_URLS } from '../data/lootModels'
import { useGame } from '../game/store'
import { LoadBoundary } from './ErrorBoundary'
import { prepareProp, withMeshopt } from './gltf'

/** 原始模型高 0.46 m，放大到和原本的程序化寶箱差不多大 */
const CHEST_SCALE = 1.5

export type ChestState = 'closed' | 'opening' | 'open'

function Model({ state }: { state: ChestState }) {
  const gltf = useLoader(GLTFLoader, LOOT_URLS.chest, withMeshopt)
  const { scene, mixer, clips } = useMemo(() => {
    // 每個寶箱自己一份複製與 AnimationMixer；幾何體與材質共用載入快取
    const scene = prepareProp(gltf.scene).clone(true)
    const mixer = new THREE.AnimationMixer(scene)
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]))
    return { scene, mixer, clips }
  }, [gltf])

  useLayoutEffect(() => {
    mixer.stopAllAction()
    if (state === 'closed') {
      clips.Idle?.reset().play()
      return
    }
    const open = clips.Open
    if (!open) return
    open.reset()
    open.setLoop(THREE.LoopOnce, 1)
    open.clampWhenFinished = true
    open.play()
    // 已經開過的寶箱：直接跳到打開的最後一格
    if (state === 'open') mixer.update(open.getClip().duration)
  }, [state, mixer, clips])

  // 不在卸載時 uncache：開發模式會先模擬一次卸載再重掛，同一組動作還要繼續用（mixer 跟著模型一起回收）

  useFrame((_, dt) => {
    if (!useGame.getState().paused) mixer.update(Math.min(dt, 0.05))
  })

  return <primitive object={scene} scale={CHEST_SCALE} />
}

/** 載入前和失敗時用 fallback（原本的程序化寶箱；打開的寶箱沒有 fallback） */
export function ChestModel({ state, fallback = null }: { state: ChestState; fallback?: ReactNode }) {
  return (
    <LoadBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Model state={state} />
      </Suspense>
    </LoadBoundary>
  )
}
