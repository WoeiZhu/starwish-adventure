// 戰鬥特效繪製：把 game/combat/fx.ts 的粒子與形狀畫出來（全部用物件池）。
// 場景是明亮的粉彩色，加亮混合會看不見，所以用一般混合：粒子靠縮小消失，形狀靠透明度淡出。
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PARTICLE_MAX, SHAPE_MAX, particles, shapes } from '../game/combat/fx'

const PARTICLE_GEO = new THREE.OctahedronGeometry(1, 0)
const RING_GEO = new THREE.RingGeometry(0.86, 1, 48)
const SLASH_GEO = new THREE.RingGeometry(0.5, 1, 28, 1, -1.15, 2.3)
const PILLAR_GEO = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0)
const FLASH_GEO = new THREE.SphereGeometry(1, 16, 12)
const GEO = { ring: RING_GEO, slash: SLASH_GEO, pillar: PILLAR_GEO, flash: FLASH_GEO }

function Particles() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() }), [])
  useFrame(() => {
    const mesh = ref.current
    const { m, c, q, s, p } = tmp
    for (let i = 0; i < PARTICLE_MAX; i++) {
      const pt = particles[i]
      if (pt.life <= 0) {
        m.makeScale(0, 0, 0)
      } else {
        const k = pt.life / pt.dur
        const size = pt.size * Math.min(1, k * 2.2) // 接近結束時縮小消失
        p.set(pt.x, pt.y, pt.z)
        if (pt.streak) s.set(size * 0.45, size * 9, size * 0.45)
        else s.setScalar(size)
        m.compose(p, q, s)
        c.setRGB(pt.r, pt.g, pt.b)
        mesh.setColorAt(i, c)
      }
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[PARTICLE_GEO, undefined, PARTICLE_MAX]} frustumCulled={false} renderOrder={15}>
      <meshBasicMaterial fog={false} />
    </instancedMesh>
  )
}

function Shapes() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    for (let i = 0; i < SHAPE_MAX; i++) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const sh = shapes[i]
      mesh.visible = sh.life > 0
      if (!mesh.visible) continue
      const t = 1 - sh.life / sh.dur // 0 → 1
      const ease = 1 - (1 - t) * (1 - t)
      const size = sh.s0 + (sh.s1 - sh.s0) * ease
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.set(sh.color)
      mesh.geometry = GEO[sh.kind]
      mesh.position.set(sh.x, sh.y, sh.z)
      if (sh.kind === 'ring') {
        mesh.rotation.set(-Math.PI / 2, 0, 0)
        mesh.scale.setScalar(size)
        mat.opacity = (1 - t) * 0.95
      } else if (sh.kind === 'slash') {
        // 弧形刀光：平放在腰部高度，隨時間由右往左掃過並擴大
        mesh.rotation.set(-Math.PI / 2, sh.rot - Math.PI / 2 + (0.5 - t) * 1.6, 0, 'YXZ')
        mesh.scale.setScalar(size)
        mat.opacity = (1 - t * t) * 0.8
      } else if (sh.kind === 'pillar') {
        mesh.rotation.set(0, t * 3, 0)
        mesh.scale.set(sh.s0 * (1 - t * 0.6), sh.s1 * (0.3 + 0.7 * ease), sh.s0 * (1 - t * 0.6))
        mat.opacity = (1 - t) * 0.55
      } else {
        mesh.rotation.set(0, 0, 0)
        mesh.scale.setScalar(size)
        mat.opacity = (1 - t) * 0.6
      }
    }
  })
  return (
    <>
      {Array.from({ length: SHAPE_MAX }, (_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={RING_GEO} visible={false} renderOrder={14}>
          <meshBasicMaterial
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </>
  )
}

export function CombatFx() {
  return (
    <>
      <Particles />
      <Shapes />
    </>
  )
}
