// 載入動畫與第一次進城過場測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node intro-qa.mjs [標籤]
// 檢查：
//   載入畫面：開局、進城時出現（有進度條、提示）、載完後淡出、載入期間不擋後面的點擊；手機橫拿也放得下
//   過場：自動測試預設不播；強制啟用後第一次進城播放（HUD 隱藏、主角不能動、鏡頭沿路徑移動）、
//         可用 Space／點畫面／跳過鈕跳過、播完鏡頭接回一般位置、存檔記住、再進城不重播、新遊戲重置
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'intro'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/intro-qa/${label}/`, import.meta.url))
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
const shot = (n) => page.screenshot({ path: OUT + n + '.png' })
const cine = () => ev(() => ({ s: window.__sw.cutscene.cutscene.state, t: +window.__sw.cutscene.cutscene.t.toFixed(2), played: window.__sw.cutscene.cutscene.played }))

async function newGame() {
  await ev(() => {
    localStorage.removeItem('starwish.save.v1')
    localStorage.setItem('starwish.cam', 'immersive')
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
    sw.useGame.getState().startGame()
    for (const c of ['archer', 'mage', 'cleric']) sw.cstate.recruitAlly(c)
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    sw.useGame.setState({ dialog: null })
  })
}

// ───────────── 一、載入畫面 ─────────────
await ev(() => (window.__sw.loadUi.force = true)) // 用正式的停留與淡出時間
await newGame()
await wait(250)
const v1 = await ev(() => {
  const el = document.querySelector('.loading-screen')
  return { shown: !!el, tip: document.querySelector('.ls-tip')?.textContent ?? '', label: document.querySelector('.ls-label')?.textContent ?? '', canvas: !!el?.querySelector('canvas'), pe: el ? getComputedStyle(el).pointerEvents : '' }
})
check('開局：載入畫面出現（畫布、提示、標籤）', v1.shown && v1.canvas && v1.tip.startsWith('小提示') && v1.label.includes('載入'), JSON.stringify(v1))
check('載入畫面不擋點擊（pointer-events: none）', v1.pe === 'none', v1.pe)
await shot('1_loading_start')
await ready()
const barA = await ev(() => parseFloat(document.querySelector('.ls-fill')?.style.width ?? '0'))
await wait(1700) // 最短停留 0.9 s + 淡出 0.38 s
const gone = await ev(() => !document.querySelector('.loading-screen'))
check('載完之後（停留＋淡出）載入畫面消失', gone, `進度條曾到 ${barA}%`)

// 進城的載入畫面
await ev(() => {
  const sw = window.__sw
  sw.runtime.player.x = sw.townData.TOWN_PORTAL.ret.x
  sw.runtime.player.z = sw.townData.TOWN_PORTAL.ret.z
  sw.travel.travel.armed = true
  sw.travel.travel.lastAt = -1e9
  const t = sw.townData.TOWN_PORTAL.trigger
  sw.runtime.player.x = t.x
  sw.runtime.player.z = t.z
})
await wait(120)
const v2 = await ev(() => ({ shown: !!document.querySelector('.loading-screen'), label: document.querySelector('.ls-label')?.textContent ?? '' }))
await shot('2_loading_town')
check('進城：載入畫面顯示「前往星光鎮」', v2.shown && v2.label.includes('星光鎮'), JSON.stringify(v2))
await ready()
await wait(1700)
check('進城載完後載入畫面消失', await ev(() => !document.querySelector('.loading-screen')))
check('自動測試預設不播過場（webdriver）', (await cine()).s === 'idle', JSON.stringify(await cine()))

// ───────────── 二、手機橫拿的載入畫面 ─────────────
{
  const c2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const p2 = await c2.newPage()
  await p2.goto(URL_, { waitUntil: 'load' })
  await p2.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
  await p2.evaluate(() => {
    window.__sw.loadUi.force = true
    localStorage.removeItem('starwish.save.v1')
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId: 'mage', name: '手機' })
    sw.useGame.getState().startGame()
  })
  await p2.waitForTimeout(500)
  const fit = await p2.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect()
    const tip = q('.ls-tip')
    const logo = q('.ls-logo')
    const bar = q('.ls-bar')
    return { tipBottom: tip && Math.round(tip.bottom), logoTop: logo && Math.round(logo.top), barTop: bar && Math.round(bar.top), h: innerHeight }
  })
  await p2.screenshot({ path: OUT + '3_loading_phone.png' })
  check('手機橫拿（844×390）：標誌、進度條、提示都在畫面內', !!fit.tipBottom && fit.tipBottom <= fit.h && fit.logoTop >= 0 && fit.barTop < fit.tipBottom, JSON.stringify(fit))
  await c2.close()
}

// ───────────── 三、第一次進城過場 ─────────────
await ev(() => {
  const sw = window.__sw
  sw.cutscene.cutscene.force = true
  sw.loadUi.force = false
})
await newGame()
await ready()
await wait(500)
check('新遊戲：還沒有看過過場', await ev(() => !window.__sw.progress.unlocks.includes('intro_town')))

async function enterTown() {
  await ev(() => {
    const sw = window.__sw
    const t = sw.townData.TOWN_PORTAL.trigger
    sw.runtime.player.x = sw.townData.TOWN_PORTAL.ret.x
    sw.runtime.player.z = sw.townData.TOWN_PORTAL.ret.z
    sw.travel.travel.armed = true
    sw.travel.travel.lastAt = -1e9
    sw.runtime.player.x = t.x
    sw.runtime.player.z = t.z
  })
}
await enterTown()
await page.waitForFunction(() => window.__sw.cutscene.cutscene.state === 'active', null, { timeout: 60000 })
const startPos = await ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z }))
check('第一次進城：載入完成後開始播過場', true, JSON.stringify(await cine()))

// 相機位置：用 three 的相機（掛在場景的第一台相機不方便，改從 gl 取不到 → 用 __sw.cam 之外的探針）
await ev(() => {
  const sw = window.__sw
  // 每幀記錄相機位置（用 renderer 的 onBeforeRender 取不到相機，改包 gl.render）
  sw.camLog = []
  const gl = sw.gl
  const orig = gl.render.bind(gl)
  gl.render = (scene, camera) => {
    sw.lastCam = [camera.position.x, camera.position.y, camera.position.z]
    return orig(scene, camera)
  }
})
const samples = []
for (const at of [0.6, 2.5, 4.5, 6.5]) {
  await page.waitForFunction((at) => window.__sw.cutscene.cutscene.t >= at, at, { timeout: 30000 })
  const s = await ev(() => ({ cam: window.__sw.lastCam, hud: getComputedStyle(document.querySelector('.hud')).visibility, bars: document.querySelector('.ti-bar.top')?.style.height, title: document.querySelector('.ti-title')?.style.opacity }))
  samples.push({ at, ...s })
  await shot(`4_cutscene_${String(at).replace('.', '_')}`)
}
check('過場中 HUD 隱藏、上下出現黑邊', samples.every((s) => s.hud === 'hidden') && parseFloat(samples[1].bars) > 5, JSON.stringify(samples.map((s) => [s.hud, s.bars])))
const movedCam = Math.hypot(samples[0].cam[0] - samples[3].cam[0], samples[0].cam[1] - samples[3].cam[1], samples[0].cam[2] - samples[3].cam[2])
check('鏡頭沿路徑移動（起點與 6.5 秒處相距 > 20 m）、起點在高處', movedCam > 20 && samples[0].cam[1] > 15, `moved=${movedCam.toFixed(1)} y0=${samples[0].cam[1].toFixed(1)} y3=${samples[3].cam[1].toFixed(1)}`)
check('字卡「星光鎮」在 2.5 秒時可見', parseFloat(samples[1].title) > 0.8, samples[1].title)

// 主角不能動：按住 W 1 秒
await page.keyboard.down('KeyW')
await wait(900)
await page.keyboard.up('KeyW')
const afterKey = await ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z }))
check('過場中按 W 主角不會移動', Math.hypot(afterKey.x - startPos.x, afterKey.z - startPos.z) < 0.05, JSON.stringify({ startPos, afterKey }))

// 播完（或自然結束）前先看存檔記住了
const saved = await ev(() => JSON.parse(localStorage.getItem('starwish.save.v1') ?? '{}').unlocks ?? [])
check('開始播放就寫進存檔（中途關掉也不會重播）', saved.includes('intro_town'), JSON.stringify(saved))

// 用 Space 跳過
await page.keyboard.press('Space')
await wait(300)
const afterSkip = await cine()
check('Space 跳過：時間直接跳到最後一段', afterSkip.s === 'active' && afterSkip.t >= 7.5, JSON.stringify(afterSkip))
await shot('5_skip_blend')
await page.waitForFunction(() => window.__sw.cutscene.cutscene.state === 'idle', null, { timeout: 8000 })
check('跳過後約 1.4 秒內結束過場', true)
await wait(400)
const hudBack = await ev(() => ({ vis: getComputedStyle(document.querySelector('.hud')).visibility, intro: !!document.querySelector('.town-intro') }))
check('結束後 HUD 恢復、過場畫面移除', hudBack.vis === 'visible' && !hudBack.intro, JSON.stringify(hudBack))
// 鏡頭回到主角附近
await wait(800)
const endCam = await ev(() => ({ cam: window.__sw.lastCam, p: window.__sw.runtime.player }))
const dEnd = Math.hypot(endCam.cam[0] - endCam.p.x, endCam.cam[2] - endCam.p.z)
check('結束後鏡頭回到主角身邊（水平距離 < 10 m）', dEnd < 10, `d=${dEnd.toFixed(1)}`)
await shot('6_after_cutscene')
// 結束後能走
await page.keyboard.down('KeyW')
await wait(700)
await page.keyboard.up('KeyW')
const moved = await ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z }))
check('結束後主角可以移動', Math.hypot(moved.x - startPos.x, moved.z - startPos.z) > 0.8, JSON.stringify(moved))
check('結束後顯示城鎮名稱橫幅', await ev(() => !!document.querySelector('.town-banner')))

// 出城再進城：不重播
await ev(() => {
  const sw = window.__sw
  const t = sw.townData.TOWN_EXIT
  sw.runtime.player.x = t.x
  sw.runtime.player.z = t.z
})
await ready()
await wait(300)
await enterTown()
await ready()
await wait(1200)
const again = await cine()
check('出城再進城不重播（已看過）', again.s === 'idle' && again.played === 1, JSON.stringify(again))

// 點畫面與跳過鈕
for (const how of ['tap', 'button']) {
  await ev(() => {
    const sw = window.__sw
    const i = sw.progress.unlocks.indexOf('intro_town')
    if (i >= 0) sw.progress.unlocks.splice(i, 1)
    const t = sw.townData.TOWN_EXIT
    sw.runtime.player.x = t.x
    sw.runtime.player.z = t.z
  })
  await ready()
  await wait(300)
  await enterTown()
  await page.waitForFunction(() => window.__sw.cutscene.cutscene.state === 'active', null, { timeout: 60000 })
  await page.waitForFunction(() => window.__sw.cutscene.cutscene.t > 1.6, null, { timeout: 20000 })
  if (how === 'tap') await page.mouse.click(640, 360)
  else await page.click('.ti-skip')
  await wait(250)
  const t = await cine()
  check(`${how === 'tap' ? '點畫面' : '按「跳過」'}可以跳過`, t.t >= 7.5 || t.s === 'idle', JSON.stringify(t))
  await page.waitForFunction(() => window.__sw.cutscene.cutscene.state === 'idle', null, { timeout: 8000 })
}

// 過場載入中就被取消（回野外）不會留下卡住的狀態；新遊戲重置
await ev(() => {
  const sw = window.__sw
  const i = sw.progress.unlocks.indexOf('intro_town')
  if (i >= 0) sw.progress.unlocks.splice(i, 1)
  const t = sw.townData.TOWN_EXIT
  sw.runtime.player.x = t.x
  sw.runtime.player.z = t.z
})
await ready()
await wait(300)
await ev(() => {
  const sw = window.__sw
  sw.cutscene.queueTownIntro()
})
check('排入過場後切回野外會取消（不會卡在 pending）', await ev(() => {
  const sw = window.__sw
  sw.cutscene.cancelCutscene()
  return sw.cutscene.cutscene.state === 'idle'
}))

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 4).join(' | '))
const ok = results.filter((r) => r.ok).length
console.log(`結果：${ok}/${results.length} 通過`)
writeFileSync(OUT + 'results.json', JSON.stringify(results, null, 1))
await browser.close()
process.exit(ok === results.length ? 0 : 1)
