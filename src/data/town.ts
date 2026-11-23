// 星光鎮（Meshy 城鎮）：獨立的城鎮地圖資料。
// 素材在 public/models/starwish-town-meshy-20261123-v001/；設定檔用 Blender 座標 [x, y, z]，
// 換成 Three.js 是 [x, z, -y]（地面平面上：x 不變，z = -y）。
import NAV from '../../public/models/starwish-town-meshy-20261123-v001/navigation.json'
import CONFIG from '../../public/models/starwish-town-meshy-20261123-v001/town-config.json'
import NPCS from '../../public/models/starwish-town-meshy-20261123-v001/npc-placement.json'
import { modelUrl } from './appearance'
import type { Collider, Vec2 } from './world'

export type MapId = 'overworld' | 'starlight-town-meshy'
export const TOWN_ID = CONFIG.mapId as MapId
export const TOWN_NAME = '星光鎮'

const DIR = 'starwish-town-meshy-20261123-v001/'
/**
 * 整座城鎮一個 GLB（已含 8 種主體、地面、路燈、長椅、花壇），不要再另外疊載各主體 GLB。
 * 用的是 tools/assets 壓縮過的版本（meshopt 網格＋WebP 貼圖，43 MB → 6.6 MB），原檔保留在同一資料夾。
 */
export const TOWN_ENV_URL = modelUrl(DIR + 'town-environment.web.glb')
/** 外部地圖（主線世界）上的城門地標 */
export const TOWN_GATE_URL = modelUrl(DIR + 'town-gate.web.glb')

/** Blender 平面座標 (x, y) → Three.js (x, z) */
const b2t = (x: number, y: number): Vec2 => ({ x, z: -y })

/** 進城的落點與面向（面向 -Z，也就是看向城鎮裡面） */
export const TOWN_SPAWN = { x: CONFIG.spawnThree[0], z: CONFIG.spawnThree[2], facing: Math.PI }
/** 城門出口：主角走進這個圓就回到主線世界 */
export const TOWN_EXIT = { x: CONFIG.exitTriggerThree.center[0], z: CONFIG.exitTriggerThree.center[2], r: CONFIG.exitTriggerThree.radius }
/** 進出地圖後的冷卻（毫秒），而且要先離開出口範圍才會啟用 */
export const PORTAL_COOLDOWN_MS = CONFIG.exitTriggerThree.cooldownMs

/**
 * 主線世界的城門：放在原本封起來的「南方街道」盡頭（terrain.ts 的 gate_south）。
 * 城門正面朝北（玩家從村子沿南方街道走過來）；走進門洞中央的圓就進城。
 * 回來時站在城門北側 3 公尺、面向村子。座標寫在 town-config.json 的 externalPortal。
 * 設定檔裡是 null（還沒指定）時不會把它當成世界原點：入口直接停用（半徑 0）。
 */
const EP = CONFIG.externalPortal as {
  positionThree: number[] | null
  radius?: number
  returnPositionThree: number[] | null
  returnFacingY?: number
  gatePositionThree?: number[] | null
  gateRotationY?: number
}
const portalOk = !!(EP.positionThree && EP.returnPositionThree && EP.gatePositionThree)
if (!portalOk) console.warn('[town] town-config.json 的 externalPortal 還沒指定，星光鎮入口停用')
const xyz = (v: number[] | null | undefined) => (v ? { x: v[0], z: v[2] } : { x: 0, z: 0 })
export const TOWN_PORTAL = {
  sourceMapId: 'overworld' as MapId,
  gateId: 'gate_south',
  ...xyz(EP.gatePositionThree),
  /** 城門模型的旋轉：模型正面是 +Z，轉半圈讓正面朝北 */
  rot: EP.gateRotationY ?? Math.PI,
  trigger: { ...xyz(EP.positionThree), r: portalOk ? (EP.radius ?? 0.9) : 0 },
  ret: { ...xyz(EP.returnPositionThree), facing: EP.returnFacingY ?? Math.PI },
  enabled: portalOk,
}

// ── 尋路網格：Blender 網格（列 = Blender y 由小到大）翻成 Three（列 = z 由小到大） ──
const G = NAV.grid
export const TOWN_GRID = (() => {
  const nx = G.nx
  const nz = G.ny
  const blocked = new Uint8Array(nx * nz)
  for (let iy = 0; iy < nz; iy++) {
    const jz = nz - 1 - iy // Blender y 越大，Three z 越小
    for (let ix = 0; ix < nx; ix++) blocked[jz * nx + ix] = G.blocked[iy * nx + ix] ? 1 : 0
  }
  return {
    cell: G.step,
    minX: G.min[0],
    minZ: -(G.min[1] + nz * G.step),
    nx,
    nz,
    blocked,
  }
})()

/** 城鎮可移動的外框（再外面就是封閉的城牆／城門外） */
export const TOWN_BOUNDS = {
  minX: TOWN_GRID.minX,
  maxX: TOWN_GRID.minX + TOWN_GRID.nx * TOWN_GRID.cell,
  minZ: TOWN_GRID.minZ,
  // 城門外側不讓走太遠：出口圓的外緣再多一點
  maxZ: TOWN_EXIT.z + TOWN_EXIT.r + 0.3,
}

/** 建築高度（公尺，鏡頭防穿模用） */
const HEIGHT: Record<string, number> = {
  'weapon-shop': 5.3,
  'general-store': 5,
  'adventurers-guild': 6.3,
  'town-inn': 7.2,
  'gate-tower': 6,
  boundary: 1.8,
}

/** 城鎮碰撞體：navigation.json 的方塊與圓，換成 Three 座標 */
export const TOWN_COLLIDERS: Collider[] = NAV.colliders.map((c): Collider => {
  if (c.kind === 'circle') {
    const p = b2t(c.x!, c.y!)
    return { kind: 'circle', x: p.x, z: p.z, r: c.r! }
  }
  return { kind: 'box', minX: c.minX!, maxX: c.maxX!, minZ: -c.maxY!, maxZ: -c.minY!, h: HEIGHT[c.id] ?? 2 }
})

/**
 * 城門整體的範圍（含門洞上方的拱）：鏡頭和主角之間隔著城門時，城門淡出成半透明。
 * 剛進城或剛出城時鏡頭在主角身後、隔著城門，不淡出會看不到人。
 */
export interface GateVolume {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  maxY: number
}
export const TOWN_GATE_VOLUME: GateVolume = { minX: -5.5, maxX: 5.5, minZ: 14.65, maxZ: 17.35, maxY: 6 }
export const WORLD_GATE_VOLUME: GateVolume = { minX: TOWN_PORTAL.x - 5.5, maxX: TOWN_PORTAL.x + 5.5, minZ: TOWN_PORTAL.z - 1.3, maxZ: TOWN_PORTAL.z + 1.3, maxY: 6 }
/** 城鎮 GLB 裡城門用的材質名稱（整座城門合成一個網格） */
export const TOWN_GATE_MATERIAL = 'town-gate surface'

export type TownBuildingId = 'weapon-shop' | 'general-store' | 'adventurers-guild' | 'town-inn'
export const TOWN_BUILDING_NAME: Record<TownBuildingId, string> = {
  'weapon-shop': '武器店',
  'general-store': '雜貨店',
  'adventurers-guild': '冒險者公會',
  'town-inn': '旅館',
}
/** 四間建築的門口（建築是封閉外觀，沒有可走進去的房間；在門口互動） */
export const TOWN_DOORS = CONFIG.buildings.map((b) => ({
  id: b.id as TownBuildingId,
  x: b.doorApproachThree[0],
  z: b.doorApproachThree[2],
}))

export type TownNpcRole = 'quest-guide' | 'guild-placeholder' | 'weapon-vendor-placeholder' | 'general-vendor'
/** 4 位 NPC：沿用既有的 guide-npc / merchant-npc 模型（各兩份） */
export const TOWN_NPCS = NPCS.actors.map((a) => ({
  role: a.role as TownNpcRole,
  model: a.asset === 'merchant-npc.glb' ? ('merchant' as const) : ('guide' as const),
  x: a.positionThree[0],
  z: a.positionThree[2],
}))
