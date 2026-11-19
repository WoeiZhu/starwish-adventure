// 程序化武器：GLB 模型本身沒有武器，這裡建立各職業的武器並掛到手部骨頭上。
// 每把武器的原點是握把位置，+Y 是武器指向的方向，+Z 是正面。
import * as THREE from 'three'
import type { Appearance } from '../../data/appearance'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14)
const SPH = new THREE.SphereGeometry(1, 16, 12)
const CONE = new THREE.ConeGeometry(1, 1, 12)
const OCTA = new THREE.OctahedronGeometry(1)
const TORUS = new THREE.TorusGeometry(1, 0.16, 8, 20)
const BOW_ARC = new THREE.TorusGeometry(0.38, 0.022, 8, 24, Math.PI)
const SHIELD = new THREE.CylinderGeometry(1, 1, 1, 24)

type V3 = [number, number, number]

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: string,
  pos: V3,
  scale: V3 | number,
  rot?: V3,
  glow = false,
) {
  const mat = new THREE.MeshToonMaterial({ color, emissive: glow ? color : '#000000', emissiveIntensity: glow ? 0.6 : 0 })
  const m = new THREE.Mesh(geo, mat)
  m.position.set(...pos)
  if (typeof scale === 'number') m.scale.setScalar(scale)
  else m.scale.set(...scale)
  if (rot) m.rotation.set(...rot)
  m.castShadow = true
  parent.add(m)
  return m
}

function sword(accent: string) {
  const g = new THREE.Group()
  part(g, CYL, '#6b4a34', [0, 0, 0], [0.024, 0.16, 0.024])
  part(g, SPH, accent, [0, -0.1, 0], 0.04)
  part(g, BOX, accent, [0, 0.1, 0], [0.24, 0.04, 0.06])
  part(g, BOX, '#eef3f8', [0, 0.42, 0], [0.085, 0.6, 0.022])
  part(g, BOX, '#bcd0e6', [0, 0.42, 0], [0.025, 0.58, 0.028])
  part(g, CONE, '#eef3f8', [0, 0.77, 0], [0.043, 0.1, 0.011])
  return g
}

function staff(accent: string) {
  const g = new THREE.Group()
  part(g, CYL, '#8a5a3c', [0, 0.18, 0], [0.024, 1.2, 0.024])
  part(g, TORUS, accent, [0, 0.86, 0], 0.11)
  part(g, SPH, '#ff7ec4', [0, 0.86, 0], 0.075, undefined, true)
  part(g, CONE, accent, [0, 1.0, 0], [0.03, 0.09, 0.03])
  return g
}

function wand(accent: string) {
  const g = new THREE.Group()
  part(g, CYL, '#fff4e2', [0, 0.16, 0], [0.02, 0.44, 0.02])
  part(g, CYL, accent, [0, -0.02, 0], [0.028, 0.08, 0.028])
  part(g, OCTA, accent, [0, 0.45, 0], 0.085, undefined, true)
  part(g, TORUS, '#fff1a8', [0, 0.45, 0], 0.12, undefined, true)
  return g
}

function bow(accent: string) {
  const g = new THREE.Group()
  // 弓身在 YZ 平面、往 +Z（前方）鼓起，握把在原點
  const arc = new THREE.Group()
  arc.position.set(0, 0, -0.38)
  arc.rotation.set(0, Math.PI / 2, Math.PI / 2)
  part(arc, BOW_ARC, '#8a5a3c', [0, 0, 0], 1)
  g.add(arc)
  part(g, CYL, '#ffffff', [0, 0, -0.38], [0.006, 0.76, 0.006])
  part(g, CYL, accent, [0, 0, 0], [0.03, 0.14, 0.03])
  part(g, SPH, accent, [0, 0.38, -0.38], 0.03)
  part(g, SPH, accent, [0, -0.38, -0.38], 0.03)
  return g
}

function shield(primary: string, accent: string) {
  const g = new THREE.Group()
  // 盾面朝 +Z
  part(g, SHIELD, accent, [0, 0, 0], [0.3, 0.04, 0.3], [Math.PI / 2, 0, 0])
  part(g, SHIELD, primary, [0, 0, 0.012], [0.26, 0.04, 0.26], [Math.PI / 2, 0, 0])
  part(g, SPH, accent, [0, 0, 0.04], [0.08, 0.08, 0.04])
  return g
}

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _m = new THREE.Matrix4()

/** 由「武器指向」與「正面方向」組出模型空間的朝向 */
function orient(dir: V3, front: V3) {
  _y.set(...dir).normalize()
  _x.crossVectors(_y, _z.set(...front)).normalize()
  _z.crossVectors(_x, _y).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z))
}

/**
 * 把武器掛到骨頭上。
 * @param armTilt 待機時手臂繞 Z 軸放下的角度（武器朝向要先反向補償，放下後才會是設計的角度）
 */
function attach(bone: THREE.Object3D | undefined, gear: THREE.Object3D, modelQuat: THREE.Quaternion, armTilt: number, modelScale: number) {
  if (!bone) return
  const boneQuat = bone.getWorldQuaternion(new THREE.Quaternion())
  const boneScale = bone.getWorldScale(new THREE.Vector3()).x || 1
  const comp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -armTilt)
  gear.quaternion.copy(boneQuat.invert()).multiply(comp).multiply(modelQuat)
  // 骨架有 0.01 縮放、模型又會整體放大：換算回世界單位
  gear.scale.setScalar(1 / (boneScale * modelScale))
  gear.userData.gear = true
  bone.add(gear)
}

/** 依外觀設定在手部骨頭掛上武器；armDown 為待機時手臂放下的弧度 */
export function attachGear(scene: THREE.Object3D, a: Appearance, modelScale: number, armDown: number) {
  const right = scene.getObjectByName('RightHand')
  const left = scene.getObjectByName('LeftHand')
  const accent = a.weaponTint ?? a.outfit.accent
  // 右手（-X 側）待機時繞 Z 轉 +armDown，左手轉 -armDown
  switch (a.weapon) {
    case 'sword':
      attach(right, sword(accent), orient([-0.55, 0.12, 1], [1, 0.3, 0]), armDown, modelScale)
      break
    case 'staff':
      attach(right, staff(accent), orient([-0.05, 1, 0.22], [0, 0, 1]), armDown, modelScale)
      break
    case 'wand':
      attach(right, wand(accent), orient([0, 0.75, 0.8], [0, 0, 1]), armDown, modelScale)
      break
    case 'bow':
      attach(left, bow(accent), orient([0.05, 1, 0.1], [0, 0, 1]), -armDown, modelScale)
      break
  }
  if (a.armor) attach(left, shield(a.outfit.primary, a.outfit.accent), orient([0, 1, 0], [1, 0, 0.3]), -armDown, modelScale)
}

/** 釋放武器的材質（幾何體為共用，不釋放） */
export function disposeGear(scene: THREE.Object3D) {
  scene.traverse((o) => {
    if (!o.userData.gear) return
    o.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose()
    })
  })
}
