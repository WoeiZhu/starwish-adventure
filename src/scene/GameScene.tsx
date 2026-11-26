// 3D 場景層入口：光照、世界、主角、NPC、史萊姆與相機。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ENEMY_SLOTS } from '../game/combat/state'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { updatePortals } from '../game/travel'
import { isTouch } from '../systems/mobile'
import { CameraRig } from './CameraRig'
import { CombatLayer } from './CombatLayer'
import { Interactables } from './Interactables'
import { MoveMarker, Player } from './Player'
import { SkillVfx, skillVfxRef } from './SkillVfx'
import { Enemy } from './Enemy'
import { Town } from './Town'
import { TownVistaFrame } from './town2/TownMaps'
import { Vista } from './Vista'
import { World } from './World'

/** 每幀檢查主角有沒有走進城門（進城／出城） */
function Portals() {
  useFrame(() => updatePortals())
  return null
}

const SKY = '#d6eefa'

/** 陽光與陰影範圍跟著主角移動，讓大地圖也有清楚的影子 */
function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const quality = useGame((s) => s.quality)
  // 省電模式用較小的陰影貼圖；換尺寸要丟掉舊貼圖讓它重建
  useEffect(() => {
    const size = quality === 'high' ? 2048 : 1024 // 中／低畫質：陰影貼圖 1024
    const shadow = sun.current.shadow
    if (shadow.mapSize.x === size) return
    shadow.mapSize.set(size, size)
    shadow.map?.dispose()
    shadow.map = null
  }, [quality])
  useEffect(() => {
    const cam = sun.current.shadow.camera
    cam.left = -34
    cam.right = 34
    cam.top = 34
    cam.bottom = -34
    cam.near = 1
    cam.far = 90
    cam.updateProjectionMatrix()
  }, [])
  useFrame(() => {
    const { x, z } = runtime.player
    sun.current.position.set(x + 14, 30, z + 10)
    sun.current.target.position.set(x, 0, z)
    sun.current.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9e3a0', 1.05]} />
      <directionalLight
        ref={sun}
        color="#fff1d6"
        intensity={1.7}
        castShadow
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </>
  )
}

/** 開發模式：把 renderer 與 scene 掛到 window.__sw，自動化測試用來量效能與記憶體 */
function DevHooks() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const sw = (window as unknown as { __sw?: Record<string, unknown> }).__sw
    if (sw) Object.assign(sw, { gl, scene, vfx: skillVfxRef })
  }, [gl, scene])
  return null
}

export function GameScene() {
  const quality = useGame((s) => s.quality)
  const mapId = useGame((s) => s.mapId)
  return (
    <Canvas
      shadows
      flat
      // 解析度倍率上限：低畫質不放大（手機像素密度 3 倍時差很多）、中畫質 1.5、高畫質電腦 2 / 手機 1.5
      dpr={quality === 'saver' ? 1 : quality === 'mid' || isTouch ? [1, 1.5] : [1, 2]}
      camera={{ fov: 40, near: 0.1, far: 400, position: [0, 6, 16] }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 55, 150]} />
      <Lighting />
      {/* 同一時間只掛一張地圖：離開的那張會卸下並釋放資源 */}
      {mapId === 'overworld' ? <World /> : <Town />}
      {/* 天空與遠景山脈兩張地圖共用，一直掛著；新版城鎮裡轉到和主線世界一致的方位 */}
      {/* 一直掛著（換地圖時不重建，避免資源累積），只切換外層的變換 */}
      <TownVistaFrame inTown={mapId !== 'overworld'}>
        <Vista />
      </TownVistaFrame>
      <Portals />
      <Player />
      <CombatLayer />
      <SkillVfx />
      <MoveMarker />
      <Interactables />
      {Array.from({ length: ENEMY_SLOTS }, (_, i) => (
        <Enemy key={i} slot={i} />
      ))}
      <CameraRig />
      <DevHooks />
    </Canvas>
  )
}
