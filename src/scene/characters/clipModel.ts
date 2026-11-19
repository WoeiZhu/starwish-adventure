// 內含動畫片段的 GLB（新增五個角色）：載入、複製骨架、縮放到指定高度，並建立 AnimationMixer。
// 與 GlbCharacter 不同：這裡直接播放模型自帶的 Idle / Walk / Run / Attack / Hit / Death 片段。
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

export interface ClipModel {
  scene: THREE.Object3D
  /** 模型縮放（把原始高度換成指定高度） */
  scale: number
  /** 讓腳底貼地所需的 Y 位移 */
  offsetY: number
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  /** 每個實例各自一份材質，才能獨立做受擊閃白與染色 */
  materials: THREE.MeshStandardMaterial[]
  /** 靜止姿勢下的骨頭資料（程式疊加動作用），無骨架的模型為空 */
  bones: Record<string, BoneRest>
}

export interface BoneRest {
  bone: THREE.Object3D
  /** 靜止時骨頭在模型空間的朝向 */
  world: THREE.Quaternion
  worldInv: THREE.Quaternion
}

const OVERLAY_BONES = ['RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm', 'Spine02', 'Spine', 'Head']

export function useClipModel(url: string, height: number): ClipModel {
  const gltf = useLoader(GLTFLoader, url)

  const model = useMemo<ClipModel>(() => {
    const scene = cloneSkinned(gltf.scene)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const scale = height / (box.max.y - box.min.y || 1)

    const materials: THREE.MeshStandardMaterial[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false // 骨架動畫會讓原始包圍盒失準
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      mesh.material = mat
      materials.push(mat)
    })

    const bones: Record<string, BoneRest> = {}
    for (const name of OVERLAY_BONES) {
      const bone = scene.getObjectByName(name)
      if (!bone) continue
      const world = bone.getWorldQuaternion(new THREE.Quaternion())
      bones[name] = { bone, world, worldInv: world.clone().invert() }
    }

    const mixer = new THREE.AnimationMixer(scene)
    const actions: Record<string, THREE.AnimationAction> = {}
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)

    return { scene, scale, offsetY: -box.min.y * scale, mixer, actions, materials, bones }
  }, [gltf, height])

  useEffect(
    () => () => {
      // 不能在這裡 stop / uncache mixer：開發模式會先模擬一次卸載再重掛，同一個 model 還要繼續用
      for (const m of model.materials) m.dispose()
      model.scene.traverse((o) => {
        const sk = o as THREE.SkinnedMesh
        if (sk.isSkinnedMesh) sk.skeleton.dispose()
      })
    },
    [model],
  )

  return model
}

const _e = new THREE.Euler()
const _d = new THREE.Quaternion()
const _q = new THREE.Quaternion()

/** 在目前動作的姿勢上疊加一個「模型空間」的旋轉（X 左右軸、Y 上下軸、Z 前後軸）。要在 mixer.update 之後呼叫。 */
export function addPose(r: BoneRest | undefined, x: number, y: number, z: number) {
  if (!r) return
  _d.setFromEuler(_e.set(x, y, z, 'XYZ'))
  _q.copy(r.worldInv).multiply(_d).multiply(r.world)
  r.bone.quaternion.multiply(_q)
}

/** 從目前動作切換到另一個，淡入淡出 */
export function crossFade(from: THREE.AnimationAction | undefined, to: THREE.AnimationAction, fade = 0.2) {
  to.reset().setEffectiveWeight(1).fadeIn(fade).play()
  from?.fadeOut(fade)
}
