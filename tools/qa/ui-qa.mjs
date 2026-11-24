// 選單 UI 自動測試（本機 Edge 無頭模式，先開 dev server：npm run dev，port 5183）
//   node ui-qa.mjs [標籤] [分頁 bag|party|tree]
// 依序用手機橫拿、手機直拿、平板、電腦解析度開啟選單，檢查：
//   內容不超出視窗、按鈕不重疊、按鈕觸控區 ≥ 44px、文字沒被截斷、指定區域可以捲動、
//   點格子會打開詳情（手機是彈出面板）、關閉鈕永遠可見、手機不顯示鍵盤提示、背景遊戲點不到
// 截圖存到 docs/ui-qa/<標籤>/
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'bag', tab = 'bag'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/ui-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.QA_URL ?? 'http://localhost:5183/'

const VIEWS = [
  { id: 'phone-landscape', w: 844, h: 390, touch: true },
  { id: 'phone-landscape-small', w: 667, h: 375, touch: true },
  { id: 'phone-portrait', w: 390, h: 844, touch: true },
  { id: 'tablet-landscape', w: 1024, h: 768, touch: true },
  { id: 'desktop', w: 1440, h: 900, touch: false },
  { id: 'desktop-small', w: 1280, h: 720, touch: false },
]

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const results = []
const log = []
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  log.push(s)
  console.log(s)
}
const check = (view, name, ok, detail = '') => {
  results.push({ view, name, ok, detail })
  say(ok ? '✔' : '✘', `[${view}]`, name, detail)
}

/** 準備存檔：四人隊伍、等級、金幣、各品質裝備 26 件（有些已裝備、有些是新的） */
async function setup(page) {
  await page.evaluate(() => {
    localStorage.clear()
    const sw = window.__sw
    const items = sw.items
    const prog = sw.prog
    sw.useGame.getState().setProfile({ classId: 'archer', name: '小星' })
    sw.useGame.getState().startGame()
    for (const c of ['mage', 'knight', 'cleric']) sw.cstate.recruitAlly(c)
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    const lv = { archer: 14, mage: 13, knight: 12, cleric: 12 }
    for (const c in lv) prog.progress.members[c].level = lv[c]
    prog.progress.gold = 1234
    prog.progress.potions = 5
    const classes = ['archer', 'mage', 'knight', 'cleric']
    const slots = ['weapon', 'armor', 'weapon', 'accessory', 'weapon', 'armor', 'accessory']
    for (let n = 0; n < 26; n++) {
      const it = items.makeItem(slots[n % slots.length], 4 + ((n * 7) % 12), [0, 1, 2, 0, 3, 1, 4, 2][n % 8], classes[n % 4])
      prog.addItem(it)
    }
    // 隊員各穿一些，留一些更好的在背包（顯示 ▲）
    for (const c of classes) {
      const inv = prog.progress.inventory
      const w = inv.find((i) => i.slot === 'weapon' && i.classId === c && i.quality <= 1)
      if (w) prog.equip(c, w)
    }
    const armor = prog.progress.inventory.filter((i) => i.slot === 'armor')
    if (armor[0]) prog.equip('archer', armor[0])
    if (armor[1]) prog.equip('knight', armor[1])
    // 只有後 6 件算新拿到
    prog.freshItems.clear()
    for (const it of prog.progress.inventory.slice(-6)) prog.freshItems.add(it.uid)
    sw.cstate.refreshParty()
  })
}

/** 一次量完：溢出、重疊、觸控區、截斷、鍵盤提示 */
function audit() {
  const vw = innerWidth
  const vh = innerHeight
  const root = document.querySelector('.ms')
  const out = { overflow: [], overlap: [], small: [], truncated: [], kbd: 0, docScroll: [document.documentElement.scrollWidth - vw, document.documentElement.scrollHeight - vh] }
  if (!root) return { missing: true }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null
    return r
  }
  // 被可捲動／隱藏溢出的祖先裁掉的部分不算
  const clipRect = (el) => {
    let r = { left: 0, top: 0, right: vw, bottom: vh }
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect()
        r = { left: Math.max(r.left, pr.left), top: Math.max(r.top, pr.top), right: Math.min(r.right, pr.right), bottom: Math.min(r.bottom, pr.bottom) }
      }
    }
    return r
  }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 24)
  const all = root.querySelectorAll('*')
  for (const el of all) {
    const r = visible(el)
    if (!r) continue
    // 超出視窗：元素本身不在可捲動區內卻跑出畫面
    let scrolled = false
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) {
        scrolled = true
        break
      }
    }
    if (!scrolled && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1)) out.overflow.push(name(el))
    if (el.tagName === 'KBD') out.kbd++
  }
  const ctrls = [...root.querySelectorAll('button, select, [role=tab]')].filter((el) => visible(el))
  for (const el of ctrls) {
    const r = el.getBoundingClientRect()
    const c = clipRect(el)
    const vis = { w: Math.min(r.right, c.right) - Math.max(r.left, c.left), h: Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) }
    if (vis.w <= 0 || vis.h <= 0) continue // 捲到看不到的
    if ((r.width < 43.5 || r.height < 43.5) && !el.classList.contains('tile')) out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
    if (el.classList.contains('tile') && (r.width < 43.5 || r.height < 43.5)) out.small.push(`tile ${Math.round(r.width)}`)
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.truncated.push(name(el))
  }
  // 文字截斷：單行的文字容器被切掉
  for (const el of root.querySelectorAll('b, small, span, h3, dt, dd, .chip, .ms-tab')) {
    const r = visible(el)
    if (!r || el.children.length > 2) continue
    if (el.closest('.cmp-head')) continue // 目前裝備名稱刻意用省略號
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.truncated.push(name(el))
  }
  // 重疊：兩個控制項互相蓋到（巢狀的不算）
  const boxes = ctrls.map((el) => ({ el, r: el.getBoundingClientRect(), c: clipRect(el) }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      const x = Math.min(a.r.right, b.r.right, a.c.right, b.c.right) - Math.max(a.r.left, b.r.left, a.c.left, b.c.left)
      const y = Math.min(a.r.bottom, b.r.bottom, a.c.bottom, b.c.bottom) - Math.max(a.r.top, b.r.top, a.c.top, b.c.top)
      if (x > 2 && y > 2) out.overlap.push(`${name(a.el)} ↔ ${name(b.el)}`)
    }
  }
  // 關閉鈕：在畫面內、而且點得到（沒有被別的東西蓋住）
  const x = document.querySelector('.ms-x')
  const xr = x.getBoundingClientRect()
  const hit = document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2)
  out.close = { inView: xr.left >= 0 && xr.top >= 0 && xr.right <= vw && xr.bottom <= vh, clickable: x === hit || x.contains(hit), w: Math.round(xr.width), h: Math.round(xr.height) }
  // 背景遊戲點不到：畫面四角與中間點到的都是選單
  const pts = [
    [4, 4],
    [vw - 4, vh - 4],
    [vw / 2, vh / 2],
    [4, vh - 4],
  ]
  out.blocksGame = pts.every(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.ms-back'))
  return out
}

for (const v of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: v.touch ? 2 : 1,
    isMobile: v.touch && v.w < 1000,
    hasTouch: v.touch,
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.goto(URL_, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
  await setup(page)
  await page.waitForTimeout(1500)
  await page.evaluate((t) => {
    window.__sw.useGame.setState({ dialog: null })
    window.__sw.useGame.getState().openMenu(t)
  }, tab)
  await page.waitForSelector('.ms')
  await page.waitForTimeout(400)
  const shot = (n) => page.screenshot({ path: `${OUT}${v.id}_${n}.png` })
  await shot('1')

  const a = await page.evaluate(audit)
  check(v.id, '沒有內容超出視窗', a.overflow.length === 0 && a.docScroll[0] <= 0 && a.docScroll[1] <= 0, a.overflow.slice(0, 6).join('、') + ` doc=${a.docScroll}`)
  check(v.id, '按鈕沒有重疊', a.overlap.length === 0, a.overlap.slice(0, 6).join('、'))
  check(v.id, '觸控區 ≥ 44px', a.small.length === 0, a.small.slice(0, 8).join('、'))
  check(v.id, '文字沒有被截斷', a.truncated.length === 0, a.truncated.slice(0, 6).join('、'))
  check(v.id, '關閉鈕在畫面內而且點得到', a.close.inView && a.close.clickable, JSON.stringify(a.close))
  check(v.id, '選單擋住背景遊戲', a.blocksGame)
  if (v.touch) check(v.id, '觸控裝置不顯示鍵盤提示', a.kbd === 0, `kbd=${a.kbd}`)

  if (tab === 'bag') {
    // 捲動：只有格子區能捲，整頁不動
    const sc = await page.evaluate(() => {
      const s = document.querySelector('.bag-scroll')
      return { can: s.scrollHeight > s.clientHeight + 4, h: s.clientHeight, sh: s.scrollHeight }
    })
    if (sc.can) {
      const head0 = await page.evaluate(() => document.querySelector('.ms-head').getBoundingClientRect().top)
      const box = await page.locator('.bag-scroll').boundingBox()
      if (v.touch) {
        // 用觸控事件模擬手指往上滑
        const cdp = await ctx.newCDPSession(page)
        // 逐格送觸控事件（合成捲動手勢在無頭模式不可靠）
        const x = Math.round(box.x + box.width / 2)
        const y0 = Math.round(box.y + box.height * 0.85)
        const dy = Math.round(box.height * 0.6)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
        for (let i = 1; i <= 12; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - Math.round((dy * i) / 12) }] })
          await page.waitForTimeout(16)
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, 300)
      }
      await page.waitForTimeout(500)
      const after = await page.evaluate(() => ({ s: document.querySelector('.bag-scroll').scrollTop, head: document.querySelector('.ms-head').getBoundingClientRect().top }))
      check(v.id, '背包格子區可以捲動、標頭不動', after.s > 20 && Math.abs(after.head - head0) < 1, JSON.stringify({ ...sc, ...after, head0 }))
      await page.evaluate(() => (document.querySelector('.bag-scroll').scrollTop = 0))
    } else check(v.id, '背包格子區可以捲動（內容放得下，不需要捲）', true, JSON.stringify(sc))

    // 點一件有 ▲ 的裝備
    const tile = page.locator('.grid .tile:has(.tile-up)').first()
    if (v.touch) await tile.tap()
    else await tile.click()
    await page.waitForTimeout(350)
    const det = await page.evaluate(() => ({
      sheet: !!document.querySelector('.sheet'),
      column: !!document.querySelector('.bag-detail .det-top'),
      cmp: document.querySelectorAll('.cmp em').length,
      title: document.querySelector('.det-title h3')?.textContent,
    }))
    const wantSheet = !(v.w >= 1100 && v.h > 560)
    check(v.id, wantSheet ? '點裝備：彈出詳情面板' : '點裝備：第三欄顯示詳情', wantSheet ? det.sheet : det.column, JSON.stringify(det))
    check(v.id, '詳情有前後屬性比較', det.cmp > 0, `比較數字 ${det.cmp}`)
    await shot('2_detail')
    if (wantSheet) {
      const sa = await page.evaluate(() => {
        const s = document.querySelector('.sheet').getBoundingClientRect()
        const x = document.querySelector('.sheet-x').getBoundingClientRect()
        const btns = [...document.querySelectorAll('.sheet-actions .m-btn')].map((b) => b.getBoundingClientRect())
        return {
          inView: s.left >= -1 && s.top >= -1 && s.right <= innerWidth + 1 && s.bottom <= innerHeight + 1,
          closeOk: x.width >= 44 && x.height >= 44,
          btnsOk: btns.every((b) => b.height >= 44 && b.bottom <= innerHeight + 1),
        }
      })
      check(v.id, '詳情面板完整在畫面內、按鈕 ≥ 44px', sa.inView && sa.closeOk && sa.btnsOk, JSON.stringify(sa))
      // 裝備它，面板關閉，格子上的 ▲ 少一個
      const before = await page.locator('.grid .tile-up').count()
      const btn = page.locator('.sheet-actions .m-btn.primary')
      if (v.touch) await btn.tap()
      else await btn.click()
      await page.waitForTimeout(300)
      const after = await page.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), up: document.querySelectorAll('.grid .tile-up').length }))
      check(v.id, '在詳情面板按裝備：換上並關閉面板', !after.sheet && after.up < before, `▲ ${before} → ${after.up}`)
    } else {
      const btn = page.locator('.det-actions .m-btn.primary')
      await btn.click()
      await page.waitForTimeout(300)
    }

    // 分類與一鍵最佳
    const chip = page.locator('.chip', { hasText: '飾品' })
    if (v.touch) await chip.tap()
    else await chip.click()
    await page.waitForTimeout(200)
    const acc = await page.evaluate(() => document.querySelectorAll('.grid .tile:not(.empty)').length)
    const best = page.locator('.bag-best .m-btn', { hasText: '全隊最佳' })
    if (v.touch) await best.tap()
    else await best.click()
    await page.waitForTimeout(300)
    const bestState = await page.evaluate(() => ({ note: document.querySelector('.bag-note').textContent, up: document.querySelectorAll('.grid .tile-up').length }))
    check(v.id, '分類「飾品」只顯示飾品、全隊最佳有效', acc >= 3 && acc <= 10 && bestState.note.length > 0, `${acc} 件，${bestState.note}`)
    await shot('3_accessory_best')
    // 回到全部，看一下最後的樣子
    const all = page.locator('.chip', { hasText: '全部' })
    if (v.touch) await all.tap()
    else await all.click()
  }

  // 關閉鈕真的能關
  const x = page.locator('.ms-x')
  if (v.touch) await x.tap()
  else await x.click()
  await page.waitForTimeout(250)
  const closed = await page.evaluate(() => !document.querySelector('.ms') && window.__sw.useGame.getState().menu === null)
  check(v.id, '按關閉鈕可以關掉選單', closed)
  check(v.id, '沒有主控台錯誤', errs.length === 0, errs.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
const pass = results.filter((r) => r.ok).length
say(`\n結果：${pass}/${results.length} 通過`)
writeFileSync(OUT + 'results.json', JSON.stringify({ results, log }, null, 2))
process.exit(pass === results.length ? 0 : 1)
