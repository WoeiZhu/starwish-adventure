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

/** 手部骨頭在靜止姿勢下（模型空間）的朝向與縮放：要在骨架開始動之前取得 */
export interface HandRest {
  bone: THREE.Object3D
  quat: THREE.Quaternion
  scale: number
}
export interface Hands {
  right?: HandRest
  left?: HandRest
}

/** 複製出骨架後、還沒套用任何動作時呼叫（scene 本身不能有位移旋轉） */
export function captureHands(scene: THREE.Object3D): Hands {
  scene.updateMatrixWorld(true)
  const get = (name: string): HandRest | undefined => {
    const bone = scene.getObjectByName(name)
    if (!bone) return undefined
    return { bone, quat: bone.getWorldQuaternion(new THREE.Quaternion()), scale: bone.getWorldScale(new THREE.Vector3()).x || 1 }
  }
  return { right: get('RightHand'), left: get('LeftHand') }
}

/** 掛點：哪隻手、武器在模型空間的朝向（待機手臂放下後）、手臂放下的方向 */
interface Mount {
  hand: 'right' | 'left'
  quat: THREE.Quaternion
  /** 右手（-X 側）待機時繞 Z 轉 +armDown，左手轉 -armDown */
  side: 1 | -1
}
// 武器的朝向：每把武器的原點是握把，+Y 指向武器前端，+Z 是正面（武器包的 GLB 也照這個規格）
const MOUNTS: Record<Exclude<Appearance['weapon'], 'none'>, Mount> = {
  sword: { hand: 'right', quat: orient([-0.55, 0.12, 1], [1, 0.3, 0]), side: 1 },
  staff: { hand: 'right', quat: orient([-0.05, 1, 0.22], [0, 0, 1]), side: 1 },
  wand: { hand: 'right', quat: orient([0, 0.75, 0.8], [0, 0, 1]), side: 1 },
  bow: { hand: 'left', quat: orient([0.05, 1, 0.1], [0, 0, 1]), side: -1 },
}
const SHIELD_MOUNT: Mount = { hand: 'left', quat: orient([0, 1, 0], [1, 0, 0.3]), side: -1 }

/**
 * 把武器掛到骨頭上。
 * 待機時手臂會繞 Z 軸放下：武器朝向先反向補償，手臂放下後才會是設計的角度。
 */
function attach(hands: Hands, mount: Mount, gear: THREE.Object3D, modelScale: number, armDown: number) {
  const hand = hands[mount.hand]
  if (!hand) return false
  const comp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -armDown * mount.side)
  // 物件原本的旋轉（例如弓的修正）放在最內層：骨頭反轉 × 手臂補償 × 掛點朝向 × 原本旋轉
  const own = gear.quaternion.clone()
  gear.quaternion.copy(hand.quat).invert().multiply(comp).multiply(mount.quat).multiply(own)
  // 骨架有 0.01 縮放、模型又會整體放大：換算回世界單位
  gear.scale.setScalar(1 / (hand.scale * modelScale))
  hand.bone.add(gear)
  return true
}

/** 依外觀設定掛上程序化武器（武器模型載入前或失敗時用）；回傳掛上的物件，卸下時交給 detachGear */
export function attachProceduralGear(hands: Hands, a: Appearance, modelScale: number, armDown: number) {
  const out: THREE.Object3D[] = []
  const accent = a.weaponTint ?? a.outfit.accent
  const build = { sword, staff, wand, bow } as const
  if (a.weapon !== 'none') {
    const g = build[a.weapon](accent)
    if (attach(hands, MOUNTS[a.weapon], g, modelScale, armDown)) out.push(g)
  }
  if (a.armor) {
    const g = shield(a.outfit.primary, a.outfit.accent)
    if (attach(hands, SHIELD_MOUNT, g, modelScale, armDown)) out.push(g)
  }
  for (const g of out) g.userData.ownMaterials = true
  return out
}

/** 武器包的弓是 XY 平面、往 -X 鼓起；轉成和程序化弓一樣往 +Z 鼓起 */
const BOW_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)

/**
 * 掛上武器包的模型（已複製好的場景）；kind 為 'shield' 時掛到左手當盾牌。
 * 外面包一層：模型自己的根節點變換（和動畫）保持不動，修正旋轉與縮放放在外層。
 */
export function attachModelGear(hands: Hands, a: Appearance, gear: THREE.Object3D, kind: 'weapon' | 'shield', modelScale: number, armDown: number) {
  const mount = kind === 'shield' ? SHIELD_MOUNT : a.weapon === 'none' ? undefined : MOUNTS[a.weapon]
  if (!mount) return undefined
  const holder = new THREE.Group()
  if (kind === 'weapon' && a.weapon === 'bow') holder.quaternion.copy(BOW_FIX)
  holder.add(gear)
  return attach(hands, mount, holder, modelScale, armDown) ? holder : undefined
}

/** 卸下武器；程序化武器的材質是自己建立的，一起釋放（幾何體共用，不釋放） */
export function detachGear(list: THREE.Object3D[]) {
  for (const g of list) {
    g.removeFromParent()
    if (!g.userData.ownMaterials) continue
    g.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose()
    })
  }
}
