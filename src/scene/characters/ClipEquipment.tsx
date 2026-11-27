// 自帶動作人物的換裝：掛點已在 Blender 校正，不改手腕、不重複附加原本武器。
import { Suspense, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ClipEquipment as Equipment } from '../../data/weaponModels'
import { LoadBoundary } from '../ErrorBoundary'
import { prepareProp, withMeshopt } from '../gltf'

function EquipmentParts({ scene, equipment }: { scene: THREE.Object3D; equipment: Equipment }) {
  const gltfs = useLoader(GLTFLoader, equipment.parts.map((p) => p.url), withMeshopt)
  const key = equipment.id + equipment.parts.map((p) => `${p.socket}:${p.url}`).join('|')
  useLayoutEffect(() => {
    const sockets = equipment.parts.map((part) => {
      const socket = scene.getObjectByName(part.socket)
      if (!socket) throw new Error(`武器掛點缺少：${part.socket}`)
      return socket
    })
    const holders: THREE.Group[] = []
    equipment.parts.forEach((part, i) => {
      const socket = sockets[i]
      const holder = new THREE.Group()
      holder.name = `equipment:${equipment.id}:${part.socket}`
      holder.userData.weaponModuleId = equipment.id
      holder.userData.equipmentSocket = part.socket
      holder.userData.equipmentUrl = part.url
      holder.add(prepareProp(gltfs[i].scene).clone(true))
      socket.add(holder)
      holders.push(holder)
    })
    return () => {
      // 複製物件共用 loader 快取中的幾何與材質；僅卸除實例。
      for (const holder of holders) holder.removeFromParent()
    }
    // 同階換裝不因外觀物件重建而反覆掛載。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, gltfs, key])
  return null
}

export function ClipEquipment({ scene, equipment }: { scene: THREE.Object3D; equipment: Equipment }) {
  const key = equipment.id + equipment.parts.map((p) => p.url).join('|')
  return <LoadBoundary key={key}><Suspense fallback={null}><EquipmentParts scene={scene} equipment={equipment} /></Suspense></LoadBoundary>
}
