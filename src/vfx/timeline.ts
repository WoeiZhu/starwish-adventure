// 技能時間軸：把「動作、特效、命中、發射、音效」排在同一條時間線上，依時間依序觸發。
// 時間軸本身不知道每種事件要做什麼：遊戲和測試頁各自提供處理函式（dispatch），
// 所以同一份技能資料可以在兩邊播放，而傷害計算只存在遊戲（或測試頁）自己的處理函式裡。
export type TimelineKind = 'anim' | 'vfx' | 'hit' | 'launch' | 'sfx'

export interface TimelineEvent {
  /** 從施放開始算起的秒數 */
  t: number
  kind: TimelineKind
  /** anim：動作名稱；vfx：特效片段；sfx：音效名稱 */
  name?: string
  /** 特效播放在施放者（套用發射點 offset）或目標身上 */
  where?: 'caster' | 'target'
}

interface Run<C> {
  alive: boolean
  events: readonly TimelineEvent[]
  ctx: C
  time: number
  next: number
}

/** 同時播放中的時間軸用固定大小的池；滿了就提早結束最舊的那條 */
export class TimelinePlayer<C> {
  private readonly runs: Run<C>[] = []
  constructor(
    private readonly dispatch: (ev: TimelineEvent, ctx: C) => void,
    private readonly cap = 64,
  ) {}

  /** 開始播放；t = 0 的事件會立刻觸發（和原本的同步呼叫順序一致） */
  play(events: readonly TimelineEvent[], ctx: C) {
    let run = this.runs.find((r) => !r.alive)
    if (!run) {
      if (this.runs.length < this.cap) {
        run = { alive: false, events, ctx, time: 0, next: 0 }
        this.runs.push(run)
      } else {
        run = this.runs.reduce((a, b) => (b.time > a.time ? b : a))
        this.flush(run)
      }
    }
    run.alive = true
    run.events = events
    run.ctx = ctx
    run.time = 0
    run.next = 0
    this.step(run, 0)
    return run
  }

  update(dt: number) {
    for (const r of this.runs) if (r.alive) this.step(r, dt)
  }

  private step(r: Run<C>, dt: number) {
    r.time += dt
    while (r.next < r.events.length && r.events[r.next].t <= r.time + 1e-6) {
      this.dispatch(r.events[r.next++], r.ctx)
    }
    if (r.next >= r.events.length) r.alive = false
  }

  /** 被擠掉的時間軸：把剩下的事件立刻觸發完（命中與發射不會因為池滿而消失） */
  private flush(r: Run<C>) {
    while (r.next < r.events.length) this.dispatch(r.events[r.next++], r.ctx)
    r.alive = false
  }

  /** 取消符合條件的時間軸（例如施放者死亡）；不觸發剩下的事件 */
  cancel(pred: (ctx: C) => boolean) {
    for (const r of this.runs) if (r.alive && pred(r.ctx)) r.alive = false
  }

  clear() {
    for (const r of this.runs) r.alive = false
  }

  get active() {
    let n = 0
    for (const r of this.runs) if (r.alive) n++
    return n
  }
}

/** 時間軸總長（最後一個事件的時間） */
export const timelineLength = (events: readonly TimelineEvent[]) => events.reduce((m, e) => Math.max(m, e.t), 0)
