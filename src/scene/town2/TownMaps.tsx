// 新版城鎮接進遊戲：
//   - TownInterior：城鎮地圖（取代原本整座城一個 GLB 的 Town）
//   - TownShell：主線世界南方街道盡頭的城外外觀（同一份配置表旋轉 180°）
//   - TownVistaFrame：城裡看到的遠景（山脈、遠方地標）轉到和主線世界一致的方位
import { Suspense, useCallback, useEffect, type ReactNode } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { LAYOUT, TOWN_EXIT, TOWN_PORTAL, WORLD_GATE_VOLUME } from '../../data/town'
import { MODULE_DIMS, WORLD_GATE, type ModuleId } from '../../data/townLayout'
import { useGame } from '../../game/store'
import { townLoadFailed } from '../../game/travel'
import { inTown, setMapLoading } from '../../world/maps'
import { LoadBoundary } from '../ErrorBoundary'
import { handleGroundClick } from '../groundClick'
import { PortalRing } from '../Town'
import { TownView, moduleUrl } from './TownView'

const ALL: ModuleId[] = Object.keys(MODULE_DIMS) as ModuleId[]
/** 離開城鎮時清掉載入快取（主線世界的城外外觀會再用到遠景版本，不清那些） */
function clearTownCache() {
  for (const a of ALL) useLoader.clear(GLTFLoader, moduleUrl(a, false))
}

/** 城門的位置換算：城鎮本地 → 主線世界（旋轉 180°） */
function shellTransform() {
  const L = LAYOUT!
  const gx = L.gate?.x ?? L.arch?.x ?? 0
  const gz = L.gate?.z ?? L.arch?.z ?? 0
  return { position: [WORLD_GATE.x + gx, 0, WORLD_GATE.z + gz] as [number, number, number], rotation: [0, Math.PI, 0] as [number, number, number] }
}

export function TownInterior() {
  const quality = useGame((s) => s.quality)
  const ready = useCallback(() => setMapLoading(false), [])
  // 真正離開城鎮時才釋放快取（開發模式會先模擬一次卸載再重掛，那時還在城裡）
  useEffect(() => () => void (!inTown() && clearTownCache()), [])
  return (
    <>
      <LoadBoundary
        onError={() => {
          clearTownCache()
          townLoadFailed()
        }}
      >
        <Suspense fallback={null}>
          <TownView layout={LAYOUT!} mode="interior" quality={quality} onGroundClick={handleGroundClick} onReady={ready} />
        </Suspense>
      </LoadBoundary>
      <PortalRing {...TOWN_EXIT} />
    </>
  )
}

export function TownShell() {
  const quality = useGame((s) => s.quality)
  const t = TOWN_PORTAL.trigger
  const tf = shellTransform()
  return (
    <>
      <group {...tf}>
        <LoadBoundary>
          <Suspense fallback={null}>
            <TownView layout={LAYOUT!} mode="shell" quality={quality} gateVolume={WORLD_GATE_VOLUME} />
          </Suspense>
        </LoadBoundary>
      </group>
      <PortalRing {...t} />
    </>
  )
}

/** 城裡的遠景：主線世界座標 → 城鎮本地座標（旋轉 180°） */
export function TownVistaFrame({ children, inTown }: { children: ReactNode; inTown: boolean }) {
  const L = LAYOUT
  const on = !!L && inTown
  const gx = L?.gate?.x ?? L?.arch?.x ?? 0
  const gz = L?.gate?.z ?? L?.arch?.z ?? 0
  return (
    <group position={on ? [WORLD_GATE.x + gx, 0, WORLD_GATE.z + gz] : [0, 0, 0]} rotation={[0, on ? Math.PI : 0, 0]}>
      {children}
    </group>
  )
}
