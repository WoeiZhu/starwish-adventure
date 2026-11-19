// 模型替換點：外觀帶有 modelUrl 時用 GLB 骨架模型，否則（或載入中 / 載入失敗）用程序化人物。
import { Component, Suspense, type ReactNode } from 'react'
import { ChibiCharacter } from './ChibiCharacter'
import { ClipCharacter } from './ClipCharacter'
import { GlbCharacter } from './GlbCharacter'
import type { CharacterModelProps } from './types'

interface BoundaryProps {
  fallback: ReactNode
  resetKey: string
  children: ReactNode
}
interface BoundaryState {
  failed: boolean
  key: string
}

/**
 * 模型載入失敗時改顯示 fallback。
 * 必須在 getDerivedStateFromError 就切換狀態：若只在 componentDidCatch 才 setState，
 * 重繪時子元件會再丟一次錯誤，整個畫面會被卸載成空白。換了 resetKey（例如換職業）就重試。
 */
export class ModelBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, key: this.props.resetKey }
  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true }
  }
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, failed: false } : null
  }
  componentDidCatch(error: unknown) {
    console.warn('GLB 模型載入失敗，改用程序化人物', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function CharacterModel(props: CharacterModelProps) {
  const clipUrl = props.appearance.clipModelUrl
  const url = props.appearance.modelUrl
  const fallback = <ChibiCharacter {...props} />
  if (clipUrl) {
    return (
      <ModelBoundary fallback={fallback} resetKey={clipUrl}>
        <Suspense fallback={fallback}>
          <ClipCharacter key={clipUrl} {...props} />
        </Suspense>
      </ModelBoundary>
    )
  }
  if (!url) return fallback
  return (
    <ModelBoundary fallback={fallback} resetKey={url}>
      <Suspense fallback={fallback}>
        <GlbCharacter key={url} {...props} />
      </Suspense>
    </ModelBoundary>
  )
}
