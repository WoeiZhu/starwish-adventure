// 試玩回饋修正測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node feedback-qa.mjs [標籤]
// 檢查：莉拉事件（事件怪從 9 m 外走來、附近野怪先清掉）、毒霧（重疊不加倍、隊友走出毒圈）、
//       對話時隱藏頭頂血條與飄字、飄字錯開、營火復活點、Boss 戰自動鎖定 Boss、
//       更好的裝備紅點、背包職業篩選不劇透、出生點區域名稱
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'feedback'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/feedback-qa/${label}/`, import.meta.url))
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
const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })
const shot = (n) => page.screenshot({ path: OUT + n + '.png' })

async function newGame(step = 'c2_hunt', x = 0, z = 22) {
  await ev(
    ([step, x, z]) => {
      localStorage.removeItem('starwish.save.v1')
      const sw = window.__sw
      sw.useGame.getState().setCamMode('explore')
      sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
      sw.useGame.getState().startGame()
      for (const c of ['archer', 'mage', 'cleric']) sw.cstate.recruitAlly(c)
      sw.progress.story.step = step
      sw.progress.members.knight.level = 10
      for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
      sw.useGame.setState({ dialog: null })
    },
    [step, x, z],
  )
  await ready()
  await ev(
    ([x, z]) => {
      const sw = window.__sw
      sw.runtime.player.x = x
      sw.runtime.player.z = z
      let i = 0
      for (const u of sw.combat.units) {
        if (u.kind === 'ally') (u.x = x - 1 + i), (u.z = z + 1.5), i++
        if (u.id === sw.combat.units[0].id) (u.x = x), (u.z = z)
      }
    },
    [x, z],
  )
  await wait(2500) // 等新位置的地形區塊載入
}
const hero = () => ev(() => { const h = window.__sw.combat.units[0]; return { x: h.x, z: h.z, hp: h.hp, maxHp: h.maxHp, alive: h.alive, target: h.targetId } })

// ───────────── 一、莉拉事件 ─────────────
await newGame('c2_hunt', 6, -44)
const ev1 = await ev(() => {
  const sw = window.__sw
  const at = { x: 6, z: -51 }
  // 在她身邊放兩隻野怪（模擬原本的蘑菇群），事件開始後應該被清掉
  for (let i = 0; i < 2; i++) sw.cstate.spawnEnemy({ name: '野蘑菇', color: '#fff', species: 'mushroom', x: at.x + 2 + i, z: at.z + 1, level: 8 })
  const it = sw.story.interactables().find((i) => i.kind === 'companion' && i.classId === 'apothecary')
  sw.story.interactWith(it.id)
  const g = sw.useGame
  const d = g.getState().dialog
  g.setState({ dialog: { ...d, index: d.lines.length - 1 } })
  const i = g.getState().dialog.choices.findIndex((c) => c.label === '幫她擊退蘑菇')
  g.getState().choose(i)
  const ev = sw.combat.units.filter((u) => u.tag === 'ev_herb')
  const wild = sw.combat.units.filter((u) => u.team === 'enemy' && u.respawns && u.alive && Math.hypot(u.x - at.x, u.z - at.z) < 8)
  return { n: ev.length, dists: ev.map((u) => Math.hypot(u.x - at.x, u.z - at.z)), wild: wild.length }
})
check('事件怪 3 隻、距離莉拉約 9 m', ev1.n === 3 && ev1.dists.every((d) => d > 8 && d < 10), JSON.stringify(ev1.dists.map((d) => +d.toFixed(1))))
check('事件開始時，8 m 內原本的野怪被清掉', ev1.wild === 0, 'wild=' + ev1.wild)

// ───────────── 二、毒霧 ─────────────
await newGame('c2_hunt', 0, 22)
const gas = await ev(async () => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  const boss = sw.cstate.spawnEnemy({ name: '假蘑菇', color: '#fff', species: 'mushroom', x: h.x + 14, z: h.z, level: 1 })
  boss.stun = 99
  h.hp = h.maxHp = 100000
  // 三團重疊的毒霧（同一個位置）
  for (let i = 0; i < 3; i++) sw.combat.hazards.push({ owner: boss, x: h.x, z: h.z, radius: 3, delay: 0, total: 1, power: 0.35, linger: 3, tick: 0.7, tickTimer: 0, color: '#b45fe8' })
  const hp0 = h.hp
  await new Promise((r) => setTimeout(r, 2100))
  const lost = hp0 - h.hp
  return { lost, ticks: 2.1 / 0.7 }
})
const per = await ev(() => { const h = window.__sw.combat.units[0]; return h.maxHp })
check('三團毒霧重疊：同一個人不會被加倍傷害（約 3～4 次，不是 9～12 次）', gas.lost > 0, `lost=${Math.round(gas.lost)} (ticks≈${gas.ticks.toFixed(1)})`)
// 單團毒霧在同樣時間的傷害量當基準
const base = await ev(async () => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  sw.combat.hazards.length = 0
  const o = sw.combat.units.find((u) => u.name === '假蘑菇')
  h.hp = h.maxHp
  sw.combat.hazards.push({ owner: o, x: h.x, z: h.z, radius: 3, delay: 0, total: 1, power: 0.35, linger: 3, tick: 0.7, tickTimer: 0 })
  const hp0 = h.hp
  await new Promise((r) => setTimeout(r, 2100))
  return hp0 - h.hp
})
check('三團重疊的傷害不超過單團的 1.5 倍', gas.lost <= base * 1.5 + 1, `重疊=${Math.round(gas.lost)} 單團=${Math.round(base)}`)

// 隊友會走出毒圈
const flee = await ev(async () => {
  const sw = window.__sw
  sw.combat.hazards.length = 0
  const o = sw.combat.units.find((u) => u.name === '假蘑菇')
  const a = sw.combat.units.find((u) => u.kind === 'ally' && u.alive)
  sw.combat.hazards.push({ owner: o, x: a.x, z: a.z, radius: 2.4, delay: 0, total: 1, power: 0.01, linger: 3.4, tick: 0.7, tickTimer: 0 })
  const d0 = 0
  await new Promise((r) => setTimeout(r, 1500))
  return Math.hypot(a.x - sw.combat.hazards[0].x, a.z - sw.combat.hazards[0].z)
})
check('隊友站在毒霧裡會走出圈外', flee > 2.4, 'dist=' + flee.toFixed(2))

// ───────────── 三、對話時隱藏頭頂 UI ─────────────
const ui = await ev(async () => {
  const sw = window.__sw
  sw.combat.hazards.length = 0
  const h = sw.combat.units[0]
  const e = sw.cstate.spawnEnemy({ name: '血條怪', color: '#fff', x: h.x + 3, z: h.z, level: 1 })
  e.hp = e.maxHp * 0.5
  sw.cstate.addFloater(h, '孢子毒霧！', '#a8e87a', false, 1.7)
  await new Promise((r) => setTimeout(r, 300))
  const count = () => {
    let n = 0
    sw.scene.traverse((o) => { if (o.isSprite && o.renderOrder === 20 && o.visible) n++ })
    return n
  }
  const before = count()
  sw.useGame.setState({ dialog: { speaker: 'x', lines: ['…'], index: 0 } })
  await new Promise((r) => setTimeout(r, 300))
  const during = count()
  sw.useGame.setState({ dialog: null })
  return { before, during }
})
check('對話時隱藏飄字（飄字精靈全部不可見）', ui.before > 0 && ui.during === 0, JSON.stringify(ui))

// ───────────── 四、飄字錯開 ─────────────
const fl = await ev(() => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  const f0 = sw.combat.floaters
  for (const f of f0) f.life = 0
  sw.cstate.addFloater(h, '孢子毒霧！', '#a8e87a', false, 1.5)
  sw.cstate.addFloater(h, '二連擊', '#fff', false, 1.5)
  sw.cstate.addFloater(h, '旋刃', '#fff', false, 1.5)
  return f0.filter((f) => f.life > 0).map((f) => +f.y.toFixed(2))
})
check('同位置連續冒出的飄字往上錯開', fl.length === 3 && new Set(fl).size === 3 && fl[0] < fl[1] && fl[1] < fl[2], JSON.stringify(fl))

// ───────────── 五、營火復活點 ─────────────
async function dieAt(step, x, z) {
  await newGame(step, x, z)
  await ev(() => { const sw = window.__sw; sw.actions.kill(sw.combat.units[0]) })
  await wait(3800)
  return ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z, alive: window.__sw.combat.units[0].alive }))
}
let r = await dieAt('c2_hunt', 0, -50)
check('月光山谷倒下 → 在山谷營火醒來', r.alive && Math.hypot(r.x + 1.5, r.z + 46.5 - 1.6) < 2, JSON.stringify(r))
await shot('1_valley_campfire')
r = await dieAt('boss', 27, -19)
check('石環倒下 → 在石環營火醒來', r.alive && Math.hypot(r.x - 18.5, r.z + 7.5 - 1.6) < 2, JSON.stringify(r))
r = await dieAt('hunt', -5, 20)
check('草原倒下（離村子近）→ 回星光村', r.alive && Math.hypot(r.x, r.z - 6) < 2, JSON.stringify(r))
r = await dieAt('hunt', 0, -50)
check('第二章還沒解鎖的山谷營火不會被選中（改在石環營火）', r.alive && r.z > -20, JSON.stringify(r))

// ───────────── 六、Boss 戰自動鎖定 Boss ─────────────
await newGame('boss', 20, -8)
const lock = await ev(async () => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  h.hp = h.maxHp = 100000
  const lizard = sw.cstate.spawnEnemy({ name: '砂鱗蜥兵', color: '#fff', species: 'lizard', x: h.x + 3, z: h.z, level: 9, tag: 'wild' })
  const boss = sw.cstate.spawnEnemy({ name: '史萊姆王', color: '#b06bff', x: h.x + 9, z: h.z, level: 9, tier: 'boss', tag: 'boss' })
  for (const e of [lizard, boss]) { e.targetId = h.id; e.stun = 99 }
  h.targetId = null
  await new Promise((r) => setTimeout(r, 800))
  return { target: h.targetId, boss: boss.id, lizard: lizard.id }
})
check('沒有鎖定目標時，Boss 戰自動鎖定 Boss（不是旁邊的野怪）', lock.target === lock.boss, JSON.stringify(lock))
// 祭壇對話有建議等級與藥水
const altar = await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  sw.cstate.recruitAlly && 0
  sw.progress.story.step = 'boss'
  sw.progress.potions = 1
  sw.runtime.player.x = 27; sw.runtime.player.z = -19
  sw.story.interactWith('altar')
  return sw.useGame.getState().dialog?.lines ?? null
})
check('祭壇對話：建議等級、藥水不足時提醒', !!altar && altar.some((l) => l.includes('建議全隊 LV.') && l.includes('先去村裡買藥水')), JSON.stringify(altar)?.slice(0, 120))

// ───────────── 七、更好的裝備紅點、背包篩選、區域名稱 ─────────────
await newGame('done', 0, 22)
const gear = await ev(() => {
  const sw = window.__sw
  sw.progress.inventory.length = 0
  const roster = ['knight', ...sw.progress.recruited]
  const before = sw.prog.upgradeCount(roster)
  const it = sw.items.makeItem('armor', 12, 3)
  sw.progress.inventory.push(it)
  return { before, after: sw.prog.upgradeCount(roster) }
})
check('撿到更好的裝備 → 紅點件數增加', gear.before === 0 && gear.after === 1, JSON.stringify(gear))
await ev(() => window.__sw.useGame.getState().setPaused?.(false))
const badge = await ev(async () => {
  await new Promise((r) => setTimeout(r, 400))
  return document.querySelector('.menu-btn .badge')?.textContent ?? null
})
check('HUD 選單鈕有紅點', badge !== null && Number(badge) >= 1, 'badge=' + badge)
await ev(() => window.__sw.useGame.getState().openMenu('bag'))
await wait(300)
const opts = await ev(() => [...document.querySelectorAll('select[aria-label="職業篩選"] option')].map((o) => o.textContent))
check('背包職業篩選只列出已加入的職業（沒有暗殺者、藥師）', !opts.some((t) => t.includes('暗殺者') || t.includes('藥師')) && opts.some((t) => t.includes('戰士')), JSON.stringify(opts))
await ev(() => window.__sw.useGame.getState().closeMenu())
await newGame('talk', 0, 6)
await wait(600)
const region = await ev(() => window.__sw.useGame.getState().region)
check('出生點的區域名稱是星光村', region === 'village', region)

// ───────────── 八、森林營火、Boss 血量存檔 ─────────────
r = await dieAt('recruit', -27, 6)
check('迷霧森林倒下 → 在森林營火醒來', r.alive && Math.hypot(r.x + 19, r.z - 9 - 1.6) < 2, JSON.stringify(r))

await newGame('boss', 25, -12)
await ev(() => {
  const sw = window.__sw
  for (const c of ['assassin']) sw.cstate.recruitAlly(c)
  sw.story.interactWith('altar')
  const g = sw.useGame
  const d = g.getState().dialog
  g.setState({ dialog: { ...d, index: d.lines.length - 1 } })
  g.getState().choose(g.getState().dialog.choices.findIndex((c) => c.label === '啟動祭壇'))
})
await wait(400)
const hp1 = await ev(() => {
  const sw = window.__sw
  const b = sw.combat.units.find((u) => u.tag === 'boss')
  b.hp = Math.round(b.maxHp * 0.4)
  b.stun = 99
  sw.useGame.getState().saveGame()
  return JSON.parse(localStorage.getItem('starwish.save.v1')).bossHp
})
check('存檔記下 Boss 血量比例（約 40%）', hp1?.boss > 0.35 && hp1.boss < 0.45, JSON.stringify(hp1))
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
await ev(() => window.__sw.useGame.getState().continueGame())
await ready()
await wait(2500)
const hp2 = await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  for (const c of ['archer', 'mage', 'cleric', 'assassin']) if (!sw.progress.recruited.includes(c)) sw.cstate.recruitAlly(c)
  sw.runtime.player.x = 25
  sw.runtime.player.z = -12
  sw.story.interactWith('altar')
  const g = sw.useGame
  const d = g.getState().dialog
  g.setState({ dialog: { ...d, index: d.lines.length - 1 } })
  g.getState().choose(g.getState().dialog.choices.findIndex((c) => c.label === '啟動祭壇'))
  const b = sw.combat.units.find((u) => u.tag === 'boss')
  return b && { r: b.hp / b.maxHp, loaded: sw.progress.bossHp }
})
check('重新載入後再啟動祭壇：Boss 血量接續（約 40%）', !!hp2 && hp2.r > 0.35 && hp2.r < 0.45, JSON.stringify(hp2))
await ev(() => {
  const sw = window.__sw
  const b = sw.combat.units.find((u) => u.tag === 'boss')
  sw.actions.kill(b)
})
await wait(200)
const cleared = await ev(() => window.__sw.progress.bossHp.boss)
check('擊敗 Boss 後清除血量記錄', cleared === undefined, String(cleared))

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 3).join(' | '))
const failed = results.filter((x) => !x.ok)
console.log(`結果：${results.length - failed.length}/${results.length} 通過`)
await browser.close()
process.exit(failed.length ? 1 : 0)
