// GLB 載入的共用工具：meshopt 解壓縮、釋放 GPU 資源、擋住鏡頭時淡出。
import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { GateVolume } from '../data/town'
import { runtime } from '../game/runtime'

/** 城門擋在鏡頭和主角之間時，把城門的材質淡出成半透明（離開後恢復） */
export function useGateFade(materials: THREE.Material[], vol: GateVolume) {
  const cur = useRef(1)
  useFrame((state, dtRaw) => {
    const cam = state.camera.position
    const p = runtime.player
    let blocked = false
    // 從主角頭部到鏡頭的線段上取樣
    for (let i = 1; i <= 24 && !blocked; i++) {
      const t = i / 24
      const x = p.x + (cam.x - p.x) * t
      const y = 1 + (cam.y - 1) * t
      const z = p.z + (cam.z - p.z) * t
      blocked = x > vol.minX && x < vol.maxX && z > vol.minZ && z < vol.maxZ && y < vol.maxY
    }
    const want = blocked ? 0.28 : 1
    cur.current += (want - cur.current) * (1 - Math.exp(-Math.min(dtRaw, 0.05) * 8))
    const o = cur.current > 0.995 ? 1 : cur.current
    for (const m of materials) {
      const fading = o < 1
      if (m.transparent !== fading) {
        m.transparent = fading
        m.depthWrite = !fading
        m.needsUpdate = true
      }
      m.opacity = o
    }
  })
}

/** tools/assets 壓縮過的 GLB 用 meshopt 壓網格，載入時要設定解碼器 */
export const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

/** 釋放一個 GLB 場景用到的網格、材質、貼圖 */
export function disposeScene(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v)
      m.dispose()
    }
  })
  for (const t of textures) t.dispose()
}

/**
 * 小道具 GLB（武器、箭、掉落物、寶箱）的共用設定：可選投影；沒有環境貼圖時金屬會變黑，一律當作非金屬。
 * 改的是載入快取裡的原件，所以只做一次；複製出來的物件共用同一份材質。
 */
export function prepareProp<T extends THREE.Object3D>(root: T, castShadow = true): T {
  if (root.userData.propReady) return root
  root.userData.propReady = true
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = castShadow
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if ('metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0
    }
  })
  return root
}

/** 環境模型的共用設定：接收陰影、可選投影；沒有環境貼圖時金屬材質會變黑，一律當作非金屬 */
export function prepareStatic(root: THREE.Object3D, castShadow: boolean) {
  let meshes = 0
  let triangles = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    meshes++
    const idx = mesh.geometry.index
    triangles += (idx ? idx.count : mesh.geometry.getAttribute('position').count) / 3
    mesh.receiveShadow = true
    mesh.castShadow = castShadow
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if ('metalness' in m) (m as THREE.MeshStandardMaterial).metalness = 0
    }
  })
  return { meshes, triangles: Math.round(triangles) }
}
