// 鏡頭跟隨測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node camfollow-qa.mjs [標籤]
// 檢查：往前走鏡頭不動、往側邊走鏡頭轉到前進方向背後、倒退不翻面、自己轉視角就暫停（停下來再出發才恢復）、
//       選單可關閉、關閉後不轉、對話中不轉、設定會記住、主控台無錯誤
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'camfollow'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/camfollow-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.QA_URL ?? 'http://localhost:5183/'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(ok ? '✔' : '✘', name, detail)
}
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
const ev = (f, a) => page.evaluate(f, a)
const wait = (ms) => page.waitForTimeout(ms)

await ev(() => {
  localStorage.removeItem('starwish.save.v1')
  localStorage.removeItem('starwish.camfollow')
  const sw = window.__sw
  sw.useGame.getState().setCamMode('immersive')
  sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
  sw.useGame.getState().startGame()
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  sw.useGame.setState({ dialog: null })
})
await page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })
await wait(2500) // 等進場鏡頭穩定

/** 把主角放回開闊處，鏡頭轉回正前（yaw 0） */
const reset = async () => {
  await ev(() => {
    const sw = window.__sw
    sw.runtime.player.x = 0
    sw.runtime.player.z = 22
    sw.runtime.player.facing = Math.PI // 面向鏡頭正前方（yaw 0 時的「往前」）
    sw.cam.yaw = sw.cam.yawT = 0
    for (const u of sw.combat.units) if (u.kind === 'ally') (u.x = 0), (u.z = 24)
  })
  await wait(400)
}
const read = () =>
  ev(() => {
    const sw = window.__sw
    return { yaw: sw.cam.yawT, facing: sw.runtime.player.facing, speed: sw.runtime.player.speed, x: sw.runtime.player.x, z: sw.runtime.player.z, auto: sw.useGame.getState().camFollow }
  })
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k)
  await wait(ms)
  for (const k of keys.slice().reverse()) await page.keyboard.up(k)
}

// 1. 往前走：鏡頭不用轉
await reset()
let a = await read()
await hold(['KeyW'], 1200)
let b = await read()
check('往前走：鏡頭方向不變', Math.abs(wrap(b.yaw - a.yaw)) < 0.05, `Δ=${wrap(b.yaw - a.yaw).toFixed(3)} 走了 ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m`)

// 2. 往右走：鏡頭轉到前進方向的背後（yaw 減少，方向差變小）
await reset()
a = await read()
const err0 = Math.abs(wrap(a.facing + Math.PI - a.yaw))
await hold(['KeyD'], 1600)
b = await read()
check('往右走：鏡頭跟著轉', wrap(b.yaw - a.yaw) < -0.5, `Δyaw=${wrap(b.yaw - a.yaw).toFixed(2)}`)
await page.screenshot({ path: OUT + '1_turning_right.png' })

// 3. 倒退走（朝鏡頭走）：不翻面
await reset()
a = await read()
await hold(['KeyS'], 1200)
b = await read()
check('倒退走：鏡頭不翻面', Math.abs(wrap(b.yaw - a.yaw)) < 0.1, `Δ=${wrap(b.yaw - a.yaw).toFixed(3)}`)

// 4. 自己轉動視角（Q）：之後繼續走也不再自動轉；停下來再出發才恢復
await reset()
await page.keyboard.down('KeyD')
await wait(250)
await page.keyboard.down('KeyQ')
await wait(300)
await page.keyboard.up('KeyQ')
const atQ = await read()
await wait(1200)
const later = await read()
check('自己轉視角後，繼續走鏡頭不再自動轉', Math.abs(wrap(later.yaw - atQ.yaw)) < 0.03 && later.speed > 1, `Δ=${wrap(later.yaw - atQ.yaw).toFixed(3)} speed=${later.speed.toFixed(1)}`)
await page.keyboard.up('KeyD')
await wait(700) // 停下來
await page.keyboard.down('KeyD')
const resume0 = await read()
await wait(1200)
const resume1 = await read()
await page.keyboard.up('KeyD')
check('停下來再出發：恢復自動轉向', Math.abs(wrap(resume1.yaw - resume0.yaw)) > 0.4, `Δ=${wrap(resume1.yaw - resume0.yaw).toFixed(2)}`)

// 5. 右鍵拖曳（滑鼠）也算自己轉視角
await reset()
await page.keyboard.down('KeyD')
await wait(200)
await page.mouse.move(640, 360)
await page.mouse.down({ button: 'right' })
await page.mouse.move(600, 360, { steps: 4 })
await page.mouse.up({ button: 'right' })
const atDrag = await read()
await wait(1000)
const afterDrag = await read()
await page.keyboard.up('KeyD')
check('右鍵拖曳轉視角後也會暫停自動轉向', Math.abs(wrap(afterDrag.yaw - atDrag.yaw)) < 0.03, `Δ=${wrap(afterDrag.yaw - atDrag.yaw).toFixed(3)}`)

// 6. 選單開關：關閉後不轉
await wait(700)
await page.getByRole('button', { name: '選單' }).first().click()
await wait(200)
const btnName = await ev(() => [...document.querySelectorAll('button')].map((x) => x.textContent).find((t) => t?.includes('鏡頭跟隨')) ?? null)
await page.getByRole('button', { name: /鏡頭跟隨/ }).click()
const off = await ev(() => ({ on: window.__sw.useGame.getState().camFollow, saved: localStorage.getItem('starwish.camfollow') }))
check('「鏡頭跟隨」可以關閉並記住', off.on === false && off.saved === 'off', JSON.stringify({ btn: btnName, ...off }))
await ev(() => window.__sw.useGame.setState({ paused: false }))
await reset()
a = await read()
await hold(['KeyD'], 1200)
b = await read()
check('關閉後往右走：鏡頭不轉', Math.abs(wrap(b.yaw - a.yaw)) < 0.03, `Δ=${wrap(b.yaw - a.yaw).toFixed(3)}`)

// 7. 重新開啟、對話中不轉
await ev(() => window.__sw.useGame.getState().setCamFollow(true))
await reset()
a = await read()
await ev(() => window.__sw.useGame.setState({ dialog: { speaker: 'x', lines: ['…'], index: 0 } }))
await hold(['KeyD'], 600)
await ev(() => window.__sw.useGame.setState({ dialog: null }))
b = await read()
check('對話中不自動轉', Math.abs(wrap(b.yaw - a.yaw)) < 0.03, `Δ=${wrap(b.yaw - a.yaw).toFixed(3)}`)

// 8. 點擊移動的路徑：朝側邊走時鏡頭轉到前進方向背後
await reset()
await ev(() => {
  const sw = window.__sw
  sw.runtime.path = [{ x: sw.runtime.player.x + 14, z: sw.runtime.player.z }]
})
a = await read()
await wait(1500)
b = await read()
check('點擊自動移動（朝 +X 走）：鏡頭跟著轉到背後', wrap(b.yaw - a.yaw) < -0.5 && b.speed > 1, `Δyaw=${wrap(b.yaw - a.yaw).toFixed(2)} speed=${b.speed.toFixed(1)}`)

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 3).join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(`結果：${results.length - failed.length}/${results.length} 通過`)
await browser.close()
process.exit(failed.length ? 1 : 0)
