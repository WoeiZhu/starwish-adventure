// 星光鎮場景：整座城鎮一個 GLB（town-environment），外面補一圈草地與遠景。
//   - 模型載入完成才讓主角出現（mapState.loading）；載入失敗退回城門外（travel.townLoadFailed）。
//   - 離開城鎮時釋放這個模型的網格、材質、貼圖，並清掉載入快取（下次進城重新載入）。
//   - 樹葉是 glTF 的 MASK 材質（alphaTest 0.5、雙面），保留原設定，葉片才不會出現灰底。
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { TOWN_ENV_URL, TOWN_EXIT, TOWN_GATE_MATERIAL, TOWN_GATE_VOLUME } from '../data/town'
import { useGame } from '../game/store'
import { townLoadFailed } from '../game/travel'
import { inTown, setMapLoading } from '../world/maps'
import { LoadBoundary } from './ErrorBoundary'
import { disposeScene, prepareStatic, useGateFade, withMeshopt } from './gltf'
import { handleGroundClick } from './groundClick'

export const townStats = { meshes: 0, triangles: 0 }

function TownModel() {
  const quality = useGame((s) => s.quality)
  const gltf = useLoader(GLTFLoader, TOWN_ENV_URL, withMeshopt)
  const scene = gltf.scene

  // 陰影：高畫質時建築與樹投影（省電模式不投影）；全部都接收陰影
  useLayoutEffect(() => {
    Object.assign(townStats, prepareStatic(scene, quality === 'high'))
  }, [scene, quality])

  // 城門擋住鏡頭時淡出（剛進城時鏡頭在主角身後、隔著城門）
  const gateMats = useMemo(() => {
    const out = new Set<THREE.Material>()
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m && !Array.isArray(m) && m.name === TOWN_GATE_MATERIAL) out.add(m)
    })
    return [...out]
  }, [scene])
  useGateFade(gateMats, TOWN_GATE_VOLUME)

  useEffect(() => setMapLoading(false), [])
  // 真正離開城鎮時才釋放（開發模式會先模擬一次卸載再重掛，那時還在城裡，不能釋放）
  useEffect(
    () => () => {
      if (inTown()) return
      disposeScene(scene)
      useLoader.clear(GLTFLoader, TOWN_ENV_URL)
    },
    [scene],
  )

  return <primitive object={scene} onClick={handleGroundClick} />
}

/** 城鎮外圍：一大片草地接到遠景，城牆外不會看到地面的盡頭 */
function OuterGround() {
  return (
    <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[220, 48]} />
      <meshLambertMaterial color="#a9d488" />
    </mesh>
  )
}

/** 地上的出入口標記：城門下一圈淡淡發光的圓 */
export function PortalRing({ x, z, r }: { x: number; z: number; r: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame((state) => {
    mat.current.opacity = 0.32 + Math.sin(state.clock.elapsedTime * 2) * 0.12
  })
  return (
    <mesh position={[x, 0.08, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r * 0.7, r, 40]} />
      <meshBasicMaterial ref={mat} color="#bfe8ff" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  )
}

export function Town() {
  return (
    <>
      <LoadBoundary
        onError={() => {
          useLoader.clear(GLTFLoader, TOWN_ENV_URL)
          townLoadFailed()
        }}
      >
        <Suspense fallback={null}>
          <TownModel />
        </Suspense>
      </LoadBoundary>
      <OuterGround />
      <PortalRing {...TOWN_EXIT} />
    </>
  )
}
