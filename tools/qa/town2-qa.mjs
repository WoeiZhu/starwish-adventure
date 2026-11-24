// 新版星光鎮（方案 B，?town=b）整合測試與驗收截圖（本機 Edge 無頭，先開 dev server：npm run dev，port 5183）
//   node town2-qa.mjs [標籤]
// 1. 電腦 1280×720：城外遠望 → 接近城門 → 穿越城門 → 城內中央廣場 → 商店門口 → 高角度俯視，再走出城
// 2. 手機橫拿 844×390（省電模式、觸控）：城內實際遊戲畫面
// 檢查：進出城、出入口方向一致、門口與 NPC 可達、城牆不能穿過、交談時鏡頭拉近、城內隱藏戰鬥按鈕、
//       背景音樂切換、效能數字、主控台錯誤
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'town2'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/town-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = (process.env.QA_URL ?? 'http://localhost:5183/') + '?town=b'
const results = []
const log = []
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  log.push(s)
  console.log(s)
}
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  say(ok ? '✔' : '✘', name, detail)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })

async function open(view) {
  const ctx = await browser.newContext(view)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.goto(URL_, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })
  const ev = (f, a) => page.evaluate(f, a)
  const wait = (ms) => page.waitForTimeout(ms)
  const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })
  async function walkTo(x, z, timeout = 40000, tol = 0.8) {
    const ok = await ev(({ x, z }) => {
      const sw = window.__sw
      const path = sw.nav.findPath(sw.runtime.player, { x, z })
      sw.runtime.path = path
      return !!path
    }, { x, z })
    if (!ok) return { arrived: false, reason: 'no path' }
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      await wait(150)
      const s = await ev(() => ({ path: !!window.__sw.runtime.path, x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z }))
      if (!s.path) return { arrived: Math.hypot(s.x - x, s.z - z) < tol, d: +Math.hypot(s.x - x, s.z - z).toFixed(2) }
    }
    return { arrived: false, reason: 'timeout' }
  }
  const perf = async (ms = 2000) =>
    ev(async (ms) => {
      const gl = window.__sw.gl
      let n = 0
      let worst = 0
      let last = performance.now()
      const t0 = last
      await new Promise((res) => {
        const f = () => {
          const now = performance.now()
          worst = Math.max(worst, now - last)
          last = now
          n++
          if (now - t0 < ms) requestAnimationFrame(f)
          else res()
        }
        requestAnimationFrame(f)
      })
      return { fps: Math.round((n * 1000) / ms), worstMs: Math.round(worst), calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures }
    }, ms)
  return { ctx, page, errs, ev, wait, ready, walkTo, perf }
}

async function newGame(t, quality) {
  await t.ev((quality) => {
    localStorage.removeItem('starwish.save.v1')
    localStorage.setItem('starwish.cam', 'immersive')
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId: 'archer', name: '小星' })
    sw.useGame.getState().startGame()
    sw.useGame.getState().setQuality(quality)
    for (const c of ['mage', 'knight', 'cleric']) sw.cstate.recruitAlly(c)
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    sw.useGame.setState({ dialog: null })
  }, quality)
  await t.ready()
}
const cam = (t, o) => t.ev((o) => Object.assign(window.__sw.cam, o), o)

// ── 電腦 ──
{
  const t = await open({ viewport: { width: 1280, height: 720 } })
  const shot = (n) => t.page.screenshot({ path: OUT + n + '.png' })
  await newGame(t, 'high')
  // 1. 城外遠望：站在南方街道上（城門北邊 22 m），鏡頭在身後往南看
  await t.walkTo(0.2, 12)
  await t.ev(() => (window.__sw.runtime.player.facing = 0))
  await cam(t, { yaw: Math.PI, yawT: Math.PI, distT: 11, tiltT: -0.32 })
  await t.wait(2500)
  await shot('1_outside_view')
  say('城外遠望', await t.perf())

  // 2. 接近城門
  await t.walkTo(0.2, 27)
  await t.wait(1600)
  await shot('2_approach_gate')
  const gateCam = await t.ev(() => {
    const c = window.__sw.cam
    return { yaw: +c.yaw.toFixed(2) }
  })
  say('接近城門', await t.perf(), gateCam)

  // 3. 穿越城門 → 進城
  const enterT0 = Date.now()
  await t.ev(() => {
    const sw = window.__sw
    const tr = sw.townData.TOWN_PORTAL.trigger
    sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: tr.x, z: tr.z + 0.3 })
  })
  await t.page.waitForFunction(() => window.__sw.mapState.id !== 'overworld', null, { timeout: 30000 })
  await t.ready()
  const loadMs = Date.now() - enterT0
  await t.wait(700)
  await shot('3_through_gate')
  let s = await t.ev(() => {
    const sw = window.__sw
    const p = sw.runtime.player
    return {
      map: sw.mapState.id,
      x: +p.x.toFixed(2),
      z: +p.z.toFixed(2),
      facing: +p.facing.toFixed(2),
      skillbarHidden: !!document.querySelector('.skillbar.safe'),
      banner: !!document.querySelector('.town-banner'),
      music: sw.music.musicState().want,
    }
  })
  check('進城：換到城鎮地圖、落點在城門內側', s.map === 'starlight-town-meshy' && Math.abs(s.x) < 1 && s.z > 12 && s.z < 17.6, JSON.stringify(s))
  check('出入口方向一致：主線世界往南走進城門，城裡面向城內（-Z）', Math.abs(Math.abs(s.facing) - Math.PI) < 0.3, `facing=${s.facing}`)
  check('城內隱藏戰鬥按鈕、顯示城鎮名稱', s.skillbarHidden && s.banner)
  check('背景音樂切換成城鎮曲', s.music === 'town', s.music)
  say('進城載入', loadMs, 'ms', await t.perf())

  // 碰撞：城牆、建築不能穿過
  const wallTest = await t.ev(() => {
    const sw = window.__sw
    const blocked = (x, z) => sw.nav.isBlockedAt(x, z)
    return { wall: blocked(-30, 0) && blocked(30, -10) && blocked(0, -46), shop: blocked(-14.5, 5), gateSide: blocked(-6, 20), passage: !blocked(0, 20) }
  })
  check('城牆、商店、城門兩側擋住，門洞可以走', wallTest.wall && wallTest.shop && wallTest.gateSide && wallTest.passage, JSON.stringify(wallTest))

  // 門口與 NPC 都走得到
  const doors = await t.ev(() => {
    const sw = window.__sw
    const list = [...sw.townData.TOWN_DOORS.map((d) => ['door:' + d.id, d.x, d.z]), ...sw.townData.TOWN_NPCS.map((n) => ['npc:' + n.role, n.x, n.z + 1.2])]
    return list.map(([id, x, z]) => [id, !!sw.nav.findPath(sw.runtime.player, { x, z })])
  })
  check('四間建築門口、四位 NPC 都有路走到', doors.every(([, ok]) => ok), JSON.stringify(doors))

  // 4. 城內中央廣場
  const plazaWalk = await t.walkTo(1.5, -3)
  await t.ev(() => (window.__sw.runtime.player.facing = Math.PI))
  await cam(t, { yawT: 0.35, distT: 11, tiltT: 0 })
  await t.wait(2200)
  await shot('4_plaza')
  check('走到中央廣場', plazaWalk.arrived, JSON.stringify(plazaWalk))
  say('廣場', await t.perf())

  // 5. 商店門口（武器店）＋交談鏡頭
  const door = await t.ev(() => window.__sw.townData.TOWN_DOORS.find((d) => d.id === 'weapon-shop'))
  const doorWalk = await t.walkTo(door.x + 0.6, door.z - 0.8)
  await cam(t, { yawT: door.facing + 0.65, distT: 7.5, tiltT: 0 })
  await t.wait(2000)
  await shot('5_shop_door')
  check('走到武器店門口', doorWalk.arrived, JSON.stringify(doorWalk))
  const before = await t.ev(() => window.__sw.cam.eff)
  await t.ev(() => window.__sw.story.interactWith('town-npc-weapon-vendor-placeholder'))
  await t.wait(1500)
  const talk = await t.ev(() => ({ dialog: !!window.__sw.useGame.getState().dialog, camDist: +window.__sw.cam.eff.toFixed(2) }))
  await shot('5b_talk_camera')
  check('和武器商人交談：鏡頭自動拉近', talk.dialog, JSON.stringify({ before: +before.toFixed(2), ...talk }))
  await t.ev(() => window.__sw.useGame.getState().closeDialog())

  // 6. 高角度俯視（探索模式拉到最遠）
  await t.walkTo(0.5, -2)
  await t.ev(() => window.__sw.useGame.getState().setCamMode('explore'))
  await cam(t, { yawT: 0.3, distT: 36, tiltT: 0.12 })
  await t.wait(2600)
  await shot('6_high_angle')
  say('高角度', await t.perf())

  // 出城
  await t.ev(() => window.__sw.useGame.getState().setCamMode('immersive'))
  const exitT0 = Date.now()
  await t.ev(() => {
    const sw = window.__sw
    const e = sw.townData.TOWN_EXIT
    sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: e.x, z: e.z })
  })
  await t.page.waitForFunction(() => window.__sw.mapState.id === 'overworld', null, { timeout: 40000 })
  await t.ready()
  await t.wait(1200)
  s = await t.ev(() => {
    const sw = window.__sw
    const p = sw.runtime.player
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), facing: +p.facing.toFixed(2), skill: !!document.querySelector('.skillbar:not(.safe) .skill'), music: sw.music.musicState().want }
  })
  await t.page.screenshot({ path: OUT + '6b_back_outside.png' })
  check('出城：回到城門外、面向北方、戰鬥按鈕恢復、音樂換回草原', s.z < 33.5 && s.z > 28 && s.skill && s.music === 'field', JSON.stringify({ ...s, ms: Date.now() - exitT0 }))
  await t.wait(1600)
  const stayed = await t.ev(() => window.__sw.mapState.id)
  check('出城後不會被彈回城裡', stayed === 'overworld')
  // 主線世界的城牆擋住（不能從牆邊繞進城）
  const shellBlocked = await t.ev(() => {
    const sw = window.__sw
    return [-10, -20, 12, 22].every((x) => sw.nav.isBlockedAt(x, 36.2))
  })
  check('主線世界：城牆擋住，只能從城門進城', shellBlocked)
  // 反覆進出：幾何體、貼圖不累積
  const mem = []
  for (let r = 0; r < 5; r++) {
    await t.ev(() => {
      const sw = window.__sw
      sw.travel.enterMap('starlight-town-meshy', sw.townData.TOWN_SPAWN)
    })
    await t.ready()
    await t.wait(2000)
    // 在城裡量（城鎮沒有區塊串流，數字穩定；野外的區塊會陸續載入卸載）
    mem.push(await t.ev(() => ({ geo: window.__sw.gl.info.memory.geometries, tex: window.__sw.gl.info.memory.textures })))
    await t.ev(() => {
      const sw = window.__sw
      sw.travel.enterMap('overworld', sw.townData.TOWN_PORTAL.ret)
    })
    await t.ready()
    await t.wait(1500)
  }
  // 第一次進出會建立一些快取（之後重用），比較第 3～5 輪
  check('反覆進出 5 輪：幾何體與貼圖沒有累積', mem[4].geo - mem[2].geo <= 1 && mem[4].tex - mem[2].tex <= 1, JSON.stringify(mem))
  check('沒有主控台錯誤（電腦）', t.errs.length === 0, t.errs.slice(0, 3).join(' | '))
  await t.ctx.close()
}

// ── 手機橫拿 ──
{
  const t = await open({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await newGame(t, 'saver')
  await t.ev(() => {
    const sw = window.__sw
    const tr = sw.townData.TOWN_PORTAL.trigger
    sw.runtime.player.x = tr.x
    sw.runtime.player.z = tr.z - 4
  })
  await t.wait(600)
  await t.ev(() => {
    const sw = window.__sw
    const tr = sw.townData.TOWN_PORTAL.trigger
    sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: tr.x, z: tr.z + 0.3 })
  })
  await t.page.waitForFunction(() => window.__sw.mapState.id !== 'overworld', null, { timeout: 30000 })
  await t.ready()
  await t.walkTo(0, 6)
  await t.wait(3600)
  await t.page.screenshot({ path: OUT + '7_phone_landscape.png' })
  const p = await t.perf(3000)
  const hud = await t.ev(() => ({
    skillbarHidden: !!document.querySelector('.skillbar.safe'),
    menuBtn: !!document.querySelector('.menu-btn'),
    camBtn: !!document.querySelector('.cam-btn'),
    joystick: !!document.querySelector('.stick-zone'),
  }))
  check('手機：城內保留搖桿、選單、鏡頭切換，隱藏戰鬥按鈕', hud.skillbarHidden && hud.menuBtn && hud.camBtn && hud.joystick, JSON.stringify(hud))
  say('手機橫拿（省電）', p)
  check('沒有主控台錯誤（手機）', t.errs.length === 0, t.errs.slice(0, 3).join(' | '))
  await t.ctx.close()
}

await browser.close()
const pass = results.filter((r) => r.ok).length
say(`\n結果：${pass}/${results.length} 通過`)
writeFileSync(OUT + 'results.json', JSON.stringify({ results, log }, null, 2))
process.exit(pass === results.length ? 0 : 1)
