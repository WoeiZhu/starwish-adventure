import * as THREE from 'three'

type Point = [number, number, number]

// Immutable shapes shared by every character, including the NPC.
export const sphere = new THREE.SphereGeometry(1, 32, 24)
export const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24)
export const box = new THREE.BoxGeometry(1, 1, 1)
export const gem = new THREE.OctahedronGeometry(1)
export const limb = new THREE.CapsuleGeometry(1, 1, 6, 16)
export const ring = new THREE.TorusGeometry(1, 0.1, 8, 40)

function lathe(profile: [number, number][], segments = 40) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments)
}

export const torso = lathe([
  [0, 0.46], [0.14, 0.46], [0.166, 0.48], [0.163, 0.53],
  [0.142, 0.61], [0.157, 0.72], [0.145, 0.78], [0.103, 0.815], [0, 0.815],
])
export const skirt = lathe([
  [0, 0.365], [0.242, 0.365], [0.261, 0.38], [0.265, 0.397],
  [0.246, 0.438], [0.216, 0.493], [0.175, 0.555], [0.149, 0.568], [0, 0.568],
])
export const hem = lathe([
  [0.244, 0.365], [0.26, 0.371], [0.268, 0.386], [0.264, 0.403], [0.251, 0.401],
])
export const tunicHem = lathe([
  [0, 0.448], [0.174, 0.448], [0.189, 0.46], [0.183, 0.49], [0.161, 0.55], [0, 0.55],
])
export const belt = lathe([
  [0.159, 0.544], [0.165, 0.547], [0.165, 0.577], [0.156, 0.583],
])
export const boot = lathe([
  [0, 0.065], [0.064, 0.065], [0.075, 0.09], [0.072, 0.155],
  [0.065, 0.196], [0.056, 0.203], [0, 0.203],
], 24)

// Flattened, tapered sweeps with elliptical cross sections, not strings of beads.
function lock(points: Point[], width: number, depth: number, steps = 28) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)))
  const positions: number[] = []
  const indices: number[] = []
  const sections = 12
  const forward = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const center = curve.getPoint(t)
    const tangent = curve.getTangent(t).normalize()
    const across = new THREE.Vector3().crossVectors(forward, tangent).normalize()
    const normal = new THREE.Vector3().crossVectors(tangent, across).normalize()
    const taper = i === steps ? 0.002 : Math.pow(1 - t, 0.55) * (0.65 + Math.sin(Math.PI * t) * 0.6)
    for (let j = 0; j <= sections; j++) {
      const angle = j / sections * Math.PI * 2
      const vertex = center.clone()
        .addScaledVector(across, Math.cos(angle) * width * taper)
        .addScaledVector(normal, Math.sin(angle) * depth * taper)
      positions.push(vertex.x, vertex.y, vertex.z)
      if (i < steps && j < sections) {
        const a = i * (sections + 1) + j
        const b = a + sections + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeCap() {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const columns = 64
  const rows = 24
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const phi = col / columns * Math.PI * 2
      // High forehead in front; a low, continuous bob at the back.
      const edge = 1.15 + 1.12 * Math.pow((1 - Math.cos(phi)) / 2, 0.65)
      const theta = row / rows * edge
      const x = Math.sin(phi) * Math.sin(theta)
      const y = Math.cos(theta)
      const z = Math.cos(phi) * Math.sin(theta)
      positions.push(x * 0.324, y * 0.307, z * 0.289 - 0.009)
      const normal = new THREE.Vector3(x / 0.324, y / 0.307, z / 0.289).normalize()
      normals.push(normal.x, normal.y, normal.z)
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col
        const b = a + columns + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  return geometry
}

export const hairCap = makeCap()
export const bangs = [
  lock([[-0.16, 0.225, 0.11], [-0.213, 0.184, 0.229], [-0.238, 0.074, 0.227]], 0.066, 0.028),
  lock([[-0.092, 0.255, 0.1], [-0.105, 0.211, 0.229], [-0.137, 0.104, 0.259]], 0.088, 0.03),
  lock([[0.012, 0.266, 0.095], [0.025, 0.213, 0.24], [-0.015, 0.078, 0.281]], 0.083, 0.03),
  lock([[0.1, 0.245, 0.1], [0.173, 0.195, 0.228], [0.227, 0.085, 0.238]], 0.092, 0.028),
]
export const sideLock = lock([
  [0.273, 0.152, 0.089], [0.301, 0.015, 0.098], [0.285, -0.183, 0.11],
], 0.056, 0.053)
export const twinTail = lock([
  [0, 0, 0], [0.078, -0.105, -0.027], [0.11, -0.287, -0.037],
  [0.085, -0.44, 0.005], [0.037, -0.485, 0.034],
], 0.094, 0.078, 36)
export const tailSheen = lock([
  [0.018, -0.052, 0.065], [0.072, -0.16, 0.046], [0.085, -0.3, 0.034],
], 0.009, 0.002)
export const tufts = [
  lock([[-0.103, 0.256, -0.035], [-0.131, 0.322, -0.009], [-0.2, 0.315, 0.031]], 0.064, 0.039),
  lock([[0.013, 0.283, -0.055], [0.069, 0.329, -0.01], [0.117, 0.318, 0.069]], 0.065, 0.035),
  lock([[0.186, 0.169, -0.104], [0.267, 0.193, -0.087], [0.31, 0.16, -0.068]], 0.065, 0.035),
]
export const hairSheen = lock([
  [-0.226, 0.202, 0.171], [-0.127, 0.248, 0.19], [-0.025, 0.26, 0.185], [0.06, 0.254, 0.184],
], 0.013, 0.004)

function extrudeShape(draw: (shape: THREE.Shape) => void, depth: number, bevel: number) {
  const shape = new THREE.Shape()
  draw(shape)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 3, steps: 1, curveSegments: 12,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.computeVertexNormals()
  return geometry
}

export const ribbonLoop = extrudeShape(s => {
  s.moveTo(0, 0)
  s.bezierCurveTo(0.034, 0.039, 0.099, 0.063, 0.099, 0.016)
  s.bezierCurveTo(0.109, -0.033, 0.04, -0.028, 0, 0)
}, 0.012, 0.006)
export const collar = (() => {
  const geometry = extrudeShape(s => {
    s.moveTo(-0.105, 0.012)
    s.quadraticCurveTo(-0.068, -0.053, -0.037, -0.078)
    s.lineTo(0, -0.021)
    s.lineTo(0.037, -0.078)
    s.quadraticCurveTo(0.068, -0.053, 0.105, 0.012)
    s.quadraticCurveTo(0, -0.024, -0.105, 0.012)
  }, 0.008, 0.004)
  // Drape the collar over the rounded chest instead of burying a flat badge.
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    positions.setZ(i, positions.getZ(i) + 0.142 - y * 0.22 - x * x * 3.6)
  }
  geometry.computeVertexNormals()
  return geometry
})()
export const cape = extrudeShape(s => {
  s.moveTo(-0.126, 0.76)
  s.quadraticCurveTo(-0.207, 0.58, -0.23, 0.345)
  s.quadraticCurveTo(-0.113, 0.305, 0, 0.343)
  s.quadraticCurveTo(0.113, 0.305, 0.23, 0.345)
  s.quadraticCurveTo(0.207, 0.58, 0.126, 0.76)
  s.closePath()
}, 0.018, 0.012)
export const feather = extrudeShape(s => {
  s.moveTo(0, 0)
  s.bezierCurveTo(-0.065, 0.09, -0.038, 0.197, 0.038, 0.24)
  s.bezierCurveTo(0.065, 0.127, 0.055, 0.067, 0, 0)
}, 0.006, 0.003)
export const blade = extrudeShape(s => {
  s.moveTo(-0.036, 0)
  s.lineTo(-0.034, 0.28)
  s.lineTo(0, 0.358)
  s.lineTo(0.034, 0.28)
  s.lineTo(0.036, 0)
  s.closePath()
}, 0.015, 0.004)
export const star = extrudeShape(s => {
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5
    const radius = i % 2 === 0 ? 0.072 : 0.034
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
}, 0.022, 0.005)
export const hatCrown = lock([
  [0, 0, 0], [0, 0.14, -0.01], [0.026, 0.28, 0], [0.141, 0.33, 0.014],
], 0.283, 0.283, 36)
export const hatBrim = lathe([
  [0, -0.018], [0.279, -0.018], [0.389, -0.023], [0.416, -0.008],
  [0.412, 0.008], [0.375, 0.015], [0.28, 0.025], [0, 0.025],
], 48)
export const bow = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, -0.276, 0), new THREE.Vector3(0.09, -0.16, 0),
  new THREE.Vector3(0.108, 0, 0), new THREE.Vector3(0.09, 0.16, 0),
  new THREE.Vector3(0, 0.276, 0),
]), 32, 0.016, 8, false)

// Longitude/latitude patch on the head ellipsoid, offset by 0.6%.
// Front is +Z; increasing U goes toward +X and increasing V goes upward.
export const facePatch = (() => {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const cols = 40
  const rows = 24
  for (let row = 0; row <= rows; row++) {
    const v = row / rows
    const latitude = -0.67 + v * 1.27
    for (let col = 0; col <= cols; col++) {
      const u = col / cols
      const longitude = (u - 0.5) * 2.04
      positions.push(
        0.304 * 1.006 * Math.cos(latitude) * Math.sin(longitude),
        0.28 * 1.006 * Math.sin(latitude),
        0.27 * 1.006 * Math.cos(latitude) * Math.cos(longitude),
      )
      uvs.push(u, v)
      if (row < rows && col < cols) {
        const a = row * (cols + 1) + col
        const b = a + cols + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
})()
