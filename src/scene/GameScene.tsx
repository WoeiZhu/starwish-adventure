// 3D 場景層入口：光照、世界、主角、NPC、史萊姆與相機。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { ENEMY_SLOTS } from '../game/combat/state'
import { runtime } from '../game/runtime'
import { CameraRig } from './CameraRig'
import { CombatLayer } from './CombatLayer'
import { Interactables } from './Interactables'
import { MoveMarker, Player } from './Player'
import { Enemy } from './Enemy'
import { World } from './World'

const SKY = '#bfe8ff'

/** 陽光與陰影範圍跟著主角移動，讓大地圖也有清楚的影子 */
function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null!)
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
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </>
  )
}

export function GameScene() {
  return (
    <Canvas
      shadows
      flat
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.1, far: 400, position: [0, 6, 16] }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 55, 150]} />
      <Lighting />
      <World />
      <Player />
      <CombatLayer />
      <MoveMarker />
      <Interactables />
      {Array.from({ length: ENEMY_SLOTS }, (_, i) => (
        <Enemy key={i} slot={i} />
      ))}
      <CameraRig />
    </Canvas>
  )
}
