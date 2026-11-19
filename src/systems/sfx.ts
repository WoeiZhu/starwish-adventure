// 合成音效：不需要音檔，用 WebAudio 的振盪器與雜訊即時產生。
// 瀏覽器規定要有使用者操作後才能出聲，所以第一次播放時才建立 AudioContext。
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false
const last: Record<string, number> = {}

function audio() {
  if (muted) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.32
      master.connect(ctx.destination)
      const len = ctx.sampleRate * 0.6
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx.state === 'running' ? ctx : null
  } catch {
    return null
  }
}

/** 同一種音效在 gap 秒內不重複播放，避免多段傷害疊成噪音 */
function ready(name: string, gap: number) {
  const now = performance.now() / 1000
  if (now - (last[name] ?? -9) < gap) return false
  last[name] = now
  return true
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'bandpass', delay = 0) {
  const c = audio()
  if (!c || !master || !noiseBuf) return
  const t = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(f0, t)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(filter).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
}

export const sfx = {
  setMuted(m: boolean) {
    muted = m
  },
  /** 揮砍：由高到低的氣流聲 */
  slash() {
    if (ready('slash', 0.06)) noise(0.16, 0.5, 3200, 700)
  },
  /** 射箭 / 發射法球 */
  shoot(magic: boolean) {
    if (!ready('shoot', 0.05)) return
    if (magic) tone('sine', 520, 900, 0.14, 0.22)
    else {
      noise(0.09, 0.35, 2600, 1200)
      tone('triangle', 420, 180, 0.08, 0.2)
    }
  },
  /** 命中：短促的打擊聲，暴擊更亮更重 */
  hit(crit: boolean) {
    if (!ready('hit', 0.045)) return
    noise(0.08, crit ? 0.7 : 0.45, 1400, 300, 'lowpass')
    tone('square', crit ? 320 : 220, 70, crit ? 0.14 : 0.09, crit ? 0.3 : 0.2)
    if (crit) tone('triangle', 1400, 900, 0.12, 0.18)
  },
  /** 隊伍成員受傷 */
  hurt() {
    if (ready('hurt', 0.12)) tone('sawtooth', 180, 90, 0.12, 0.18)
  },
  cast() {
    if (!ready('cast', 0.08)) return
    tone('sine', 440, 880, 0.2, 0.2)
    tone('sine', 660, 1320, 0.22, 0.12, 0.05)
  },
  ultimate() {
    if (!ready('ult', 0.2)) return
    noise(0.5, 0.35, 300, 4000)
    tone('sawtooth', 110, 440, 0.45, 0.22)
    tone('sine', 880, 1760, 0.4, 0.16, 0.12)
  },
  heal() {
    if (!ready('heal', 0.1)) return
    tone('sine', 660, 990, 0.18, 0.16)
    tone('sine', 990, 1320, 0.22, 0.12, 0.08)
  },
  explode() {
    if (!ready('explode', 0.08)) return
    noise(0.4, 0.8, 900, 80, 'lowpass')
    tone('sine', 140, 40, 0.35, 0.4)
  },
  taunt() {
    if (ready('taunt', 0.2)) tone('sawtooth', 160, 320, 0.25, 0.25)
  },
  kill() {
    if (!ready('kill', 0.1)) return
    noise(0.2, 0.5, 600, 2400)
    tone('triangle', 520, 1040, 0.18, 0.2, 0.04)
  },
  levelUp() {
    if (!ready('levelUp', 0.3)) return
    ;[523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.2, i * 0.09))
  },
  pickup(rare: boolean) {
    if (!ready('pickup', 0.05)) return
    tone('sine', 880, 1320, 0.1, 0.16)
    if (rare) tone('sine', 1320, 1760, 0.16, 0.14, 0.07)
  },
  dodge() {
    if (ready('dodge', 0.2)) noise(0.2, 0.3, 900, 3000)
  },
}
