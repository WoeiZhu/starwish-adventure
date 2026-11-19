// GLB 骨架人物：載入 Character/ 的模型，並以程式驅動骨頭做待機 / 行走 / 跑步。
// 模型本身只有靜止姿勢（沒有動畫片段），所以動作在這裡依移動速度即時計算。
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { RUN_SPEED, WALK_SPEED } from '../../game/runtime'
import { useGame } from '../../game/store'
import type { CharacterModelProps } from './types'
import { attachGear, disposeGear } from './weapons'

/** 模型原始高度約 1.25，放大到與場景比例一致的 1.4 */
const TARGET_HEIGHT = 1.4
/** 模型是張開手臂的 A 字站姿，待機時把手臂往下放的角度（弧度） */
const ARM_DOWN = 0.5

const BONES = [
  'Hips',
  'Spine02',
  'Spine',
  'Head',
  'LeftArm',
  'RightArm',
  'LeftForeArm',
  'RightForeArm',
  'LeftUpLeg',
  'RightUpLeg',
  'LeftLeg',
  'RightLeg',
] as const
type BoneName = (typeof BONES)[number]

interface BoneRig {
  bone: THREE.Object3D
  rest: THREE.Quaternion
  /** 靜止時骨頭在模型空間的朝向，用來把「模型空間的旋轉」換算成骨頭本地旋轉 */
  world: THREE.Quaternion
  worldInv: THREE.Quaternion
}

const _e = new THREE.Euler()
const _d = new THREE.Quaternion()
const _q = new THREE.Quaternion()

/** 讓骨頭相對靜止姿勢，繞模型空間的 X（左右軸）/ Y / Z（前後軸）旋轉 */
function pose(r: BoneRig | undefined, x: number, y: number, z: number) {
  if (!r) return
  _d.setFromEuler(_e.set(x, y, z, 'XYZ'))
  _q.copy(r.worldInv).multiply(_d).multiply(r.world)
  r.bone.quaternion.copy(r.rest).multiply(_q)
}

export function GlbCharacter({ appearance, motion }: CharacterModelProps) {
  const gltf = useLoader(GLTFLoader, appearance.modelUrl!)

  const model = useMemo(() => {
    const scene = cloneSkinned(gltf.scene)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const height = box.max.y - box.min.y || 1
    const scale = TARGET_HEIGHT / height
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false // 骨架動畫會讓原始包圍盒失準
    })
    const rig = {} as Partial<Record<BoneName, BoneRig>>
    for (const name of BONES) {
      const bone = scene.getObjectByName(name)
      if (!bone) continue
      const world = bone.getWorldQuaternion(new THREE.Quaternion())
      rig[name] = { bone, rest: bone.quaternion.clone(), world, worldInv: world.clone().invert() }
    }
    // 模型本身沒有武器：依職業在手部骨頭掛上程序化武器
    attachGear(scene, appearance, scale, ARM_DOWN)
    const hips = rig.Hips?.bone
    const hipsRestY = hips?.position.y ?? 0
    // 骨架節點有 0.01 縮放：把世界單位換算成 Hips 的本地單位
    const hipsUnit = hips?.parent ? 1 / hips.parent.getWorldScale(new THREE.Vector3()).y : 1
    return { scene, scale, offsetY: -box.min.y * scale, rig, hipsRestY, hipsUnit }
  }, [gltf, appearance])

  const anim = useRef({ t: Math.random() * 10, phase: 0, move: 0, run: 0 })

  useFrame((_, dtRaw) => {
    if (useGame.getState().paused) return
    const dt = Math.min(dtRaw, 0.05)
    const s = anim.current
    const { rig } = model
    s.t += dt
    const speed = motion?.current?.speed ?? 0
    const k = 1 - Math.exp(-dt * 10)
    s.move += (THREE.MathUtils.clamp(speed / WALK_SPEED, 0, 1) - s.move) * k
    s.run += (THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1) - s.run) * k
    if (s.move > 0.03) s.phase += dt * THREE.MathUtils.lerp(8, 12.5, s.run)

    const sw = Math.sin(s.phase)
    const idle = 1 - s.move
    const breath = Math.sin(s.t * 2.2)
    const legAmp = THREE.MathUtils.lerp(0.55, 0.95, s.run) * s.move
    const armAmp = THREE.MathUtils.lerp(0.5, 1.0, s.run) * s.move
    const lean = (0.05 + 0.2 * s.run) * s.move
    // 攻擊：右手往前上方揮出再收回
    const hit = Math.sin(THREE.MathUtils.clamp(motion?.current?.attack ?? 0, 0, 1) * Math.PI)

    // 腿：前後擺動（繞 X 軸負向 = 往前），後擺時小腿彎曲
    pose(rig.LeftUpLeg, -sw * legAmp, 0, 0)
    pose(rig.RightUpLeg, sw * legAmp, 0, 0)
    pose(rig.LeftLeg, Math.max(0, -sw) * legAmp * 1.1 + 0.15 * s.move, 0, 0)
    pose(rig.RightLeg, Math.max(0, sw) * legAmp * 1.1 + 0.15 * s.move, 0, 0)

    // 手臂：與腿反向擺動，跑步時手肘彎曲
    pose(rig.LeftArm, sw * armAmp + breath * 0.03 * idle, 0, -ARM_DOWN - breath * 0.02 * idle)
    pose(rig.RightArm, -sw * armAmp + breath * 0.03 * idle - 2.3 * hit, 0, ARM_DOWN * (1 - 0.8 * hit) + breath * 0.02 * idle)
    const elbow = -(0.25 + 0.75 * s.run) * s.move
    pose(rig.LeftForeArm, elbow, 0, 0)
    pose(rig.RightForeArm, elbow - 0.5 * hit, 0, 0)

    // 身體：前傾、左右微晃、呼吸；頭部保持抬起並輕微擺動
    pose(rig.Spine02, lean + breath * 0.012 * idle + 0.2 * hit, sw * 0.08 * s.move + 0.55 * hit, 0)
    pose(rig.Spine, breath * 0.015 * idle, -sw * 0.05 * s.move, 0)
    pose(rig.Head, -lean * 0.7 + Math.sin(s.t * 1.1) * 0.03 * idle, 0, Math.sin(s.t * 0.8) * 0.045 * idle)

    const hips = rig.Hips
    if (hips) {
      pose(hips, 0, 0, sw * 0.04 * s.move)
      const bob = Math.abs(Math.cos(s.phase)) * 0.03 * s.move * (1 + s.run) + breath * 0.005 * idle
      hips.bone.position.y = model.hipsRestY + bob * model.hipsUnit
    }
  })

  // 外觀切換時釋放複製出來的骨架
  useEffect(
    () => () => {
      disposeGear(model.scene)
      model.scene.traverse((o) => {
        const sk = o as THREE.SkinnedMesh
        if (sk.isSkinnedMesh) sk.skeleton.dispose()
      })
    },
    [model],
  )

  return <primitive object={model.scene} scale={model.scale} position={[0, model.offsetY, 0]} />
}
