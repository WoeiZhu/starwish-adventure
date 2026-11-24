// 星光鎮整合自動測試（本機 Edge 無頭模式，先開 dev server：npm run dev，port 5183）
//   node town-qa.mjs [標籤] [mobile]
// 測項：進城／出城不彈跳、載入時間、門口與 NPC 可達、隊伍跟隨、牆與噴泉不能穿過、店舖互動、
//       戰鬥中不能進城、城內存檔讀檔、舊存檔轉換、模型載入失敗退回、反覆進出的資源釋放、截圖
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'town', arg = ''] = process.argv
const mobile = arg === 'mobile'
const OUT = fileURLToPath(new URL(`../../docs/map-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
// 原版城鎮（新版是預設，原版要加 ?town=classic）
const URL_ = (process.env.QA_URL ?? 'http://localhost:5183/') + '?town=classic'

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
const results = []
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  log.push(s)
  console.log(s)
}
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  say(ok ? '✔' : '✘', name, detail)
}
const ev = (f, a) => page.evaluate(f, a)
const wait = (ms) => page.waitForTimeout(ms)
const shot = (name) => page.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 82 })

await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })

const state = () =>
  ev(() => {
    const sw = window.__sw
    const p = sw.runtime.player
    const party = sw.combat.units.filter((u) => u.team === 'party')
    return {
      map: sw.mapState.id,
      storeMap: sw.useGame.getState().mapId,
      loading: sw.mapState.loading,
      priming: sw.stream.isPriming(),
      x: +p.x.toFixed(2),
      z: +p.z.toFixed(2),
      enemies: sw.combat.units.filter((u) => u.team === 'enemy').length,
      allyGap: party.slice(1).map((u) => +Math.hypot(u.x - p.x, u.z - p.z).toFixed(1)),
      switches: sw.travel.travel.switches,
    }
  })

const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })

/** 用遊戲自己的尋路走到目標（和點地面一樣），回傳是否抵達 */
async function walkTo(x, z, timeout = 30000, tol = 0.6) {
  const ok = await ev(
    ({ x, z }) => {
      const sw = window.__sw
      const path = sw.nav.findPath(sw.runtime.player, { x, z })
      sw.runtime.path = path
      return !!path
    },
    { x, z },
  )
  if (!ok) return { arrived: false, reason: 'no path' }
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    await wait(150)
    const s = await ev(() => {
      const sw = window.__sw
      return { path: !!sw.runtime.path, x: sw.runtime.player.x, z: sw.runtime.player.z, map: sw.mapState.id }
    })
    if (!s.path) {
      const d = Math.hypot(s.x - x, s.z - z)
      return { arrived: d < tol, d: +d.toFixed(2), ms: Date.now() - t0 }
    }
  }
  return { arrived: false, reason: 'timeout' }
}

/** 走進城門的圓（觸發切換），等新地圖準備好；回傳載入時間 */
async function walkThroughPortal(expect) {
  const t = await ev(() => {
    const sw = window.__sw
    return sw.mapState.id === 'overworld' ? { x: 0.2, z: 36.4 } : { x: 0, z: 16.2 }
  })
  const t0 = Date.now()
  await ev(({ x, z }) => {
    const sw = window.__sw
    sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x, z })
  }, t)
  try {
    await page.waitForFunction((m) => window.__sw.mapState.id === m, expect, { timeout: 40000 })
  } catch (e) {
    say(
      '切換逾時',
      await ev(() => {
        const sw = window.__sw
        return {
          map: sw.mapState.id,
          p: [sw.runtime.player.x, sw.runtime.player.z],
          path: sw.runtime.path,
          armed: sw.travel.travel.armed,
          inCombat: sw.combat.inCombat,
          engaged: sw.combat.units.filter((u) => u.team === 'enemy' && u.alive && u.targetId).map((u) => [u.id, u.name, Math.round(u.x), Math.round(u.z)]),
          dialog: sw.useGame.getState().dialog?.speaker,
          toast: sw.useGame.getState().toast?.text,
        }
      }),
    )
    throw e
  }
  const switchedAt = Date.now()
  await ready()
  return { walkMs: switchedAt - t0, loadMs: Date.now() - switchedAt }
}

async function memory() {
  return ev(() => {
    const sw = window.__sw
    const m = sw.gl.info.memory
    return { geo: m.geometries, tex: m.textures, calls: sw.gl.info.render.calls, tris: sw.gl.info.render.triangles, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) }
  })
}

// ── 1. 新遊戲，四人隊伍，走到南方城門 ──
await ev(() => {
  localStorage.clear()
  const sw = window.__sw
  sw.useGame.getState().setProfile({ classId: 'archer' })
  sw.useGame.getState().startGame()
  for (const c of ['mage', 'knight', 'cleric']) sw.cstate.recruitAlly(c)
  // 測試時怪物不要干擾
  for (const u of sw.combat.units) if (u.team === 'enemy') u.alive = false, (u.deadTime = -1e6)
  sw.progress.gold = 200
})
await ready()
// 走到城門前（沿南方街道）
const toGate = await walkTo(0.2, 31.5, 40000)
check('從村子走到南方城門前', toGate.arrived, JSON.stringify(toGate))
await ev(() => Object.assign(window.__sw.cam, { yaw: 0, yawT: 0, dist: 13, distT: 13, tilt: 0.1, tiltT: 0.1 }))
await wait(900)
await shot('01_gate_overworld')
say('城門前', await memory())

// ── 2. 進城 ──
const enter = await walkThroughPortal('starlight-town-meshy')
let s = await state()
check('進城：換到 starlight-town-meshy', s.map === 'starlight-town-meshy' && s.storeMap === s.map, JSON.stringify(s))
check('進城：落點 (0, 12.7)', Math.hypot(s.x - 0, s.z - 12.7) < 0.3, `(${s.x}, ${s.z})`)
check('進城：野外怪物已收起', s.enemies === 0, `enemies=${s.enemies}`)
say('進城載入', enter, 'townLoadMs(內部)', await ev(() => window.__sw.mapState.lastLoadMs))
await wait(3000)
s = await state()
check('進城後站著 3 秒不會被彈回野外', s.map === 'starlight-town-meshy' && s.switches === 1, JSON.stringify(s))
say('城內落點隊友距離', s.allyGap)
// 剛進城、鏡頭沒動過：人物不能被城門擋住
await shot('02a_enter_default_camera')
const camD = await ev(() => +Math.hypot(window.__sw.cam.tx - window.__sw.runtime.player.x, window.__sw.cam.tz - window.__sw.runtime.player.z).toFixed(2))
say('剛進城鏡頭有效距離', await ev(() => +window.__sw.cam.eff.toFixed(2)), '目標偏差', camD)
await ev(() => Object.assign(window.__sw.cam, { dist: 14, distT: 14, tilt: 0.15, tiltT: 0.15 }))
await wait(800)
await shot('02_town_spawn')
const townMem = await memory()
say('城內', townMem, await ev(() => window.__sw.townStats))

// ── 3. 門口與 NPC 可達（往返），隊伍跟隨 ──
const spots = await ev(() =>
  window.__sw.story.interactables().map((i) => ({ id: i.id, x: i.x, z: i.z, kind: i.kind })),
)
for (const sp of spots) {
  const target = sp.kind === 'door' ? { x: sp.x, z: sp.z } : { x: sp.x, z: sp.z + 1.3 }
  const r = await walkTo(target.x, target.z, 30000, 0.7)
  await wait(1200)
  s = await state()
  // 互動：應該打開對話
  const talk = await ev((id) => {
    const sw = window.__sw
    sw.runtime.nearId = id
    sw.story.interactWith(id)
    const d = sw.useGame.getState().dialog
    const out = d ? { speaker: d.speaker, line: d.lines[0], choices: d.choices?.map((c) => c.label) } : null
    sw.useGame.getState().closeDialog()
    return out
  }, sp.id)
  check(`走到 ${sp.id}`, r.arrived, `${JSON.stringify(r)} 隊友距離 ${s.allyGap}`)
  check(`互動 ${sp.id}`, !!talk, JSON.stringify(talk))
  const back = await walkTo(0, 12.7, 30000, 0.7)
  check(`從 ${sp.id} 走回城門內`, back.arrived, JSON.stringify(back))
}
await ev(() => Object.assign(window.__sw.cam, { yaw: 0.6, yawT: 0.6, dist: 16, distT: 16, tilt: 0.2, tiltT: 0.2 }))
await walkTo(-8.6, 6.2)
await wait(1500)
await shot('03_weapon_shop_door')
await walkTo(9, 6.5)
await ev(() => Object.assign(window.__sw.cam, { yaw: -0.5, yawT: -0.5 }))
await wait(1500)
await shot('04_general_store_inn')
await walkTo(0, -3.5)
await ev(() => Object.assign(window.__sw.cam, { yaw: 0, yawT: 0, dist: 11, distT: 11 }))
await wait(1500)
await shot('05_guild_npcs')

// ── 4. 旅館：付 10 金幣全隊回滿 ──
const innRes = await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'party') u.hp = 1
  const gold = sw.progress.gold
  sw.story.interactWith('town-door-town-inn')
  const d = sw.useGame.getState().dialog
  sw.useGame.setState({ dialog: { ...d, index: d.lines.length - 1 } })
  sw.useGame.getState().choose(0)
  sw.useGame.getState().closeDialog()
  const party = sw.combat.units.filter((u) => u.team === 'party')
  return { goldBefore: gold, goldAfter: sw.progress.gold, full: party.every((u) => u.hp === u.maxHp) }
})
check('旅館：付 10 金幣全隊回滿', innRes.full && innRes.goldBefore - innRes.goldAfter === 10, JSON.stringify(innRes))

// ── 5. 牆與噴泉不能穿過（按住方向鍵直走） ──
async function holdKey(key, x, z, ms) {
  await ev(
    ({ x, z }) => {
      const sw = window.__sw
      sw.runtime.player.x = x
      sw.runtime.player.z = z
      sw.runtime.path = null
      Object.assign(sw.cam, { yaw: 0, yawT: 0 })
    },
    { x, z },
  )
  await wait(400)
  await page.keyboard.down(key)
  const samples = []
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    await wait(60)
    samples.push(await ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z })))
  }
  await page.keyboard.up(key)
  return samples
}
// 噴泉：中心 (0, 0.2)、半徑 1.9；從南邊往北走
let sm = await holdKey('w', 0, 4, 2200)
let minD = Math.min(...sm.map((p) => Math.hypot(p.x - 0, p.z - 0.2)))
check('噴泉不能穿過', minD >= 1.9 + 0.3, `最近距離 ${minD.toFixed(2)} m（噴泉半徑 1.9 + 角色 0.32）`)
// 北邊城牆：Three z = -16.35 ~ -15.65；從 (-13.5, -9) 往北走
sm = await holdKey('w', -13.5, -9, 2600)
let minZ = Math.min(...sm.map((p) => p.z))
check('北邊城牆不能穿過', minZ >= -15.65 + 0.3, `最北 z=${minZ.toFixed(2)}（牆內緣 -15.65）`)
// 西邊城牆：x = -15.35 ~ -14.65；從 (-10, -2) 往西走（按 A）
sm = await holdKey('a', -10, -2, 2200)
let minX = Math.min(...sm.map((p) => p.x))
check('西邊城牆不能穿過', minX >= -14.65 + 0.3, `最西 x=${minX.toFixed(2)}（牆內緣 -14.65）`)
// 武器店：方塊 x -12.3 ~ -4.9、z -1.85 ~ 3.85；從門口往北撞
sm = await holdKey('w', -8.6, 5.5, 1800)
minZ = Math.min(...sm.map((p) => p.z))
check('武器店牆不能穿過', minZ >= 3.85 + 0.3, `最北 z=${minZ.toFixed(2)}（店面 3.85）`)
// 城門旁的門樓：從城內 (3, 13) 往南撞（按 S）
sm = await holdKey('s', 3, 13, 1800)
let maxZ = Math.max(...sm.map((p) => p.z))
check('城門旁的門樓不能穿過', maxZ <= 14.65 - 0.3 && (await state()).map === 'starlight-town-meshy', `最南 z=${maxZ.toFixed(2)}（門樓 14.65）`)

// ── 6. 城內存檔 → 回標題 → 繼續 ──
await walkTo(-3, 8)
await ev(() => window.__sw.useGame.getState().saveGame())
const saved = await ev(() => JSON.parse(localStorage.getItem('starwish.save.v1')))
check('城內存檔：記下 mapId 與返回位置', saved.version === 3 && saved.mapId === 'starlight-town-meshy' && saved.returnPortal?.z === 33.2, JSON.stringify({ v: saved.version, map: saved.mapId, pos: saved.pos, ret: saved.returnPortal, region: saved.region }))
await ev(() => window.__sw.useGame.getState().backToTitle())
await wait(1500)
s = await state()
check('回標題：回到主線世界', s.map === 'overworld', JSON.stringify(s))
const t0c = Date.now()
await ev(() => window.__sw.useGame.getState().continueGame())
const loadingSeen = await ev(() => window.__sw.mapState.loading)
await ready()
const contMs = Date.now() - t0c
s = await state()
check('繼續：先載入城鎮再放人物', loadingSeen && s.map === 'starlight-town-meshy' && Math.hypot(s.x + 3, s.z - 8) < 0.5, `載入 ${contMs} ms，位置 (${s.x}, ${s.z})`)
await wait(2500)
s = await state()
check('城內讀檔後不會被彈出', s.map === 'starlight-town-meshy', JSON.stringify(s))

// ── 7. 出城：回到城門外，不彈跳 ──
const exit = await walkThroughPortal('overworld')
s = await state()
check('出城：回到城門外 (0.2, 33.2)', s.map === 'overworld' && Math.hypot(s.x - 0.2, s.z - 33.2) < 0.4, `(${s.x}, ${s.z}) 載入 ${JSON.stringify(exit)}`)
check('出城：野外怪物放回來', s.enemies > 30, `enemies=${s.enemies}`)
await wait(3000)
s = await state()
check('出城後站著 3 秒不會再被吸進城', s.map === 'overworld', JSON.stringify(s))
await shot('06a_exit_default_camera')
await ev(() => Object.assign(window.__sw.cam, { yaw: Math.PI, yawT: Math.PI, dist: 12, distT: 12, tilt: 0.1, tiltT: 0.1 }))
await wait(1000)
await shot('06_back_outside')

// ── 8. 被事件怪（強敵）追的時候不能進城；一般野怪不擋 ──
await walkTo(0.2, 31.5)
await ev(() => {
  const sw = window.__sw
  const e = sw.cstate.spawnEnemy({ name: '測試史萊姆', color: '#7ed957', x: 2.5, z: 30, level: 1, tag: 'qa' })
  e.atk = 0
  e.maxHp = e.hp = 99999
})
await wait(800)
await ev(() => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: 0.2, z: 36.4 })
})
let toast = null
for (let i = 0; i < 16 && !toast; i++) {
  await wait(250)
  toast = await ev(() => window.__sw.useGame.getState().toast?.text ?? null)
  if (toast && !toast.includes('強敵')) toast = null
}
await wait(1500)
s = await state()
check('被事件怪追的時候不能進城', s.map === 'overworld' && !!toast, `map=${s.map} toast=${toast}`)
await ev(() => {
  const sw = window.__sw
  sw.combat.units = sw.combat.units.filter((u) => u.tag !== 'qa')
})
say('戰鬥測試後走回', JSON.stringify(await walkTo(0.2, 31.5)), JSON.stringify(await state()))
await wait(1500)
// 一般史萊姆追著主角：照樣可以進城，回來時牠已經回到營地
await ev(() => {
  const sw = window.__sw
  const e = sw.combat.units.find((u) => u.id === 'm4-2')
  e.alive = true
  e.hp = e.maxHp
  e.atk = 0
  e.x = 1.8
  e.z = 30.5
  e.targetId = 'hero'
})
await wait(500)
const chased = await walkThroughPortal('starlight-town-meshy')
s = await state()
check('一般野怪追著時可以進城', s.map === 'starlight-town-meshy', JSON.stringify(chased))
await walkTo(0, 13.5)
await walkThroughPortal('overworld')
await wait(600)
const slime = await ev(() => {
  const e = window.__sw.combat.units.find((u) => u.id === 'm4-2')
  return { target: e.targetId, d: +Math.hypot(e.x - e.homeX, e.z - e.homeZ).toFixed(1) }
})
check('出城後野怪不再追擊、回到營地', slime.target === null || slime.d < 3, JSON.stringify(slime))
await walkTo(0.2, 31.5)
await wait(800)

// ── 9. 反覆進出 5 次：資源釋放 ──
const mem = []
for (let i = 0; i < 5; i++) {
  const a = await walkThroughPortal('starlight-town-meshy')
  await wait(1200)
  const inT = await memory()
  await walkTo(0, 13.5)
  const b = await walkThroughPortal('overworld')
  await wait(1500)
  const outT = await memory()
  mem.push({ loop: i + 1, enterMs: a.loadMs, exitMs: b.loadMs, town: inT, world: outT })
  say('往返', i + 1, JSON.stringify(mem[i]))
  await walkTo(0.2, 31.5)
}
const g0 = mem[1].world.geo
const gN = mem[4].world.geo
const t0m = mem[1].town.tex
const tNm = mem[4].town.tex
check('反覆進出沒有累積幾何體', gN - g0 <= 4, `第 2 輪 ${g0} → 第 5 輪 ${gN}`)
check('反覆進出沒有累積貼圖', tNm - t0m <= 2, `城內貼圖 第 2 輪 ${t0m} → 第 5 輪 ${tNm}`)

// ── 10. 舊存檔（第 2 版，沒有 mapId）轉換 ──
const mig = await ev(() => {
  const sw = window.__sw
  const cur = JSON.parse(localStorage.getItem('starwish.save.v1'))
  const old = { ...cur, version: 2, pos: { x: 5, z: 10 }, gold: 321 }
  delete old.mapId
  delete old.returnPortal
  localStorage.setItem('starwish.save.v1', JSON.stringify(old))
  const d = sw.save.readSave()
  return { map: d.mapId, ret: d.returnPortal, pos: d.pos, gold: d.gold, recruited: d.recruited.length, chests: d.story.chests.length, step: d.story.step }
})
check('第 2 版存檔：當作在野外、進度保留', mig.map === 'overworld' && mig.ret === null && mig.gold === 321 && mig.recruited === 3, JSON.stringify(mig))
// 第 3 版但城裡沒有 returnPortal（損毀）→ 用城門外預設
const mig2 = await ev(() => {
  const sw = window.__sw
  const cur = JSON.parse(localStorage.getItem('starwish.save.v1'))
  const bad = { ...cur, version: 3, mapId: 'starlight-town-meshy', pos: { x: 999, z: -999 }, returnPortal: null }
  localStorage.setItem('starwish.save.v1', JSON.stringify(bad))
  const d = sw.save.readSave()
  return { map: d.mapId, ret: d.returnPortal, pos: d.pos }
})
check('城內存檔缺返回位置、位置超出範圍：補預設值', mig2.map === 'starlight-town-meshy' && mig2.ret?.z === 33.2 && Math.abs(mig2.pos.z) <= 18, JSON.stringify(mig2))

// ── 11. 城鎮模型載入失敗 → 退回城門外 ──
await ev(() => {
  localStorage.clear()
  const sw = window.__sw
  sw.useGame.getState().backToTitle()
})
await page.route('**/town-environment.web.glb', (r) => r.abort())
await ev(() => {
  const sw = window.__sw
  sw.useGame.getState().startGame()
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
})
await ready()
await walkTo(0.2, 31.5, 40000)
const sw0 = await ev(() => window.__sw.travel.travel.switches)
await ev(() => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: 0.2, z: 36.4 })
})
// 進城一次＋載入失敗退回一次
await page.waitForFunction((n) => window.__sw.travel.travel.switches >= n + 2, sw0, { timeout: 30000 }).catch(() => {})
await ready()
await wait(700)
s = await state()
const failToast = await ev(() => window.__sw.useGame.getState().toast?.text)
check('城鎮模型載入失敗：退回城門外、顯示原因', s.map === 'overworld' && Math.hypot(s.x - 0.2, s.z - 33.2) < 0.5 && /載入失敗/.test(failToast ?? ''), `${JSON.stringify(s)} toast=${failToast}`)
await page.unroute('**/town-environment.web.glb')
// 失敗之後再進一次：要能正常載入（失敗的快取有清掉）
await walkTo(0.2, 31.5)
const retry = await walkThroughPortal('starlight-town-meshy')
s = await state()
check('載入失敗後再進城可以正常載入', s.map === 'starlight-town-meshy' && !s.loading, JSON.stringify(retry))
await page.unroute('**/town-environment.web.glb')

const passed = results.filter((r) => r.ok).length
say(`\n結果：${passed}/${results.length} 通過`)
say('主控台錯誤', errs.length ? errs.slice(0, 10) : '無')
writeFileSync(OUT + 'town.log.txt', log.join('\n'))
writeFileSync(OUT + 'town-results.json', JSON.stringify({ results, mem, errors: errs }, null, 2))
await browser.close()
