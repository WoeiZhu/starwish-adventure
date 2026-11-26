// 新角色整合測試（v002 角色包）：城門守衛（G01）與四種新怪物（M01–M04）。本機 Edge 無頭，先開 dev server（port 5183）
//   node newchars-qa.mjs [標籤]
// 檢查：模型載入無錯誤、四種怪物能攻擊／受擊／死亡、各自的特技（衝撞、俯衝、遠程）有觸發、
//       兩位以上守衛的動畫各自獨立、主控台沒有錯誤；並輸出截圖
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'newchars'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/char-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.QA_URL ?? 'http://localhost:5183/'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(ok ? '✔' : '✘', name, detail)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
const ev = (f, a) => page.evaluate(f, a)
const wait = (ms) => page.waitForTimeout(ms)
const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })

await ev(() => {
  localStorage.removeItem('starwish.save.v1')
  localStorage.setItem('starwish.cam', 'immersive')
  const sw = window.__sw
  sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
  sw.useGame.getState().startGame()
  sw.useGame.getState().setQuality('high')
  for (const c of ['archer', 'mage', 'cleric']) sw.cstate.recruitAlly(c)
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  sw.useGame.setState({ dialog: null })
})
await ready()

// 傳送到空曠處（城南草原）
const SPOT = { x: 0, z: 8 }
async function setup() {
  await ev((SPOT) => {
    const sw = window.__sw
    for (const u of sw.combat.units) {
      if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    }
    for (const u of sw.combat.units) if (u.team === 'party') (u.x = SPOT.x + (Math.random() - 0.5), (u.z = SPOT.z + (Math.random() - 0.5)), (u.hp = u.maxHp))
    sw.runtime.player.x = SPOT.x
    sw.runtime.player.z = SPOT.z
    sw.cam.yaw = Math.PI
    sw.cam.yawT = Math.PI
    sw.cam.distT = 9
  }, SPOT)
}
await setup()
await wait(800)

const SPECIES = [
  ['boar', '鐵牙野豬'],
  ['bat', '月翼蝠'],
  ['lizard', '砂鱗蜥兵'],
  ['crab', '裂岩甲蟹'],
]
for (const [sp, name] of SPECIES) {
  await setup()
  const id = await ev(
    ({ sp, name, SPOT }) => {
      const sw = window.__sw
      const u = sw.cstate.spawnEnemy({ name, color: '#ffffff', species: sp, x: SPOT.x, z: SPOT.z - 7, level: 6, tag: 'qa_' + sp })
      u.ai && (u.ai.returning = false)
      return u.id
    },
    { sp, name, SPOT },
  )
  await wait(2500) // 模型載入
  const seen = { attack: 0, actionSeq: 0, hit: 0 }
  let minD = 99
  for (let i = 0; i < 24; i++) {
    const s = await ev((id) => {
      const sw = window.__sw
      const u = sw.combat.units.find((x) => x.id === id)
      const h = sw.combat.units[0]
      return u ? { hp: u.hp, max: u.maxHp, alive: u.alive, d: Math.hypot(u.x - h.x, u.z - h.z), atk: u.attackAnim, seq: u.actionSeq, clip: u.actionClip, sq: u.squash, moved: u.moved } : null
    }, id)
    if (!s) break
    minD = Math.min(minD, s.d)
    if (s.atk > 0.9) seen.attack++
    seen.actionSeq = Math.max(seen.actionSeq, s.seq)
    if (s.sq > 0.5) seen.hit++
    if (i === 6) await page.screenshot({ path: OUT + `${sp}_fight.png` })
    if (!s.alive) break
    await wait(500)
  }
  await page.screenshot({ path: OUT + `${sp}_after.png` })
  const end = await ev((id) => {
    const u = window.__sw.combat.units.find((x) => x.id === id)
    return u ? { alive: u.alive, hp: Math.round(u.hp), species: u.species, range: u.range } : null
  }, id)
  check(`${name}（${sp}）：接近並攻擊`, minD < 8, JSON.stringify({ minD: +minD.toFixed(1), ...seen, end }))
  if (sp === 'boar') check('野豬：蓄力衝撞有觸發（actionSeq 增加）', seen.actionSeq > 0, `seq=${seen.actionSeq}`)
  if (sp === 'bat') check('月翼蝠：俯衝有觸發', seen.actionSeq > 0, `seq=${seen.actionSeq}`)
  if (sp === 'lizard') check('砂鱗蜥兵：遠程（range>2）', (end?.range ?? 0) > 2, `range=${end?.range}`)
}

// 讓每種怪物各死一次，看死亡動作
for (const [sp, name] of SPECIES) {
  await setup()
  const id = await ev(
    ({ sp, name, SPOT }) => {
      const sw = window.__sw
      const u = sw.cstate.spawnEnemy({ name, color: '#ffffff', species: sp, x: SPOT.x + 2.5, z: SPOT.z - 3, level: 6, tag: 'qa_' + sp })
      return u.id
    },
    { sp, name, SPOT },
  )
  await wait(1200)
  await ev((id) => {
    const sw = window.__sw
    const u = sw.combat.units.find((x) => x.id === id)
    u.hp = 0
    sw.sim.damage?.(sw.combat.units[0], u, 9999)
  }, id)
  await wait(650)
  await page.screenshot({ path: OUT + `${sp}_death.png` })
}

// ── 城門守衛 ──
await setup()
await ev(() => {
  const sw = window.__sw
  sw.runtime.player.x = 0.2
  sw.runtime.player.z = 25
  sw.runtime.player.facing = 0
  sw.cam.yaw = Math.PI
  sw.cam.yawT = Math.PI
  sw.cam.distT = 8
  sw.cam.tiltT = -0.25
})
await wait(4000)
await page.screenshot({ path: OUT + 'guards_gate.png' })
const g = await ev(() => {
  const sw = window.__sw
  return { calls: sw.gl?.info.render.calls, tris: sw.gl?.info.render.triangles }
})
console.log('城門畫面', g)
// ── 任務指引箭頭、畫質、窄畫面 ──
await setup()
await ev(() => {
  const sw = window.__sw
  sw.progress.story.step = 'talk'
  sw.runtime.player.x = 0
  sw.runtime.player.z = 20
  sw.cam.yaw = Math.PI
  sw.cam.yawT = Math.PI
})
await wait(600)
const arrow = await ev(() => {
  const el = document.querySelector('.quest-arrow')
  const n = document.querySelector('.qa-needle')
  return { shown: !!el && !el.hidden, rot: n?.style.transform, text: document.querySelector('.qa-dist')?.textContent }
})
// 村長在 (-2.6,-5.2)，主角在 (0,20) 看向 +z（yaw=π）：目標在正後方，箭頭應約 180°
const rotRad = parseFloat(/rotate\(([-\d.e]+)rad\)/.exec(arrow.rot ?? '')?.[1] ?? 'NaN')
check('任務箭頭：顯示、距離約 25 m、方向在身後', arrow.shown && /^2\d m$/.test(arrow.text ?? '') && Math.abs(Math.abs(rotRad) - Math.PI) < 0.3, JSON.stringify(arrow))
await page.screenshot({ path: OUT + 'quest_arrow.png' })
await ev(() => {
  const sw = window.__sw
  sw.runtime.player.x = -2.6
  sw.runtime.player.z = -3
})
await wait(400)
check('走到目標附近（7 m 內）箭頭收起', await ev(() => document.querySelector('.quest-arrow').hidden))

// 畫質三段
const q = await ev(() => {
  const sw = window.__sw
  const out = []
  for (const k of ['high', 'mid', 'saver']) {
    sw.useGame.getState().setQuality(k)
    out.push(k + ':' + sw.useGame.getState().quality)
  }
  return out
})
check('畫質三段（高／中／低）可切換', q.join() === 'high:high,mid:mid,saver:saver', q.join())
await ev(() => window.__sw.useGame.getState().setQuality('mid'))
await wait(1200)
const midInfo = await ev(() => {
  const gl = window.__sw.gl
  return { dpr: gl.getPixelRatio(), shadowOn: gl.shadowMap.enabled }
})
check('中畫質：解析度倍率不超過 1.5', midInfo.dpr <= 1.5, JSON.stringify(midInfo))
await ev(() => window.__sw.useGame.getState().setQuality('high'))

// 很窄的視窗：技能列換行、不被切掉
await page.setViewportSize({ width: 300, height: 640 })
await wait(700)
const narrow = await ev(() => {
  const bar = document.querySelector('.skillbar')
  const r = bar?.getBoundingClientRect()
  return r ? { left: Math.round(r.left), right: Math.round(r.right), w: innerWidth } : null
})
check('窄畫面（300px）技能列沒有被切掉', !!narrow && narrow.left >= 0 && narrow.right <= narrow.w, JSON.stringify(narrow))
await page.screenshot({ path: OUT + 'narrow_300.png' })
await page.setViewportSize({ width: 1280, height: 720 })

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 4).join(' | '))

const ok = results.filter((r) => r.ok).length
console.log(`結果：${ok}/${results.length} 通過`)
writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 1))
await browser.close()
process.exit(ok === results.length ? 0 : 1)
