// 固定上限的物件池：需要時才建立，用完標記成閒置給下一次用。
// 滿了就回收最舊的那個（大量攻擊時舊特效提早消失，不會無限增加物件）。
export interface Pooled {
  alive: boolean
  age: number
}

export class SlotPool<T extends Pooled> {
  readonly items: T[] = []
  /** 因為滿了而被提早回收的次數 */
  stolen = 0
  constructor(
    private readonly make: () => T,
    public cap: number,
  ) {}

  acquire(): T {
    // 只用前 cap 個：切到省電模式後，多建立的物件放著不用（跑完的就不再出現）
    let oldest: T | undefined
    const n = Math.min(this.items.length, this.cap)
    for (let i = 0; i < n; i++) {
      const it = this.items[i]
      if (!it.alive) return it
      if (!oldest || it.age > oldest.age) oldest = it
    }
    if (this.items.length < this.cap) {
      const it = this.make()
      this.items.push(it)
      return it
    }
    this.stolen++
    return oldest!
  }

  get active() {
    let n = 0
    for (const it of this.items) if (it.alive) n++
    return n
  }

  forEachAlive(fn: (it: T) => void) {
    for (const it of this.items) if (it.alive) fn(it)
  }
}
