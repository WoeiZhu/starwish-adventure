// 小地圖與大地圖測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node minimap-qa.mjs [標籤]
// 檢查：小地圖出現與尺寸、方向（跟著鏡頭轉）、任務距離與目標標記、怪物紅點、點擊／M 鍵開大地圖、
//       大地圖的主角位置與版面、選單開關並記住、城鎮裡沒有小地圖、手機橫拿不重疊、繪圖耗時、主控台無錯誤
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'minimap'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/minimap-qa/${label}/`, import.meta.url))
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
const ready = (p = page) => p.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })
const shot = (n, p = page) => p.screenshot({ path: OUT + n + '.png' })

async function newGame(p = page, cls = 'knight', killEnemies = false) {
  await p.evaluate(
    ([cls, kill]) => {
      localStorage.removeItem('starwish.save.v1')
      localStorage.removeItem('starwish.minimap')
      const sw = window.__sw
      sw.useGame.getState().setCamMode('explore') // 沉浸模式會自動把鏡頭轉到主角背後，測方向要用探索模式
      sw.useGame.getState().setProfile({ classId: cls, name: '測試' })
      sw.useGame.getState().startGame()
      for (const c of ['archer', 'mage', 'cleric']) if (c !== cls) sw.cstate.recruitAlly(c)
      if (kill) for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
      sw.useGame.setState({ dialog: null })
    },
    [cls, killEnemies],
  )
  await ready(p)
}
/** 把主角放到某處（直接改 runtime，並讓隊友一起） */
const place = (x, z, yaw = 0) =>
  ev(
    ([x, z, yaw]) => {
      const sw = window.__sw
      sw.runtime.player.x = x
      sw.runtime.player.z = z
      sw.runtime.cam.yaw = yaw
      for (const u of sw.combat.units) if (u.team === 'party') (u.x = x), (u.z = z + 1)
    },
    [x, z, yaw],
  )
/** 取小地圖畫布的像素統計：各象限的藍色（河）、金色（任務）、紅色（怪物）像素數 */
const pixels = () =>
  ev(() => {
    const cv = document.querySelector('.minimap canvas')
    if (!cv) return null
    const g = cv.getContext('2d')
    const w = cv.width
    const h = cv.height
    const d = g.getImageData(0, 0, w, h).data
    const out = { w, h, blueTop: 0, blueBottom: 0, blueLeft: 0, blueRight: 0, gold: 0, red: 0, opaque: 0 }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const r = d[i]
        const gg = d[i + 1]
        const b = d[i + 2]
        if (d[i + 3] > 200) out.opaque++
        if (b > 200 && gg > 170 && r < 180 && b - r > 60) {
          if (y < h / 2 - h * 0.08) out.blueTop++
          if (y > h / 2 + h * 0.08) out.blueBottom++
          if (x < w / 2 - w * 0.08) out.blueLeft++
          if (x > w / 2 + w * 0.08) out.blueRight++
        }
        if (r > 235 && gg > 190 && gg < 235 && b < 110) out.gold++
        if (r > 235 && gg > 70 && gg < 120 && b > 80 && b < 140) out.red++
      }
    return out
  })

// ───────────── 一、小地圖出現 ─────────────
await newGame(page, 'knight', true)
await wait(600)
const box = await ev(() => {
  const el = document.querySelector('.minimap')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const cv = el.querySelector('canvas')
  return { x: r.x, y: r.y, w: r.width, h: r.height, radius: cs.borderRadius, cw: cv.width, ch: cv.height, vw: innerWidth }
})
check('野外：右上角出現圓形小地圖（128 px，畫布依解析度放大）', !!box && Math.abs(box.w - 128) < 3 && Math.abs(box.h - 128) < 3 && box.radius.includes('50%') && box.cw >= 120, JSON.stringify(box))
const menuBtn = await ev(() => {
  const r = document.querySelector('.menu-btn[aria-label="選單"]').getBoundingClientRect()
  return { bottom: r.bottom, right: r.right }
})
check('小地圖在選單按鈕下方、靠右對齊', box.y >= menuBtn.bottom - 1 && Math.abs(box.x + box.w - menuBtn.right) < 6, `按鈕底 ${menuBtn.bottom}，小地圖頂 ${box.y}`)
const p0 = await pixels()
check('小地圖有畫出內容（不是空白）', p0 && p0.opaque > p0.w * p0.h * 0.6, JSON.stringify(p0))

// ───────────── 二、方向：跟著鏡頭轉 ─────────────
// 站在河的南岸（河在北邊約 6 公尺）。鏡頭 yaw 由 CameraRig 每幀覆寫，所以方向分兩部分驗證：
//   (a) 直接呼叫 drawMini（離屏畫布）指定 yaw：北方應該出現在畫面的 (sin yaw, -cos yaw) 方向
//   (b) 真實的小地圖：用當下實際的鏡頭 yaw 推算河應該在哪一側
await place(-15, -32, 0)
await wait(300)
const offscreen = (yaw) =>
  ev((yaw) => {
    const sw = window.__sw
    const keep = sw.runtime.cam.yaw
    sw.runtime.cam.yaw = yaw
    const cv = document.createElement('canvas')
    cv.width = cv.height = 244
    const g = cv.getContext('2d')
    sw.mapDraw.drawMini(g, 244, 0)
    sw.runtime.cam.yaw = keep
    const d = g.getImageData(0, 0, 244, 244).data
    const o = { top: 0, bottom: 0, left: 0, right: 0 }
    for (let y = 0; y < 244; y++)
      for (let x = 0; x < 244; x++) {
        const i = (y * 244 + x) * 4
        if (d[i + 2] > 200 && d[i + 1] > 170 && d[i] < 180 && d[i + 2] - d[i] > 60) {
          if (y < 244 / 2 - 20) o.top++
          if (y > 244 / 2 + 20) o.bottom++
          if (x < 244 / 2 - 20) o.left++
          if (x > 244 / 2 + 20) o.right++
        }
      }
    return o
  }, yaw)
const dom = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]
const y0 = await offscreen(0)
const yS = await offscreen(Math.PI)
const yW = await offscreen(Math.PI / 2)
const yE = await offscreen(-Math.PI / 2)
check('鏡頭朝北（yaw 0）：河在小地圖上方', dom(y0)[0] === 'top', JSON.stringify(y0))
check('鏡頭朝南（yaw π）：河在下方', dom(yS)[0] === 'bottom', JSON.stringify(yS))
check('鏡頭朝西（yaw +90°）：河在右邊', dom(yW)[0] === 'right', JSON.stringify(yW))
check('鏡頭朝東（yaw -90°）：河在左邊', dom(yE)[0] === 'left', JSON.stringify(yE))
await shot('1_river_live')
const live = await pixels()
const yawNow = await ev(() => window.__sw.runtime.cam.yaw)
const expect = Math.abs(Math.cos(yawNow)) > Math.abs(Math.sin(yawNow)) ? (Math.cos(yawNow) > 0 ? 'top' : 'bottom') : Math.sin(yawNow) > 0 ? 'right' : 'left'
const liveSides = { top: live.blueTop, bottom: live.blueBottom, left: live.blueLeft, right: live.blueRight }
check('真實小地圖：河的位置符合目前鏡頭 yaw', dom(liveSides)[0] === expect, `yaw ${yawNow.toFixed(2)} 預期 ${expect} ${JSON.stringify(liveSides)}`)

// 主角箭頭朝向：facing 是世界方向（0 = 南、π/2 = 東），畫面上要再加上鏡頭 yaw（畫面角度從正上方順時針）
const ang = (f, yaw) => ev(([f, yaw]) => { const a = window.__sw.mapDraw.heroArrowAngle(f, yaw); return +(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(3) }, [f, yaw])
const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.01
const aN = await ang(Math.PI, 0) // 面向北、鏡頭朝北 → 朝上（0）
const aE = await ang(Math.PI / 2, 0) // 面向東、鏡頭朝北 → 朝右（π/2）
const aE2 = await ang(Math.PI / 2, Math.PI / 2) // 面向東、鏡頭朝西（北在右邊，東在下方）→ 朝下（π）
const aS = await ang(0, Math.PI) // 面向南、鏡頭朝南 → 朝上（0）
check('主角箭頭角度：面向北、鏡頭朝北 → 朝上', near(aN, 0), String(aN))
check('主角箭頭角度：面向東、鏡頭朝北 → 朝右', near(aE, Math.PI / 2), String(aE))
check('主角箭頭角度：面向東、鏡頭朝西 → 朝下（跟著地圖轉）', near(aE2, Math.PI), String(aE2))
check('主角箭頭角度：面向南、鏡頭朝南 → 朝上（面向鏡頭前方）', near(aS, 0), String(aS))

// ───────────── 三、任務目標與距離 ─────────────
await place(0, 6, 0)
await ev(() => (window.__sw.progress.story.step = 'talk'))
await wait(400)
const q1 = await ev(() => {
  const t = window.__sw.story.questTarget()
  const p = window.__sw.runtime.player
  return { d: Math.round(Math.hypot(t.x - p.x, t.z - p.z)), arrow: document.querySelector('.qa-dist')?.textContent ?? '', pill: !!document.querySelector('.mm-dist') }
})
check('任務距離只在任務箭頭顯示（小地圖不重複）', q1.arrow === q1.d + ' m' && !q1.pill, JSON.stringify(q1))
const p1 = await pixels()
check('目標在範圍內：小地圖有金色任務星星', p1.gold > 12, `金色像素 ${p1.gold}`)
// 目標遠在範圍外：貼在邊緣的指針
await ev(() => (window.__sw.progress.story.step = 'c2_scout'))
await wait(400)
const p2 = await pixels()
check('目標太遠：邊緣出現金色指針', p2.gold > 10, `金色像素 ${p2.gold}`)
await shot('4_quest_edge_pointer')

// ───────────── 四、怪物紅點 ─────────────
await newGame(page, 'knight', false)
await place(-9, 14, 0) // 草原營地 m1（-9, 21）南側 7 公尺
await wait(500)
const p3 = await pixels()
check('附近有怪物：小地圖出現紅點', p3.red > 10, `紅色像素 ${p3.red}`)
await shot('5_enemies_red')

// ───────────── 五、點擊開大地圖 ─────────────
await newGame(page, 'knight', true)
await place(-15, -32, 0)
await ev(() => (window.__sw.progress.story.step = 'c2_scout'))
await wait(300)
await page.click('.minimap')
await wait(400)
const m1 = await ev(() => ({ menu: window.__sw.useGame.getState().menu, paused: window.__sw.useGame.getState().paused, tab: document.querySelector('.ms-tab.on')?.textContent ?? '' }))
check('點小地圖：開啟大地圖分頁並暫停', m1.menu === 'map' && m1.paused && m1.tab.includes('地圖'), JSON.stringify(m1))
const layout = await ev(() => {
  const w = document.querySelector('.map-wrap').getBoundingClientRect()
  const c = document.querySelector('.map-wrap canvas').getBoundingClientRect()
  const side = document.querySelector('.map-side').getBoundingClientRect()
  return { wrap: [w.width, w.height], canvas: [c.width, c.height], ratio: c.width / c.height, side: [side.x, side.width], vw: innerWidth, vh: innerHeight, inside: c.left >= w.left - 1 && c.right <= w.right + 1 && c.top >= w.top - 1 && c.bottom <= w.bottom + 1 }
})
check('大地圖：畫布保持地圖比例（84:120）並放在容器內', Math.abs(layout.ratio - 84 / 120) < 0.02 && layout.inside, JSON.stringify(layout))
// 主角位置：畫布上對應 (-15, -32) 的地方要有白色箭頭
const hero = await ev(() => {
  const cv = document.querySelector('.map-wrap canvas')
  const g = cv.getContext('2d')
  const px = Math.round(((-15 - -42) / 84) * cv.width)
  const py = Math.round(((-32 - -77) / 120) * cv.height)
  const R = Math.round(cv.width * 0.04)
  const d = g.getImageData(px - R, py - R, R * 2, R * 2).data
  let white = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++
  return { px, py, white, cw: cv.width, ch: cv.height }
})
check('大地圖：主角位置有白色箭頭', hero.white > 8, JSON.stringify(hero))
const side = await ev(() => ({ here: document.querySelector('.map-here b')?.textContent, quest: document.querySelector('.map-quest b')?.textContent, legend: document.querySelectorAll('.map-legend li').length }))
check('大地圖側欄：目前位置、任務、圖例', side.here === '北境林道' && side.quest?.includes('月光山谷') && side.legend >= 5, JSON.stringify(side))
await shot('6_big_map')
await page.keyboard.press('Escape')
await wait(250)
check('Esc 關閉大地圖並繼續遊戲', await ev(() => !window.__sw.useGame.getState().menu && !window.__sw.useGame.getState().paused))
await page.keyboard.press('KeyM')
await wait(250)
check('M 鍵開啟大地圖', (await ev(() => window.__sw.useGame.getState().menu)) === 'map')
await page.keyboard.press('KeyM')
await wait(250)
check('再按 M 關閉', (await ev(() => window.__sw.useGame.getState().menu)) === null)

// ───────────── 六、選單：地圖、小地圖開關（會記住） ─────────────
await page.click('.menu-btn[aria-label="選單"]')
await wait(150)
const items = await ev(() => [...document.querySelectorAll('.menu-pop button')].map((b) => b.textContent.replace(/\s+/g, '')))
check('選單有「地圖 M」與「小地圖」項目', items.some((t) => t.startsWith('地圖')) && items.some((t) => t.startsWith('小地圖開')), items.join('｜'))
await page.click('.menu-pop button:has-text("小地圖")')
await wait(250)
await page.click('.menu-btn[aria-label="選單"]') // 收起選單
await wait(200)
const off = await ev(() => ({ gone: !document.querySelector('.minimap'), saved: localStorage.getItem('starwish.minimap') }))
check('關閉小地圖：畫面上消失並記住', off.gone && off.saved === 'off', JSON.stringify(off))
await ev(() => window.__sw.useGame.getState().setMinimap(true))
await wait(200)
check('重新開啟小地圖', await ev(() => !!document.querySelector('.minimap') && localStorage.getItem('starwish.minimap') === 'on'))

// ───────────── 七、城鎮裡沒有小地圖 ─────────────
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
await page.waitForFunction(() => window.__sw.useGame.getState().mapId !== 'overworld', null, { timeout: 30000 })
await ready()
await wait(500)
check('城鎮裡不顯示小地圖', await ev(() => !document.querySelector('.minimap')))
await page.keyboard.press('KeyM')
await wait(250)
const tm = await ev(() => ({ menu: window.__sw.useGame.getState().menu, toast: document.querySelector('.toast')?.textContent ?? '' }))
check('城鎮裡按 M：不開地圖，顯示提示', tm.menu === null && tm.toast.includes('不需要地圖'), JSON.stringify(tm))

// ───────────── 八、手機橫拿（844×390） ─────────────
{
  const c2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const p2 = await c2.newPage()
  await p2.goto(URL_, { waitUntil: 'load' })
  await p2.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
  await newGame(p2, 'mage', true)
  await p2.evaluate(() => {
    const sw = window.__sw
    sw.runtime.player.x = -15
    sw.runtime.player.z = -32
    sw.progress.story.step = 'c2_scout'
  })
  await p2.waitForTimeout(700)
  const r = await p2.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect()
    const mm = q('.minimap')
    const chip = q('.quest-chip')
    const arrow = document.querySelector('.quest-arrow')
    const ar = arrow && !arrow.hidden ? arrow.getBoundingClientRect() : null
    const sk = q('.skillbar')
    const o = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    return {
      mm: mm && [Math.round(mm.x), Math.round(mm.y), Math.round(mm.width), Math.round(mm.bottom)],
      chipTop: chip && Math.round(chip.top),
      arrowBottom: ar && Math.round(ar.bottom),
      vh: innerHeight,
      vw: innerWidth,
      overlapChip: o(mm, chip),
      overlapArrow: o(mm, ar),
      overlapSkill: o(mm, sk),
      mmRight: mm && Math.round(mm.right),
    }
  })
  check('手機橫拿：小地圖縮小為 96 px，在畫面內且不與任務、技能列重疊', r.mm && r.mm[2] === 96 && r.mmRight <= r.vw && r.mm[3] <= r.vh && !r.overlapChip && !r.overlapArrow && !r.overlapSkill, JSON.stringify(r))
  await p2.screenshot({ path: OUT + '7_phone_hud.png' })
  await p2.tap('.minimap')
  await p2.waitForTimeout(500)
  const big = await p2.evaluate(() => {
    const c = document.querySelector('.map-wrap canvas')?.getBoundingClientRect()
    const w = document.querySelector('.map-wrap')?.getBoundingClientRect()
    const s = document.querySelector('.map-side')?.getBoundingClientRect()
    return { canvas: c && [Math.round(c.width), Math.round(c.height)], inView: !!c && c.bottom <= innerHeight && c.right <= innerWidth && s.right <= innerWidth, h: Math.round(w?.height ?? 0) }
  })
  check('手機橫拿：點小地圖開大地圖，地圖與側欄都在畫面內', big.inView && big.canvas && big.canvas[1] > 200, JSON.stringify(big))
  await p2.screenshot({ path: OUT + '8_phone_big_map.png' })
  await c2.close()
}

// ───────────── 九、效能與主控台 ─────────────
await newGame(page, 'knight', false)
await place(0, 6, 0)
await wait(400)
const perf = await ev(() => {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 256
  const g = cv.getContext('2d')
  const m = window.__sw.mapDraw
  m.drawMini(g, 256, 0) // 暖機（底圖只畫一次）
  const t0 = performance.now()
  for (let i = 0; i < 100; i++) m.drawMini(g, 256, i / 30)
  const mini = (performance.now() - t0) / 100
  const big = document.createElement('canvas')
  big.width = 504
  big.height = 720
  const g2 = big.getContext('2d')
  const t1 = performance.now()
  for (let i = 0; i < 20; i++) m.drawFull(g2, 504, 720, i / 10)
  return { mini: +mini.toFixed(2), full: +((performance.now() - t1) / 20).toFixed(2) }
})
check('小地圖每次繪製 < 3 ms（256 px）', perf.mini < 3, JSON.stringify(perf))
check('大地圖每次繪製 < 8 ms', perf.full < 8, JSON.stringify(perf))
check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 3).join(' | '))

const pass = results.filter((r) => r.ok).length
writeFileSync(OUT + 'results.json', JSON.stringify({ pass, total: results.length, results }, null, 1))
console.log(`\n結果：${pass}/${results.length} 通過`)
await browser.close()
process.exit(pass === results.length ? 0 : 1)
