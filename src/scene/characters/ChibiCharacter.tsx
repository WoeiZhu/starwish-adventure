import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGame } from '../../game/store'
import { RUN_SPEED, WALK_SPEED } from '../../game/runtime'
import type { Appearance } from '../../data/appearance'
import type { CharacterModelProps } from './types'
import { createFaceTextures } from './chibiFace'
import * as G from './chibiGeometry'

type V3 = [number, number, number]
const SIDES = [-1, 1] as const
const CREAM = '#fff5e5'
const GOLD = '#f5cf77'

function tint(color: string, target: string, amount: number) {
  return `#${new THREE.Color(color).lerp(new THREE.Color(target), amount).getHexString()}`
}

interface PartProps {
  geometry?: THREE.BufferGeometry
  color: string
  position?: V3
  scale?: V3 | number
  rotation?: V3
  outline?: boolean
  glow?: boolean
}

function Part({ geometry = G.sphere, color, position, scale, rotation, outline, glow }: PartProps) {
  const outlinePosition = useMemo(() => {
    if (!outline) return undefined
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3())
    return center.multiplyScalar(-0.018).toArray() as V3
  }, [geometry, outline])
  return (
    <group position={position} scale={scale} rotation={rotation}>
      {outline && (
        <mesh scale={1.018} position={outlinePosition}>
          <primitive object={geometry} attach="geometry" />
          <meshBasicMaterial color="#50404f" side={THREE.BackSide} toneMapped={false} />
        </mesh>
      )}
      <mesh castShadow>
        {/* Primitives keep shared geometry out of R3F's automatic disposal. */}
        <primitive object={geometry} attach="geometry" />
        <meshToonMaterial color={color} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.24 : 0} />
      </mesh>
    </group>
  )
}

function Ribbon({ color }: { color: string }) {
  return (
    <group>
      <Part geometry={G.ribbonLoop} color={color} />
      <Part geometry={G.ribbonLoop} color={color} rotation={[0, 0, Math.PI]} />
      <Part color={color} scale={[0.027, 0.027, 0.023]} />
    </group>
  )
}

function Weapon({ kind, accent }: { kind: Appearance['weapon']; accent: string }) {
  if (kind === 'bow') {
    return (
      <group position={[0.106, -0.013, 0.015]} rotation={[0, 0, -0.12]} scale={[-1, 1, 1]}>
        <Part geometry={G.bow} color="#86533e" />
        <Part geometry={G.cylinder} color={CREAM} scale={[0.0025, 0.552, 0.0025]} />
        <Part geometry={G.limb} color={accent} position={[0.106, 0, 0]} scale={[0.022, 0.04, 0.022]} />
        {SIDES.map(side => <Part color={accent} key={side} position={[0.02, side * 0.25, 0]} scale={0.023} />)}
      </group>
    )
  }
  if (kind === 'sword') {
    return (
      <group rotation={[1.65, 0, -0.12]}>
        <Part geometry={G.cylinder} color="#6d4c58" scale={[0.023, 0.125, 0.023]} />
        <Part color={accent} position={[0, -0.077, 0]} scale={0.032} />
        <Part geometry={G.limb} color={accent} position={[0, 0.077, 0]} scale={[0.022, 0.072, 0.022]} rotation={[0, 0, Math.PI / 2]} />
        <Part geometry={G.blade} color="#ecf4ff" position={[0, 0.099, 0]} />
        <Part geometry={G.blade} color="#b5c9e5" position={[0.012, 0.105, 0.012]} scale={[0.27, 0.92, 0.15]} />
      </group>
    )
  }
  if (kind === 'staff') {
    return (
      <group position={[0, 0, 0.018]} rotation={[0.06, 0, 0.45]}>
        <Part geometry={G.cylinder} color="#92614e" position={[0, 0.125, 0]} scale={[0.018, 0.8, 0.018]} />
        <Part geometry={G.cylinder} color={accent} position={[0, -0.25, 0]} scale={[0.023, 0.075, 0.023]} />
        <Part geometry={G.ring} color={accent} position={[0, 0.555, 0]} scale={0.084} />
        <Part geometry={G.gem} color="#e9b5ff" position={[0, 0.555, 0]} scale={[0.052, 0.068, 0.043]} glow />
        <Part color={accent} position={[0, 0.465, 0]} scale={0.029} />
      </group>
    )
  }
  if (kind === 'wand') {
    return (
      <group position={[-0.034, 0, 0.045]} rotation={[0.28, 0, 0.28]}>
        <Part geometry={G.cylinder} color={CREAM} position={[0, 0.09, 0]} scale={[0.014, 0.28, 0.014]} />
        <Part geometry={G.cylinder} color={accent} position={[0, 0.005, 0]} scale={[0.019, 0.075, 0.019]} />
        <Part geometry={G.star} color={accent} position={[0, 0.275, 0]} glow />
        <Part color="#fff6cd" position={[0, 0.275, 0.022]} scale={0.021} />
      </group>
    )
  }
  return null
}

function Headgear({ appearance: a }: { appearance: Appearance }) {
  const accent = a.outfit.accent
  if (a.headgear === 'witchHat') {
    return (
      <group position={[0, 0.244, -0.022]} rotation={[-0.1, 0, -0.09]}>
        <Part geometry={G.hatBrim} color={a.outfit.secondary} />
        <Part geometry={G.hatCrown} color={a.outfit.primary} />
        <Part geometry={G.cylinder} color={accent} position={[0, 0.034, 0]} scale={[0.184, 0.046, 0.184]} />
        <Part geometry={G.star} color={accent} position={[0.015, 0.092, 0.17]} scale={0.55} rotation={[-0.3, 0, 0.1]} />
      </group>
    )
  }
  if (a.headgear === 'featherBand') {
    return (
      <group>
        <Part geometry={G.ring} color={a.outfit.secondary} position={[0, 0.1, -0.005]} scale={[0.304, 0.283, 0.24]} rotation={[Math.PI / 2, 0, 0]} />
        <group position={[-0.286, 0.096, -0.025]} rotation={[-0.24, 0, 0.3]}>
          <Part geometry={G.feather} color={CREAM} />
          <Part geometry={G.cylinder} color={accent} position={[0.008, 0.088, 0.012]} scale={[0.003, 0.182, 0.003]} rotation={[0, 0, -0.12]} />
          <Part color={accent} scale={[0.035, 0.037, 0.025]} position={[0, 0.012, 0.023]} />
        </group>
      </group>
    )
  }
  if (a.headgear === 'halo') {
    return <Part geometry={G.ring} color={accent} position={[0, 0.414, 0]} scale={[0.176, 0.176, 0.125]} rotation={[Math.PI / 2 + 0.1, 0, 0]} glow />
  }
  if (a.headgear === 'flower') {
    return (
      <group position={[0.236, 0.168, 0.191]} rotation={[0, 0.4, -0.2]}>
        {[0, 1, 2, 3, 4].map(i => {
          const angle = i * Math.PI * 2 / 5
          return <Part key={i} color={CREAM} position={[Math.cos(angle) * 0.036, Math.sin(angle) * 0.036, 0]} scale={[0.029, 0.029, 0.012]} />
        })}
        <Part color={GOLD} position={[0, 0, 0.014]} scale={[0.023, 0.023, 0.015]} />
      </group>
    )
  }
  return null
}

export function ChibiCharacter({ appearance: a, motion }: CharacterModelProps) {
  const body = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const tailL = useRef<THREE.Group>(null)
  const tailR = useRef<THREE.Group>(null)
  const face = useRef<THREE.MeshBasicMaterial>(null!)
  const girl = a.gender === 'girl'
  const textures = useMemo(() => createFaceTextures(a.eye, a.hair, girl), [a.eye, a.hair, girl])
  useEffect(() => () => {
    textures.open.dispose()
    textures.closed.dispose()
  }, [textures])
  const sheen = useMemo(() => tint(a.hair, '#fff2dc', 0.22), [a.hair])
  const anim = useRef({ time: Math.random() * 10, phase: 0, move: 0, run: 0, blink: 2.5, closed: 0 })

  // One animation callback; no React renders or geometry work per frame.
  useFrame((_, rawDt) => {
    if (useGame.getState().paused) return
    const dt = Math.min(rawDt, 0.05)
    const state = anim.current
    const speed = motion?.current?.speed ?? 0
    const blend = 1 - Math.exp(-dt * 10)
    state.time += dt
    state.move += (THREE.MathUtils.clamp(speed / WALK_SPEED, 0, 1) - state.move) * blend
    state.run += (THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1) - state.run) * blend
    state.phase += dt * THREE.MathUtils.lerp(8.5, 13.5, state.run) * state.move
    const swing = Math.sin(state.phase)
    const amplitude = THREE.MathUtils.lerp(0.52, 0.9, state.run) * state.move
    const idle = 1 - state.move
    const breath = Math.sin(state.time * 2.2)
    legL.current.rotation.x = swing * amplitude
    legR.current.rotation.x = -swing * amplitude
    armL.current.rotation.x = -swing * amplitude * (a.weapon === 'bow' || a.armor ? 0.35 : 0.7) + breath * 0.025 * idle
    armR.current.rotation.x = swing * amplitude * (a.weapon === 'none' ? 0.7 : 0.28) - 0.08 * state.move
    // Move all parts together so hips and legs stay attached during the bob.
    body.current.position.y = 0.004 + breath * 0.004 * idle + Math.abs(swing) * 0.032 * state.move * (1 + state.run * 0.5)
    body.current.rotation.x = (0.045 + 0.13 * state.run) * state.move
    body.current.rotation.z = swing * 0.025 * state.move
    head.current.rotation.x = -body.current.rotation.x * 0.75 + Math.sin(state.time * 1.2) * 0.018 * idle
    head.current.rotation.z = Math.sin(state.time * 0.85) * 0.035 * idle

    state.blink -= dt
    if (state.blink <= 0) {
      state.closed = 0.13
      state.blink = 2.4 + Math.random() * 3.2
    }
    state.closed = Math.max(0, state.closed - dt)
    const expression = state.closed > 0 ? textures.closed : textures.open
    if (face.current.map !== expression) face.current.map = expression

    for (const side of SIDES) {
      const tail = side > 0 ? tailL.current : tailR.current
      if (tail) {
        const lag = Math.sin(state.phase - 0.7) * 0.1 * state.move
        const targetX = 0.28 * state.move * (1 + state.run) + lag + Math.sin(state.time * 1.7 + side) * 0.035 * idle
        tail.rotation.x = THREE.MathUtils.damp(tail.rotation.x, targetX, 8, dt)
        tail.rotation.z = THREE.MathUtils.damp(tail.rotation.z, side * (0.045 + breath * 0.02 + Math.cos(state.phase - 0.5) * 0.045 * state.move), 8, dt)
      }
    }
  })

  const { skin, hair, outfit, shoes } = a
  return (
    <group ref={body} position={[0, 0.004, 0]}>
      {/* 0.56-unit head / ~1.4-unit silhouette; boot soles sit on y=0. */}
      {SIDES.map(side => (
        <group key={side} ref={side > 0 ? legL : legR} position={[side * 0.092, 0.451, 0]}>
          <Part geometry={G.limb} color={girl ? CREAM : skin} position={[0, -0.181, 0]} scale={[0.055, 0.095, 0.055]} />
          {!girl && <Part geometry={G.limb} color={outfit.secondary} position={[0, -0.045, 0]} scale={[0.078, 0.054, 0.076]} />}
          <group position={[0, -0.455, 0]}>
            <Part geometry={G.boot} color={shoes} />
            <Part color={shoes} position={[0, 0.061, 0.038]} scale={[0.08, 0.061, 0.113]} />
            <Part color={tint(shoes, '#483947', 0.3)} position={[0, 0.02, 0.04]} scale={[0.081, 0.02, 0.114]} />
            <Part geometry={G.cylinder} color={outfit.accent} position={[0, 0.18, 0]} scale={[0.069, 0.022, 0.069]} />
            <Part geometry={G.box} color={outfit.accent} position={[0, 0.11, 0.07]} scale={[0.028, 0.025, 0.012]} />
          </group>
        </group>
      ))}

      {a.armor && <Part geometry={G.cape} color={outfit.primary} position={[0, 0, -0.173]} rotation={[-0.12, 0, 0]} />}
      <Part geometry={G.torso} color={outfit.primary} outline />
      {girl ? (
        <>
          <Part geometry={G.skirt} color={outfit.secondary} outline />
          <Part geometry={G.hem} color={outfit.accent} />
        </>
      ) : <Part geometry={G.tunicHem} color={outfit.primary} />}
      <Part geometry={G.belt} color={outfit.accent} />
      <Part geometry={G.box} color={GOLD} position={[0, 0.562, 0.162]} scale={[0.057, 0.043, 0.018]} />
      <Part geometry={G.box} color={outfit.secondary} position={[0, 0.562, 0.173]} scale={[0.032, 0.021, 0.008]} />
      <Part geometry={G.collar} color={CREAM} position={[0, 0.779, 0.006]} />
      <Part color={outfit.accent} position={[0, 0.724, 0.157]} scale={[0.024, 0.03, 0.014]} />
      {[0.65, 0.604].map(y => <Part key={y} color={outfit.accent} position={[0, y, 0.15]} scale={0.01} />)}
      <Part geometry={G.cylinder} color={skin} position={[0, 0.836, 0]} scale={[0.068, 0.114, 0.068]} />

      {a.weapon === 'bow' && (
        <group position={[-0.09, 0.662, -0.19]} rotation={[0, 0, -0.24]}>
          <Part geometry={G.cylinder} color="#88604d" scale={[0.058, 0.255, 0.058]} />
          <Part geometry={G.ring} color={outfit.accent} position={[0, 0.119, 0]} scale={0.06} rotation={[Math.PI / 2, 0, 0]} />
          {[-0.023, 0.02].map((x, i) => (
            <group key={x} position={[x, 0.17 + i * 0.018, 0]}>
              <Part geometry={G.cylinder} color={CREAM} scale={[0.005, 0.2, 0.005]} />
              <Part geometry={G.feather} color={i === 0 ? CREAM : outfit.accent} position={[0, 0.028, 0]} scale={0.3} />
            </group>
          ))}
        </group>
      )}

      {SIDES.map(side => (
        <group key={side} ref={side > 0 ? armL : armR} position={[side * 0.178, 0.742, 0]}>
          <group rotation={[0, 0, side * 0.22]}>
            <Part geometry={G.limb} color={outfit.primary} position={[0, -0.068, 0]} scale={[0.073, 0.055, 0.073]} />
            <Part geometry={G.limb} color={skin} position={[0, -0.171, 0.003]} scale={[0.046, 0.05, 0.046]} />
            <Part geometry={G.cylinder} color={outfit.accent} position={[0, -0.128, 0]} scale={[0.056, 0.027, 0.056]} />
            <Part color={skin} position={[0, -0.236, 0.008]} scale={[0.053, 0.057, 0.049]} />
            {a.armor && <Part color="#e1e8f2" position={[0, -0.005, 0]} scale={[0.104, 0.064, 0.105]} outline />}
            <group position={[0, -0.236, 0.008]}>
              <Weapon kind={side > 0 ? (a.weapon === 'bow' ? 'bow' : 'none') : (a.weapon === 'bow' ? 'none' : a.weapon)} accent={outfit.accent} />
              {a.armor && side > 0 && (
                <group position={[0.077, 0.025, 0.064]} rotation={[0, 0.38, 0]}>
                  <Part color={outfit.accent} scale={[0.165, 0.174, 0.04]} />
                  <Part color={outfit.primary} position={[0, 0, 0.022]} scale={[0.143, 0.151, 0.033]} />
                  <Part geometry={G.star} color={outfit.accent} position={[0, 0, 0.057]} scale={0.8} />
                  <Part color="#fff4d0" position={[0, 0, 0.075]} scale={0.02} />
                </group>
              )}
            </group>
          </group>
        </group>
      ))}

      <group ref={head} position={[0, 1.074, 0]}>
        <Part color={skin} scale={[0.304, 0.28, 0.27]} outline />
        {SIDES.map(side => (
          <group key={side} position={[side * 0.299, -0.033, 0.002]}>
            <Part color={skin} scale={[0.043, 0.058, 0.042]} />
            <Part color={tint(skin, '#e99d9f', 0.42)} position={[side * 0.026, 0, 0.026]} scale={[0.016, 0.03, 0.012]} />
          </group>
        ))}
        <mesh renderOrder={1}>
          <primitive object={G.facePatch} attach="geometry" />
          <meshBasicMaterial ref={face} map={textures.open} transparent alphaTest={0.008} depthWrite={false} toneMapped={false} />
        </mesh>
        <Part geometry={G.hairCap} color={hair} />
        {G.bangs.map((geometry, i) => <Part key={i} geometry={geometry} color={hair} />)}
        <Part geometry={G.hairSheen} color={sheen} />
        {SIDES.map(side => (
          <group key={side} scale={[side, 1, 1]}>
            <Part geometry={G.sideLock} color={hair} scale={[1, girl ? 1 : 0.72, 1]} />
          </group>
        ))}
        {girl ? SIDES.map(side => (
          <group key={side} ref={side > 0 ? tailL : tailR} position={[side * 0.294, 0.068, -0.118]}>
            <group scale={[side, 1, 1]}>
              <Part geometry={G.twinTail} color={hair} />
              <Part geometry={G.tailSheen} color={sheen} />
              <group position={[0.015, -0.012, 0.063]} rotation={[0, 0, -0.2]}>
                <Ribbon color={outfit.accent} />
              </group>
            </group>
          </group>
        )) : a.headgear !== 'witchHat' && G.tufts.map((geometry, i) => <Part key={i} geometry={geometry} color={hair} />)}
        <Headgear appearance={a} />
      </group>
    </group>
  )
}
