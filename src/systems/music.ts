// 背景音樂：不用音檔，用 WebAudio 即時合成兩首短曲循環播放。
//   field：草原（明亮的 4/4，三角波旋律＋撥弦低音）
//   town ：城鎮（溫柔的 3/4 華爾滋，音樂盒音色＋柔和和弦）
// 換地圖時交叉淡入淡出；第一次有使用者操作後才會出聲（瀏覽器規定）。
import { audioOut } from './sfx'

export type Theme = 'field' | 'town'
interface Song {
  bpm: number
  /** 一小節幾拍 */
  beats: number
  /** 旋律：[半音（相對 root，null 是休止）, 拍數] */
  melody: [number | null, number][]
  /** 每小節的和弦根音（半音）與和弦組成 */
  chords: [number, number[]][]
  root: number
  lead: OscillatorType
}
const SONGS: Record<Theme, Song> = {
  field: {
    bpm: 104,
    beats: 4,
    root: 60,
    lead: 'triangle',
    melody: [
      [7, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1],
      [4, 1], [7, 1], [9, 2],
      [12, 1], [9, 0.5], [7, 0.5], [4, 1], [7, 1],
      [2, 2], [null, 2],
      [7, 1], [9, 0.5], [12, 0.5], [14, 1], [12, 1],
      [9, 1], [7, 1], [4, 2],
      [2, 1], [4, 1], [7, 1], [9, 1],
      [7, 3], [null, 1],
    ],
    chords: [
      [0, [0, 4, 7]], [-3, [0, 3, 7]], [5, [0, 4, 7]], [7, [0, 4, 7]],
      [0, [0, 4, 7]], [-3, [0, 3, 7]], [5, [0, 4, 7]], [0, [0, 4, 7]],
    ],
  },
  town: {
    bpm: 132,
    beats: 3,
    root: 65,
    lead: 'sine',
    melody: [
      [7, 2], [9, 1], [12, 2], [9, 1], [7, 3], [4, 3],
      [5, 2], [7, 1], [9, 2], [7, 1], [4, 3], [null, 3],
      [7, 2], [9, 1], [12, 2], [14, 1], [12, 3], [9, 3],
      [7, 2], [5, 1], [4, 2], [2, 1], [0, 3], [null, 3],
    ],
    chords: [
      [0, [0, 4, 7]], [0, [0, 4, 7]], [-7, [0, 4, 7]], [-5, [0, 4, 7]],
      [5, [0, 4, 7]], [0, [0, 4, 7]], [-5, [0, 4, 7]], [0, [0, 4, 7]],
    ],
  },
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

let enabled = (() => {
  try {
    return localStorage.getItem('starwish.music') !== 'off'
  } catch {
    return true
  }
})()
let want: Theme | null = null
let playing: { theme: Theme; gain: GainNode; next: number; step: number; bar: number; start: number } | null = null
let timer: ReturnType<typeof setInterval> | null = null

function note(c: AudioContext, out: AudioNode, type: OscillatorType, f: number, t: number, dur: number, vol: number, box = false) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = f
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.012)
  // 音樂盒：快速衰減；一般：持續到快結束再收
  if (box) g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.35, dur))
  else {
    g.gain.setValueAtTime(vol, t + dur * 0.7)
    g.gain.linearRampToValueAtTime(0, t + dur)
  }
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + Math.max(0.4, dur) + 0.05)
}

/** 往前排 0.3 秒內要播的音 */
function schedule() {
  const a = audioOut()
  if (!a || !playing) return
  const { ctx } = a
  const s = SONGS[playing.theme]
  const beat = 60 / s.bpm
  if (playing.next < ctx.currentTime) playing.next = ctx.currentTime + 0.05
  while (playing.next < ctx.currentTime + 0.3) {
    const [n, len] = s.melody[playing.step]
    const t = playing.next
    if (n !== null) {
      note(ctx, playing.gain, s.lead, hz(s.root + n + 12), t, len * beat * 0.95, 0.16, playing.theme === 'town')
      if (playing.theme === 'town') note(ctx, playing.gain, 'sine', hz(s.root + n + 24), t, len * beat * 0.6, 0.05, true)
    }
    playing.next += len * beat
    playing.step = (playing.step + 1) % s.melody.length
  }
  // 伴奏：每小節依和弦排（獨立的時間軸）
  const barLen = beat * s.beats
  while (playing.start < ctx.currentTime + 0.3) {
    const [r, tri] = s.chords[playing.bar % s.chords.length]
    const t = playing.start
    note(ctx, playing.gain, 'triangle', hz(s.root + r - 12), t, beat * (s.beats === 3 ? 1 : 2) * 0.9, 0.16)
    for (let b = 1; b < s.beats; b++)
      for (const iv of tri) note(ctx, playing.gain, s.beats === 3 ? 'sine' : 'triangle', hz(s.root + r + iv), t + b * beat, beat * 0.5, 0.035, s.beats === 3)
    playing.start += barLen
    playing.bar++
  }
}

function startTheme(theme: Theme) {
  const a = audioOut()
  if (!a) return false
  const { ctx, out } = a
  // 舊的淡出
  if (playing) {
    const old = playing.gain
    old.gain.cancelScheduledValues(ctx.currentTime)
    old.gain.setValueAtTime(old.gain.value, ctx.currentTime)
    old.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.4)
    setTimeout(() => old.disconnect(), 1600)
  }
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.6)
  gain.connect(out)
  playing = { theme, gain, next: ctx.currentTime + 0.3, step: 0, bar: 0, start: ctx.currentTime + 0.3 }
  if (!timer) timer = setInterval(schedule, 90)
  return true
}

/** 要播哪首（null 停止）；聲音還沒解鎖時先記著，之後 tryResume 會補播 */
export function setMusic(theme: Theme | null) {
  want = theme
  sync()
}
function sync() {
  const target = enabled ? want : null
  if ((playing?.theme ?? null) === target) return
  if (!target) {
    const a = audioOut()
    if (a && playing) {
      playing.gain.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.8)
      const g = playing.gain
      setTimeout(() => g.disconnect(), 1000)
    }
    playing = null
    return
  }
  startTheme(target)
}
/** 使用者操作後呼叫：聲音解鎖了就開始播 */
export function tryResumeMusic() {
  sync()
}
export const musicEnabled = () => enabled
export function setMusicEnabled(on: boolean) {
  enabled = on
  try {
    localStorage.setItem('starwish.music', on ? 'on' : 'off')
  } catch {
    /* 無痕模式 */
  }
  sync()
}
export const musicState = () => ({ want, playing: playing?.theme ?? null, enabled })
