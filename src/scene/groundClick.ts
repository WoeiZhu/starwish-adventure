// 點地面移動：主線世界與城鎮共用。
import type { ThreeEvent } from '@react-three/fiber'
import { cutscene } from '../game/cutscene'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { findPath } from '../systems/pathfinding'

export function handleGroundClick(e: ThreeEvent<MouseEvent>) {
  if (e.nativeEvent.button !== 0 || e.delta > 6) return
  // 手機剛拖曳或雙指縮放鏡頭：放開手指不算點地面
  if (performance.now() - runtime.gestureAt < 250) return
  const s = useGame.getState()
  if (s.phase !== 'playing' || s.paused || s.dialog || cutscene.state === 'active') return
  const path = findPath(runtime.player, { x: e.point.x, z: e.point.z })
  if (!path) return
  runtime.path = path
  runtime.approach = false
  runtime.queuedSkill = null
  const end = path[path.length - 1]
  runtime.marker.x = end.x
  runtime.marker.z = end.z
  runtime.marker.life = 1
}
