// 模型載入失敗時的退路：畫 fallback（或什麼都不畫），並通知呼叫者。
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (err: unknown) => void
}

export class LoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[load] 模型載入失敗', err)
    this.props.onError?.(err)
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
