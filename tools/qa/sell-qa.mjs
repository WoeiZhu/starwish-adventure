// 賣東西畫面測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node sell-qa.mjs [標籤]
// 檢查：商店對話有「賣掉不要的裝備」、標記（留著／可賣／待用／低等級）、一鍵標記、一鍵賣出（兩段確認）、
//       裝備中與史詩以上不會被自動賣、金幣與背包正確、Esc 關閉、背包按鈕、手機版面、主控台無錯誤
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'sell'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/sell-qa/${label}/`, import.meta.url))
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
const shot = (n) => page.screenshot({ path: OUT + n + '.png' })

// 新局：騎士主角（LV10）＋弓手；背包放 7 件測試裝備
await ev(() => {
  localStorage.removeItem('starwish.save.v1')
  const sw = window.__sw
  sw.useGame.getState().setCamMode('explore')
  sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
  sw.useGame.getState().startGame()
  sw.cstate.recruitAlly('archer')
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  sw.useGame.setState({ dialog: null })
})
await page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })
const setup = await ev(() => {
  const sw = window.__sw
  const { progress, prog, items } = sw
  progress.members.knight.level = 10
  progress.inventory.length = 0
  const mk = (slot, lv, q, cls) => {
    const it = items.makeItem(slot, lv, q, cls)
    progress.inventory.push(it)
    return it
  }
  const wEq = mk('weapon', 10, 2, 'knight') // 身上的武器
  prog.equip('knight', wEq)
  const aEq = mk('armor', 8, 1) // 身上的防具
  prog.equip('knight', aEq)
  const best = mk('armor', 10, 3) // 比身上好：留著
  const lowA = mk('armor', 3, 0) // 比身上差、低等級：可賣
  const midA = mk('armor', 7, 1) // 比身上差：可賣（但不是低等級）
  const lowW = mk('weapon', 2, 0, 'knight') // 騎士舊武器：可賣、低等級
  const wait_ = mk('weapon', 5, 1, 'assassin') // 暗殺者還沒入隊：待用
  const legend = mk('accessory', 1, 4) // 傳說但很爛（身上沒飾品→其實是升級）
  const acc2 = mk('accessory', 2, 0) // 第二件飾品：比 legend 差，可賣
  return { ids: { wEq: wEq.uid, aEq: aEq.uid, best: best.uid, lowA: lowA.uid, midA: midA.uid, lowW: lowW.uid, wait: wait_.uid, legend: legend.uid, acc2: acc2.uid }, gold: progress.gold }
})
// ───────────── 一、判斷 ─────────────
const adv = await ev((ids) => {
  const sw = window.__sw
  const r = ['knight', ...sw.progress.recruited]
  const out = {}
  for (const [k, uid] of Object.entries(ids)) {
    const it = sw.progress.inventory.find((i) => i.uid === uid)
    out[k] = sw.prog.sellAdvice(it, r)
  }
  return out
}, setup.ids)
check('比身上好的防具：留著', adv.best.keep && !adv.best.junk)
check('比身上差的防具：可賣', adv.lowA.junk && adv.midA.junk)
check('等級 3（隊伍最高 10）算低等級；等級 7 不算', adv.lowA.low && !adv.midA.low)
check('舊武器：可賣＋低等級', adv.lowW.junk && adv.lowW.low)
check('還沒入隊職業的武器：待用、不算可賣', adv.wait.nobody && !adv.wait.junk)
check('身上沒有飾品時，最好的那件飾品是留著；較差的備品可賣', adv.legend.keep && adv.acc2.junk)

// ───────────── 二、商店對話裡有賣東西 ─────────────
await ev(() => {
  window.__sw.runtime.player.x = 0
  window.__sw.story.interactWith('merchant')
})
await wait(300)
const choices = await ev(() => window.__sw.useGame.getState().dialog?.choices?.map((c) => ({ label: c.label, disabled: c.disabled })) ?? null)
check('野外商人有「賣掉不要的裝備」', !!choices?.some((c) => c.label === '賣掉不要的裝備' && !c.disabled), JSON.stringify(choices))
await ev(() => {
  const g = window.__sw.useGame
  const d = g.getState().dialog
  d.index = d.lines.length - 1
  g.setState({ dialog: { ...d } })
})
const ok = await ev(() => {
  const g = window.__sw.useGame
  const i = g.getState().dialog.choices.findIndex((c) => c.label === '賣掉不要的裝備')
  g.getState().choose(i)
  const s = g.getState()
  return { sell: s.sell, paused: s.paused, dialog: !!s.dialog }
})
check('選了之後開啟賣出畫面並暫停', ok.sell && ok.paused && !ok.dialog, JSON.stringify(ok))
await wait(400)
await shot('1_sell_panel')

// ───────────── 三、畫面內容 ─────────────
const tiles = await ev(() => [...document.querySelectorAll('.sell-tile')].map((t) => ({ cls: t.className, tag: t.querySelector('.sell-tag')?.textContent, low: !!t.querySelector('.sell-low') })))
check('只列出沒裝備的 7 件（裝備中的不列）', tiles.length === 7, 'n=' + tiles.length)
check('可賣的排在最前面', tiles.slice(0, 4).every((t) => t.tag === '可賣'), tiles.map((t) => t.tag).join(','))
check('低等級有「低」標', tiles.filter((t) => t.low).length === 5, 'low=' + tiles.filter((t) => t.low).length)
check('可賣的格子有亮起的樣式', tiles.filter((t) => t.cls.includes('junk')).length === 4)

// 一鍵標記「沒用的」：lowA、midA、lowW、acc2（4 件），不含留著與待用
await page.getByRole('button', { name: /^沒用的/ }).click()
await wait(150)
const picked1 = await ev(() => document.querySelectorAll('.sell-tile.picked').length)
check('標記「沒用的」勾選 4 件', picked1 === 4, 'n=' + picked1)
const btnText = await ev(() => [...document.querySelectorAll('.sell-bar .m-btn')].map((b) => b.textContent))
check('下方顯示件數與金幣', btnText[1].includes('4 件'), btnText[1])
await shot('2_marked')

// 取消標記後點選單件（傳說品質也能手動選）
await page.getByRole('button', { name: '取消標記' }).click()
await page.locator('.sell-tile.keep').first().click()
await wait(100)
const info = await ev(() => document.querySelector('.sell-info')?.textContent ?? '')
check('點格子會顯示說明與理由', info.includes('建議留著'), info.slice(0, 60))
await page.getByRole('button', { name: '取消標記' }).click()

// ───────────── 四、一鍵賣出：兩段確認 ─────────────
const before = await ev(() => ({ gold: window.__sw.progress.gold, n: window.__sw.progress.inventory.length }))
const expect = await ev((ids) => {
  const sw = window.__sw
  return ['lowA', 'midA', 'lowW', 'acc2'].reduce((n, k) => n + sw.prog.sellPrice(sw.progress.inventory.find((i) => i.uid === ids[k])), 0)
}, setup.ids)
await page.getByRole('button', { name: /一鍵賣出沒用的/ }).click()
await wait(100)
const mid = await ev(() => ({ gold: window.__sw.progress.gold, n: window.__sw.progress.inventory.length, txt: [...document.querySelectorAll('.sell-bar .m-btn')][0].textContent }))
check('第一次按只進入確認，不會直接賣', mid.gold === before.gold && mid.n === before.n && mid.txt.includes('再按一次'), mid.txt)
await page.getByRole('button', { name: /再按一次確認/ }).click()
await wait(200)
const after = await ev((ids) => {
  const sw = window.__sw
  const has = (k) => sw.progress.inventory.some((i) => i.uid === ids[k])
  return { gold: sw.progress.gold, n: sw.progress.inventory.length, has: Object.fromEntries(Object.keys(ids).map((k) => [k, has(k)])), eq: sw.progress.members.knight.equip }
}, setup.ids)
check('賣出 4 件、金幣正確', after.n === before.n - 4 && after.gold === before.gold + expect, `gold ${before.gold}→${after.gold} (+${expect})`)
check('身上的裝備沒被賣', after.has.wEq && after.has.aEq && !!after.eq.weapon && !!after.eq.armor)
check('留著、待用的沒被賣', after.has.best && after.has.wait && after.has.legend)
check('可賣的都不見了', !after.has.lowA && !after.has.midA && !after.has.lowW && !after.has.acc2)
const left = await ev(() => document.querySelectorAll('.sell-tile').length)
check('畫面同步只剩 3 件', left === 3, 'n=' + left)
await shot('3_after_sell')

// 手動選史詩以上：兩段確認並提醒
await page.locator('.sell-tile.keep').first().click()
await page.getByRole('button', { name: /賣出已勾選/ }).click()
const warn = await ev(() => [...document.querySelectorAll('.sell-bar .m-btn')][1].textContent)
check('手動選了建議留著／高品質的，確認時有提醒', warn.includes('建議留著'), warn)
await page.keyboard.press('Escape')
await wait(200)
const closed = await ev(() => ({ sell: window.__sw.useGame.getState().sell, paused: window.__sw.useGame.getState().paused, panel: !!document.querySelector('.sell')}))
check('Esc 關閉、遊戲繼續、沒賣掉東西', !closed.sell && !closed.paused && !closed.panel && (await ev(() => window.__sw.progress.inventory.length)) === after.n)

// ───────────── 五、背包裡的入口與城鎮商店 ─────────────
await ev(() => window.__sw.useGame.getState().openMenu('bag'))
await wait(300)
await page.getByRole('button', { name: /賣東西/ }).click()
await wait(300)
const fromBag = await ev(() => ({ sell: window.__sw.useGame.getState().sell, menu: window.__sw.useGame.getState().menu }))
check('背包的「賣東西」可以開啟', fromBag.sell && !fromBag.menu, JSON.stringify(fromBag))
await ev(() => window.__sw.useGame.getState().closeSell())
const empty = await ev(() => {
  const sw = window.__sw
  sw.progress.inventory.length = 0
  sw.story.interactWith('merchant')
  const d = sw.useGame.getState().dialog
  return d.choices.find((c) => c.label === '賣掉不要的裝備')
})
check('沒有可賣的東西時，選項反灰', !!empty?.disabled, empty?.disabled)
await ev(() => window.__sw.useGame.getState().closeDialog())

// ───────────── 六、手機橫拿與直拿 ─────────────
await ev(() => {
  const sw = window.__sw
  const mk = (slot, lv, q, cls) => sw.progress.inventory.push(sw.items.makeItem(slot, lv, q, cls))
  for (let i = 0; i < 14; i++) mk(i % 2 ? 'armor' : 'accessory', 1 + (i % 4), i % 3)
  sw.useGame.getState().openSell()
})
for (const [name, w, h] of [['phone-landscape', 844, 390], ['phone-portrait', 390, 844]]) {
  await page.setViewportSize({ width: w, height: h })
  await wait(400)
  const box = await ev(() => {
    const r = document.querySelector('.ms.sell').getBoundingClientRect()
    const bar = document.querySelector('.sell-bar').getBoundingClientRect()
    return { w: r.width, h: r.height, barBottom: bar.bottom, vw: innerWidth, vh: innerHeight, scrollX: document.documentElement.scrollWidth > innerWidth }
  })
  check(`${name}：面板填滿且底部按鈕在畫面內`, box.w <= box.vw && box.barBottom <= box.vh + 1 && !box.scrollX, JSON.stringify(box))
  await shot(`4_${name}`)
}
await page.setViewportSize({ width: 1280, height: 720 })
await wait(200)
await shot('5_desktop_many')

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 3).join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(`結果：${results.length - failed.length}/${results.length} 通過`)
await browser.close()
process.exit(failed.length ? 1 : 0)
