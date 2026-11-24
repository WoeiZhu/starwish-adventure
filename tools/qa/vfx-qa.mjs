// 技能特效系統的自動測試（本機 Edge 無頭模式，先開 dev server：npm run dev，port 5183）
//   node vfx-qa.mjs [標籤]
// 測項：
//   測試頁：四個技能的命中時間（時間軸同步）、冷卻、射程、參數即時生效、壓力測試的物件池上限、
//          省電模式預算、反覆壓力測試的資源釋放、手機尺寸、截圖
//   遊戲：戰士斬擊延遲命中、弓箭拖尾、火球魔法陣後才發射＋爆炸波及、聖者治療延遲回復、換地圖清除特效
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'vfx'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/map-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const BASE = process.env.QA_URL ?? 'http://localhost:5183/'

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const log = []
const results = []
const errs = []
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  log.push(s)
  console.log(s)
}
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  say(ok ? '✔' : '✘', name, detail)
}

async function openPage(url, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...opts })
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
  await page.goto(url, { waitUntil: 'load' })
  return page
}

// ═════════ 一、技能測試頁 ═════════
let page = await openPage(BASE + 'skill-lab.html')
const ev = (f, a) => page.evaluate(f, a)
const wait = (ms) => page.waitForTimeout(ms)
const shot = (name) => page.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 85 })
await page.waitForFunction(() => window.__lab?.lab.world, null, { timeout: 30000 })
await wait(1500)

/** 施放後量命中時間：在頁面裡每幀檢查 lab.hits 有沒有增加 */
const castAndTime = () =>
  ev(
    () =>
      new Promise((resolve) => {
        const L = window.__lab
        const before = L.lab.hits
        const r = L.cast()
        if (r) return resolve({ fail: r })
        const t0 = performance.now()
        const peak = { slashes: 0, trails: 0, circles: 0, orbs: 0, rings: 0, pillars: 0, models: 0, particles: 0 }
        const tick = () => {
          const s = L.lab.world.stats()
          for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], k === 'particles' ? s.soft + s.add : s[k])
          if (L.lab.hits > before) return resolve({ ms: Math.round(performance.now() - t0), peak })
          if (performance.now() - t0 > 4000) return resolve({ ms: -1, peak })
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )

const expect = {
  // 命中時間：時間軸的 hit / launch ＋ 飛行時間（木樁在 7 m）
  knight: { min: 130, max: 330, need: ['slashes'] },
  archer: { min: 300, max: 700, need: ['trails'] },
  mage: { min: 700, max: 1300, need: ['circles', 'orbs', 'trails'] },
  cleric: { min: 380, max: 700, need: ['circles', 'pillars'] },
}
const shotAt = { knight: 150, archer: 300, mage: 380, cleric: 520 }
for (const c of ['knight', 'archer', 'mage', 'cleric']) {
  await ev((c) => window.__lab.setClassId(c), c)
  await wait(1600)
  const r = await castAndTime()
  const e = expect[c]
  check(`測試頁 ${c}：命中照時間軸延遲發生`, r.ms >= e.min && r.ms <= e.max, `${r.ms} ms（預期 ${e.min}～${e.max}）`)
  check(`測試頁 ${c}：用到的特效物件都有出現`, e.need.every((k) => r.peak[k] > 0), JSON.stringify(r.peak))
  // 截圖：冷卻過後再放一次，在特效最明顯的時間拍
  await ev(() => (window.__lab.lab.ignoreCooldown = true))
  await wait(900)
  await ev(() => window.__lab.cast())
  await wait(shotAt[c])
  await shot(`lab_${c}`)
  if (c === 'mage') {
    await wait(520)
    await shot('lab_mage_explosion')
  }
  await ev(() => (window.__lab.lab.ignoreCooldown = false))
  await wait(1200)
}

// 冷卻
await ev(() => window.__lab.setClassId('mage'))
await wait(600)
const cd = await ev(() => [window.__lab.cast(), window.__lab.cast()])
check('冷卻中不能再放', cd[0] === null && cd[1] === '冷卻中', JSON.stringify(cd))

// 射程：遠距木樁移到 13 m，弓箭射程 9 m
await ev(() => window.__lab.setClassId('archer'))
await wait(600)
const range = await ev(() => {
  const L = window.__lab
  const far = L.lab.dummies.find((d) => d.id === 'far')
  const z = far.z
  far.z = 13
  const r = L.cast()
  far.z = z
  return r
})
check('超出射程時不施放', range === '超出射程', String(range))

// 參數即時生效：顏色、大小、射程（刀光半徑）
await ev(() => window.__lab.setClassId('knight'))
await wait(800)
const param = await ev(() => {
  const L = window.__lab
  const p = L.lab.params.warrior_slash
  p.color = '#ff0000'
  p.range = 3.4
  p.size = 2
  L.lab.ignoreCooldown = true
  L.cast()
  return new Promise((res) =>
    setTimeout(() => {
      const it = L.lab.world.slashes.items.find((s) => s.alive && s.mesh.scale.y > 2.5)
      const c = it?.mat.uniforms.uColor.value
      res({ scale: it?.mesh.scale.y, color: c && [c.r, c.g, c.b].map((v) => +v.toFixed(2)) })
    }, 180),
  )
})
check('改參數後下一次施放就套用（主色；刀光半徑 = 射程 × 0.85）', Math.abs(param.scale - 3.4 * 0.85) < 0.01 && param.color?.join() === '1,0,0', JSON.stringify(param))
await shot('lab_knight_params')
await ev(() => {
  const L = window.__lab
  L.lab.params.warrior_slash = structuredClone(L.lab.params.warrior_slash)
  Object.assign(L.lab.params.warrior_slash, { color: '#b9dcff', range: 2.2, size: 1 })
  L.lab.ignoreCooldown = false
})

// ── 壓力測試：四個技能各 20 次同時施放 ──
const stressRun = (quality) =>
  ev(
    (quality) =>
      new Promise((resolve) => {
        const L = window.__lab
        L.setQuality(quality)
        const out = {}
        const order = ['knight', 'archer', 'mage', 'cleric']
        let i = 0
        const next = () => {
          if (i >= order.length) return resolve(out)
          const c = order[i++]
          L.setClassId(c)
          setTimeout(() => {
            L.clearLab()
            const peak = { soft: 0, add: 0, slashes: 0, trails: 0, circles: 0, rings: 0, pillars: 0, orbs: 0 }
            let frames = 0
            let worst = 0
            let last = performance.now()
            const t0 = last
            L.stress(20)
            const tick = () => {
              const now = performance.now()
              worst = Math.max(worst, now - last)
              last = now
              frames++
              const s = L.lab.world.stats()
              for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], s[k])
              if (now - t0 < 2000) return requestAnimationFrame(tick)
              const s2 = L.lab.world.stats()
              out[c] = { fps: Math.round((frames * 1000) / (now - t0)), worstFrameMs: Math.round(worst), peak, budget: { soft: s2.softBudget, add: s2.addBudget }, created: s2.created, dropped: s2.dropped, stolen: s2.stolen }
              next()
            }
            requestAnimationFrame(tick)
          }, 700)
        }
        next()
      }),
    quality,
  )

const high = await stressRun('high')
say('壓力測試（高畫質）', high)
const CAPS_HIGH = { slashes: 16, trails: 32, circles: 12, rings: 24, pillars: 8, orbs: 24 }
const CAPS_LOW = { slashes: 8, trails: 16, circles: 6, rings: 12, pillars: 4, orbs: 12 }
// 同時存在的數量不超過目前畫質的上限；建立過的總數不超過高畫質的上限
const within = (r, caps) =>
  Object.values(r).every(
    (x) => x.peak.soft <= x.budget.soft && x.peak.add <= x.budget.add && Object.entries(caps).every(([k, v]) => x.peak[k] <= v && x.created[k] <= CAPS_HIGH[k]),
  )
check('高畫質壓力測試：粒子與每種物件都沒超過上限', within(high, CAPS_HIGH), JSON.stringify(Object.fromEntries(Object.entries(high).map(([k, v]) => [k, v.peak]))))
check('高畫質壓力測試：平均 FPS ≥ 50', Object.values(high).every((x) => x.fps >= 50), Object.entries(high).map(([k, v]) => `${k} ${v.fps}fps 最慢一幀 ${v.worstFrameMs}ms`).join('；'))
await ev(() => {
  window.__lab.setClassId('mage')
  window.__lab.clearLab()
})
await wait(700)
await ev(() => window.__lab.stress(20))
await wait(1100)
await shot('lab_stress_mage')

const low = await stressRun('low')
say('壓力測試（省電）', low)
check('省電模式：粒子預算降到 600 / 360，物件上限減半', within(low, CAPS_LOW) && Object.values(low).every((x) => x.budget.soft === 600 && x.budget.add === 360), JSON.stringify(Object.fromEntries(Object.entries(low).map(([k, v]) => [k, v.peak]))))

// 反覆壓力測試：幾何體與貼圖不增加
const mem = []
for (let k = 0; k < 4; k++) {
  await stressRun('high')
  mem.push(await ev(() => ({ geo: window.__lab.labStats.geometries, tex: window.__lab.labStats.textures, programs: window.__lab.labStats.programs })))
}
say('反覆壓力測試的資源', mem)
check('反覆壓力測試 4 輪：幾何體、貼圖、著色器數量不增加', mem[3].geo <= mem[0].geo && mem[3].tex <= mem[0].tex && mem[3].programs <= mem[0].programs, JSON.stringify([mem[0], mem[3]]))

// 夜晚背景截圖
await ev(() => {
  window.__lab.setTheme('night')
  window.__lab.setClassId('mage')
})
await wait(900)
await ev(() => {
  window.__lab.lab.ignoreCooldown = true
  window.__lab.cast()
})
await wait(900)
await shot('lab_night_mage')
await page.close()

// 手機尺寸（橫放 844×390、觸控）：點施放鈕
page = await openPage(BASE + 'skill-lab.html?class=cleric', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await page.waitForFunction(() => window.__lab?.lab.world, null, { timeout: 30000 })
await page.waitForTimeout(1800)
const mob = await page.evaluate(() => ({ quality: window.__lab.lab.world.quality, casts: window.__lab.lab.casts }))
await page.tap('.lab-cast')
await page.waitForTimeout(550)
await page.screenshot({ path: OUT + 'lab_mobile.jpg', type: 'jpeg', quality: 85 })
const mob2 = await page.evaluate(() => window.__lab.lab.casts)
check('手機：預設省電模式，點按鈕可以施放', mob.quality === 'low' && mob2 === mob.casts + 1, JSON.stringify({ ...mob, after: mob2 }))
await page.close()

// ═════════ 二、遊戲裡的整合 ═════════
page = await openPage(BASE)
const gev = (f, a) => page.evaluate(f, a)
const gwait = (ms) => page.waitForTimeout(ms)
const gshot = (name) => page.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 85 })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })

async function newGame(classId) {
  await gev((classId) => {
    localStorage.clear()
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId })
    sw.useGame.getState().startGame()
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  }, classId)
  await ready()
  // 走到草原（村子是安全區不能攻擊）
  await gev(() => {
    const sw = window.__sw
    sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: 6, z: 27 })
  })
  await page.waitForFunction(() => !window.__sw.runtime.path, null, { timeout: 40000 })
  await gev(() => {
    const sw = window.__sw
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    sw.runtime.player.facing = 0
    Object.assign(sw.cam, { yaw: 1.25, yawT: 1.25, dist: 8, distT: 8, tilt: -0.05, tiltT: -0.05 })
  })
  await gwait(600)
}

/** 前方 d 公尺放一隻不會反擊、血很多的史萊姆，並讓主角鎖定它 */
const dummyEnemy = (d, dx = 0) =>
  gev(
    ({ d, dx }) => {
      const sw = window.__sw
      const p = sw.runtime.player
      const e = sw.cstate.spawnEnemy({ name: '測試史萊姆', color: '#7ad', x: p.x + dx, z: p.z + d, level: 1, tag: 'qa' })
      e.maxHp = e.hp = 99999
      e.atk = 0
      e.moveSpeed = 0
      const h = sw.combat.units.find((u) => u.id === 'hero')
      h.targetId = e.id
      // 先不讓主角自動普攻，由測試決定出手時間
      h.atkTimer = 99
      return e.id
    },
    { d, dx },
  )

/** 在頁面裡每幀觀察：從 trigger() 開始到某隻怪物掉血 / 隊友回血的時間，以及特效世界的最大使用量 */
const watch = (trigger, ids, mode = 'damage') =>
  gev(
    ({ trigger, ids, mode }) =>
      new Promise((resolve) => {
        const sw = window.__sw
        const units = ids.map((id) => sw.combat.units.find((u) => u.id === id))
        const hp0 = units.map((u) => u.hp)
        const t0 = performance.now()
        const hitAt = units.map(() => -1)
        const peak = { slashes: 0, trails: 0, circles: 0, rings: 0, pillars: 0, orbs: 0, particles: 0 }
        let firstProjectile = -1
        // eslint-disable-next-line no-new-func
        new Function('sw', trigger)(sw)
        const tick = () => {
          const t = performance.now() - t0
          const s = sw.vfx.world?.stats()
          if (s) for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], k === 'particles' ? s.soft + s.add : s[k])
          if (firstProjectile < 0 && sw.combat.projectiles.some((p) => p.vfx)) firstProjectile = Math.round(t)
          units.forEach((u, i) => {
            // 治療：脫戰時本來就會慢慢回血，回復超過最大 HP 的 15% 才算是技能生效
            if (hitAt[i] < 0 && (mode === 'damage' ? u.hp < hp0[i] : u.hp > hp0[i] + u.maxHp * 0.15)) hitAt[i] = Math.round(t)
          })
          if (hitAt.every((h) => h >= 0) || t > 3500) return resolve({ hitAt, firstProjectile, peak })
          requestAnimationFrame(tick)
        }
        tick()
      }),
    { trigger, ids, mode },
  )

// 戰士斬擊（普通攻擊）
await newGame('knight')
let id = await dummyEnemy(1.6)
const ATTACK = `sw.combat.units.find((u) => u.id === 'hero').atkTimer = 0`
let r = await watch(ATTACK, [id])
check('遊戲 戰士普攻：刀光掃到時才扣血（不是出手瞬間）', r.hitAt[0] >= 120 && r.peak.slashes > 0, JSON.stringify(r))
await gev(() => (window.__sw.combat.units.find((u) => u.id === 'hero').atkTimer = 0))
await gwait(210)
await gshot('game_knight_slash')

// 弓箭射擊（普通攻擊）＋ 拖尾
await newGame('archer')
id = await dummyEnemy(7)
r = await watch(ATTACK, [id])
check('遊戲 弓箭手普攻：箭有拖尾，飛到才扣血', r.peak.trails > 0 && r.hitAt[0] > 250, JSON.stringify(r))
await gwait(500)
await gev(() => (window.__sw.combat.units.find((u) => u.id === 'hero').atkTimer = 0))
await gwait(260)
await gshot('game_archer_shot')

// 法師火球（技能 1）：魔法陣 → 0.4 秒後發射 → 爆炸波及旁邊的怪物
await newGame('mage')
const main = await dummyEnemy(7)
const side = await gev(() => {
  const sw = window.__sw
  const t = sw.combat.units.find((u) => u.id === sw.combat.units.find((h) => h.id === 'hero').targetId)
  const e = sw.cstate.spawnEnemy({ name: '旁邊的史萊姆', color: '#da7', x: t.x + 1.3, z: t.z + 0.4, level: 1, tag: 'qa' })
  e.maxHp = e.hp = 99999
  e.atk = 0
  e.moveSpeed = 0
  return e.id
})
// 普攻計時器拉長，量到的一定是火球
await gev(() => (window.__sw.combat.units.find((u) => u.id === 'hero').atkTimer = 99))
r = await watch(`sw.sim.heroCast(0)`, [main, side])
check('遊戲 火球：魔法陣與集氣之後（約 0.4 秒）才發射', r.firstProjectile >= 330 && r.firstProjectile <= 650 && r.peak.circles > 0, JSON.stringify(r))
check('遊戲 火球：命中爆炸、波及旁邊的怪物', r.hitAt.every((h) => h > 0) && r.peak.rings > 0 && r.peak.orbs > 0, JSON.stringify(r))
await gev(() => {
  const h = window.__sw.combat.units.find((u) => u.id === 'hero')
  h.cooldowns[0] = 0
  h.mp = h.maxMp
  window.__sw.sim.heroCast(0)
})
await gwait(620)
await gshot('game_mage_fireball')
await gwait(420)
await gshot('game_mage_explosion')

// 聖者治療（技能 2）
await newGame('cleric')
await gev(() => window.__sw.cstate.recruitAlly('knight'))
await gwait(400)
const ally = await gev(() => {
  const sw = window.__sw
  const a = sw.combat.units.find((u) => u.team === 'party' && u.id !== 'hero')
  const p = sw.runtime.player
  a.x = p.x + 1.5
  a.z = p.z + 2
  a.hp = Math.round(a.maxHp * 0.3)
  const h = sw.combat.units.find((u) => u.id === 'hero')
  h.hp = h.maxHp
  return a.id
})
r = await watch(`sw.sim.heroCast(1)`, [ally], 'heal')
check('遊戲 聖者治療：光柱升起後（約 0.45 秒）才回血', r.hitAt[0] >= 330 && r.peak.pillars > 0 && r.peak.circles > 0, JSON.stringify(r))
await gev((ally) => {
  const sw = window.__sw
  const a = sw.combat.units.find((u) => u.id === ally)
  a.hp = Math.round(a.maxHp * 0.3)
  const h = sw.combat.units.find((u) => u.id === 'hero')
  h.cooldowns[1] = 0
  h.mp = h.maxMp
  sw.sim.heroCast(1)
}, ally)
await gwait(430)
await gshot('game_cleric_heal')

// 換地圖：特效與時間軸清空
const cleared = await gev(
  () =>
    new Promise((resolve) => {
      const sw = window.__sw
      const h = sw.combat.units.find((u) => u.id === 'hero')
      h.cooldowns[1] = 0
      h.mp = h.maxMp
      sw.sim.heroCast(1)
      setTimeout(() => {
        const before = sw.vfx.world.stats()
        sw.cstate.stashWorld()
        setTimeout(() => {
          const after = sw.vfx.world.stats()
          sw.cstate.restoreWorld()
          resolve({ before: before.circles + before.soft + before.add, after: after.circles + after.soft + after.add + after.pillars })
        }, 120)
      }, 200)
    }),
)
check('換地圖時特效全部清掉', cleared.before > 0 && cleared.after === 0, JSON.stringify(cleared))
await page.close()

check('沒有主控台錯誤', errs.length === 0, errs.slice(0, 5).join(' | '))

const pass = results.filter((r) => r.ok).length
say(`\n結果：${pass}/${results.length} 通過`)
writeFileSync(OUT + 'vfx-results.json', JSON.stringify({ date: new Date().toISOString(), results, stress: { high, low } }, null, 2))
writeFileSync(OUT + 'vfx.log.txt', log.join('\n'))
await browser.close()
process.exit(pass === results.length ? 0 : 1)
