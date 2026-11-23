// 地圖系統自動測試（無頭 Edge）。先在專案根目錄開 dev server：npm run dev（port 5183）
//   node map-qa.mjs shots <標籤>        各區定點截圖 + 每點效能
//   node map-qa.mjs roundtrip <標籤> [次數] [mobile]  村莊 ↔ 各區實際走路往返，記錄記憶體、卡住、隊友距離
//   node map-qa.mjs chest <標籤>        開寶箱 → 跨區往返 → 存檔讀檔，確認寶箱狀態
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , mode = 'shots', label = 'now', arg3 = '3', arg4 = ''] = process.argv
const mobile = arg4 === 'mobile' || arg3 === 'mobile'
const OUT = fileURLToPath(new URL(`../../docs/map-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.QA_URL ?? 'http://localhost:5183/'

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
})
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } },
)
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text())
})
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
const log = []
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  log.push(s)
  console.log(s)
}
const ev = (f, a) => page.evaluate(f, a)

const t0 = Date.now()
await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
say('頁面載入', Date.now() - t0, 'ms')

/** 開新遊戲；可選擇直接招募全部隊友（測試隊友跟隨） */
async function newGame(recruitAll = true) {
  await ev((recruit) => {
    localStorage.clear()
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId: 'archer' })
    sw.useGame.getState().startGame()
    if (recruit) for (const c of ['mage', 'knight', 'cleric']) sw.cstate.recruitAlly(c)
  }, recruitAll)
  await page.waitForTimeout(1500)
}

/** 傳送主角與隊友，並設定鏡頭 */
async function teleport(x, z, yaw = 0, dist = 14, tilt = 0) {
  await ev(
    ({ x, z, yaw, dist, tilt }) => {
      const sw = window.__sw
      const p = sw.runtime.player
      p.x = x
      p.z = z
      sw.runtime.path = null
      for (const u of sw.combat.units) {
        if (u.team !== 'party') continue
        u.x = x + (u.kind === 'hero' ? 0 : (Math.random() - 0.5) * 2)
        u.z = z + (u.kind === 'hero' ? 0 : 1.5)
        if (u.ai) u.ai.path = null
      }
      const c = sw.cam
      if (c) Object.assign(c, { yaw, yawT: yaw, dist, distT: dist, tilt, tiltT: tilt, tx: x, tz: z })
    },
    { x, z, yaw, dist, tilt },
  )
}

async function stats() {
  return ev(() => {
    const sw = window.__sw
    const gl = sw.gl
    let objects = 0
    sw.scene?.traverse(() => objects++)
    const mem = performance.memory
    return {
      calls: gl?.info.render.calls,
      tris: gl?.info.render.triangles,
      geometries: gl?.info.memory.geometries,
      textures: gl?.info.memory.textures,
      objects,
      heapMB: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
      chunks: sw.stream ? sw.stream.stats() : null,
      ai: sw.sim.aiStats ? { ...sw.sim.aiStats } : null,
      nav: sw.nav.navStats ? { ...sw.nav.navStats } : null,
      units: sw.combat.units.length,
    }
  })
}
const fps = () =>
  ev(
    () =>
      new Promise((r) => {
        let n = 0
        const t0 = performance.now()
        const f = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(f)
          else r(Math.round(n / ((performance.now() - t0) / 1000)))
        }
        requestAnimationFrame(f)
      }),
  )

const VIEWS = [
  ['01_spawn_north', 0, 6, 0, 14, 0],
  ['02_village_pass', 4, -21, 0, 16, -0.25],
  ['03_bridge', 5, -34, 0, 13, 0],
  ['04_valley_north', 0, -50, 0, 16, -0.2],
  ['05_valley_back', 0, -60, Math.PI, 16, -0.2],
  ['06_forest_west', -26, 2, Math.PI / 2, 13, 0],
  ['07_ruins_north', 27, -10, 0, 14, 0],
  ['08_south_edge', 0, 33, Math.PI, 13, 0],
  ['09_east_edge', 33, 1, -Math.PI / 2, 13, 0],
  ['10_overview', 2, -12, 0.35, 30, 0],
  // 低角度看地平線：遠景山脈與遠方地標
  ['11_horizon_north', 6, -24, 0, 8, -0.45],
  ['15_valley_horizon', 0, -56, 0, 8, -0.4],
  ['16_tower_closeup', 5.5, -20, 0, 3.4, 0],
  ['12_horizon_east', 22, 2, -Math.PI / 2, 8, -0.45],
  ['13_horizon_west', -10, -2, Math.PI / 2, 8, -0.45],
  ['14_horizon_south', 0, 20, Math.PI, 8, -0.45],
]

if (mode === 'shots') {
  await newGame(false)
  const only = process.env.QA_ONLY
  for (const [name, x, z, yaw, dist, tilt] of VIEWS) {
    if (only && !name.startsWith(only)) continue
    await teleport(x, z, yaw, dist, tilt)
    await page.waitForTimeout(1600)
    await page.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 82 })
    say(name, { fps: await fps(), ...(await stats()) })
  }
}

/** 實際走路（點地面尋路）到目的地；回傳是否抵達與耗時 */
async function walkTo(x, z, timeout = 40000) {
  const t = Date.now()
  let last = null
  let still = 0
  for (;;) {
    const s = await ev(
      ({ x, z }) => {
        const sw = window.__sw
        const p = sw.runtime.player
        const d = Math.hypot(p.x - x, p.z - z)
        if (d > 1.2 && !sw.runtime.path) sw.runtime.path = sw.nav.findPath(p, { x, z })
        return { d, x: p.x, z: p.z, hasPath: !!sw.runtime.path }
      },
      { x, z },
    )
    if (s.d < 1.5) return { ok: true, ms: Date.now() - t }
    if (last && Math.hypot(s.x - last.x, s.z - last.z) < 0.05) still++
    else still = 0
    last = s
    if (still > 12 || Date.now() - t > timeout) return { ok: false, ms: Date.now() - t, at: [s.x.toFixed(1), s.z.toFixed(1)], hasPath: s.hasPath }
    await page.waitForTimeout(250)
  }
}
const allyGap = () =>
  ev(() => {
    const us = window.__sw.combat.units
    const h = us[0]
    const gap = Math.max(0, ...us.filter((u) => u.kind === 'ally').map((u) => Math.round(Math.hypot(u.x - h.x, u.z - h.z) * 10) / 10))
    const fighting = us.filter((u) => u.kind === 'ally' && u.targetId).length
    return fighting ? `${gap}（${fighting} 位隊友正在戰鬥）` : gap
  })

if (mode === 'roundtrip') {
  const loops = Number(arg3) || 3
  await newGame(true)
  // 不讓怪物打斷測試：主角無敵（只影響這個測試頁面）
  await ev(() => {
    const h = window.__sw.combat.units[0]
    setInterval(() => {
      h.hp = h.maxHp
      h.invuln = 1
    }, 200)
  })
  const ROUTES = [
    ['村莊→山谷月泉', 0, -57],
    ['山谷→村莊', 0, 4],
    ['村莊→迷霧森林', -27, 4],
    ['森林→石環', 24, -14],
    ['石環→草原南', 0, 30],
    ['草原→村莊', 0, 4],
  ]
  say('開始', await stats())
  for (let i = 0; i < loops; i++) {
    for (const [name, x, z] of ROUTES) {
      const r = await walkTo(x, z)
      say(`第${i + 1}輪 ${name}`, r, '隊友最遠', await allyGap(), 'm')
    }
    await page.waitForTimeout(1500)
    say(`第${i + 1}輪結束`, { fps: await fps(), ...(await stats()) })
  }
}

if (mode === 'logic') {
  await newGame(false)
  // 1) 吊橋未放下：石環 → 星晶林只能繞主橋；放下後路徑變短
  const r = await ev(() => {
    const sw = window.__sw
    const len = (p, from) => {
      if (!p) return null
      let d = 0
      let a = from
      for (const q of p) {
        d += Math.hypot(q.x - a.x, q.z - a.z)
        a = q
      }
      return Math.round(d)
    }
    const from = { x: 27.5, z: -27 }
    const to = { x: 19, z: -55 }
    const t0 = performance.now()
    const locked = len(sw.nav.findPath(from, to), from)
    const tLocked = Math.round(performance.now() - t0)
    sw.progress.unlocks.length = 0
    const before = sw.story.interactables().some((i) => i.id === 'lever')
    sw.story.interactWith('lever')
    const t1 = performance.now()
    const open = len(sw.nav.findPath(from, to), from)
    const tOpen = Math.round(performance.now() - t1)
    return { locked, tLocked, open, tOpen, leverBefore: before, leverAfter: sw.story.interactables().some((i) => i.id === 'lever'), unlocks: [...sw.progress.unlocks] }
  })
  say('吊橋捷徑', r)
  // 2) 舊版（v1）存檔：位置剛好在河裡 → 讀檔後移到可走處、捷徑未解鎖、寶箱保留
  const m = await ev(() => {
    const sw = window.__sw
    sw.useGame.getState().saveGame()
    const raw = JSON.parse(localStorage.getItem('starwish.save.v1'))
    raw.version = 1
    delete raw.unlocks
    delete raw.region
    raw.pos = { x: 2.6, z: -38.4 + 6 } // 先放在河南岸，再改成河中央
    raw.pos = { x: -10, z: -36.9 }
    raw.story.chests = ['c_meadow']
    localStorage.setItem('starwish.save.v1', JSON.stringify(raw))
    sw.useGame.getState().continueGame()
    const p = sw.runtime.player
    const save2 = (sw.useGame.getState().saveGame(), JSON.parse(localStorage.getItem('starwish.save.v1')))
    return {
      pos: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10],
      unlocks: [...sw.progress.unlocks],
      chests: [...sw.progress.story.chests],
      chestShown: sw.story.interactables().some((i) => i.id === 'c_meadow'),
      newVersion: save2.version,
      region: save2.region,
    }
  })
  say('舊存檔轉換', m)
  // 3) 區域邊界追擊：主角站在草原（z > -4），石環哥布林營地在交界另一側，怪物要追過來打到主角
  await newGame(false)
  await teleport(33.5, -1.2)
  const chase = await ev(async () => {
    const sw = window.__sw
    const h = sw.combat.units[0]
    const gob = sw.combat.units.filter((u) => u.id.startsWith('r1-'))
    const hp0 = h.hp
    const startRegions = gob.map((g) => (g.z < -4 ? 'ruins' : 'meadow'))
    await new Promise((r) => setTimeout(r, 4000))
    const near = gob.filter((g) => Math.hypot(g.x - h.x, g.z - h.z) < 2.5).length
    return { heroRegion: 'meadow', goblinStart: startRegions, chasingNearHero: near, heroDamaged: h.hp < hp0, aiFull: sw.sim.aiStats.full }
  })
  say('跨區追擊', chase)
}

if (mode === 'chest') {
  await newGame(false)
  await ev(() => {
    const h = window.__sw.combat.units[0]
    setInterval(() => {
      h.hp = h.maxHp
      h.invuln = 1
    }, 200)
  })
  const snap = () =>
    ev(() => {
      const sw = window.__sw
      return {
        opened: [...sw.progress.story.chests],
        shown: sw.story.interactables().some((i) => i.id === 'c_meadow'),
        chunkLoaded: sw.stream.isLoaded(-3, 33),
        bag: sw.progress.inventory.length,
        gold: sw.progress.gold,
      }
    })
  // 1) 走到草原南邊的寶箱打開
  say('走到寶箱', await walkTo(-3, 31))
  await ev(() => window.__sw.story.interactWith('c_meadow'))
  const a = await snap()
  say('開啟後', a)
  // 2) 走到山谷（寶箱所在區塊會被卸載），再走回來
  say('走到山谷', await walkTo(0, -57))
  say('在山谷時', await snap())
  say('走回寶箱', await walkTo(-3, 31))
  await ev(() => window.__sw.story.interactWith('c_meadow')) // 再開一次：不能重複領
  const b = await snap()
  say('回來再開一次', b)
  // 3) 存檔、回標題、讀檔
  const c = await ev(async () => {
    const sw = window.__sw
    sw.useGame.getState().saveGame()
    sw.useGame.getState().backToTitle()
    await new Promise((r) => setTimeout(r, 300))
    const t0 = performance.now()
    sw.useGame.getState().continueGame()
    // 等主角周圍的區塊載入完
    while (sw.stream.isPriming() && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 30))
    return {
      readyMs: Math.round(performance.now() - t0),
      primeMs: sw.stream.stats().primeMs,
      region: JSON.parse(localStorage.getItem('starwish.save.v1')).region,
      pos: [Math.round(sw.runtime.player.x), Math.round(sw.runtime.player.z)],
    }
  })
  say('讀檔', c)
  const d = await snap()
  say('讀檔後', d)
  const pass = a.opened.includes('c_meadow') && !a.shown && !b.shown && b.bag === a.bag && b.gold === a.gold && d.opened.includes('c_meadow') && !d.shown && d.bag === a.bag
  say('寶箱狀態維持正確', pass ? '通過' : '失敗')
  // 4) 在山谷深處存檔 → 回標題（村子一帶）→ 讀檔：要先載入山谷的區塊才放出人物
  await teleport(0, -60)
  await page.waitForTimeout(2500)
  const e = await ev(async () => {
    const sw = window.__sw
    sw.useGame.getState().saveGame()
    sw.useGame.getState().backToTitle()
    await new Promise((r) => setTimeout(r, 2500))
    const loadedBefore = sw.stream.isLoaded(0, -60)
    const t0 = performance.now()
    sw.useGame.getState().continueGame()
    const hiddenWhileLoading = sw.stream.isPriming()
    while (sw.stream.isPriming() && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 16))
    return { loadedBefore, hiddenWhileLoading, readyMs: Math.round(performance.now() - t0), primeMs: sw.stream.stats().primeMs, region: JSON.parse(localStorage.getItem('starwish.save.v1')).region }
  })
  say('山谷存檔後讀檔', e)
}

say('錯誤', errs.length ? errs.slice(0, 10) : '無')
writeFileSync(OUT + `${mode}.log.txt`, log.join('\n'), 'utf8')
await browser.close()
