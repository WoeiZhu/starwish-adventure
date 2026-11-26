// 第二章夥伴（暗殺者、藥師）與出戰名單測試（本機 Edge 無頭，先開 dev server：port 5183）
//   node companions-qa.mjs [標籤]
// 檢查：入隊事件（出現時機、打完才加入、滿員進休息名單）、出戰名單（6 選 4、休息不拿經驗、戰鬥中不能換、存讀檔）、
//       新技能（中毒與擴散、毒孢子、治療動作、二連擊、旋刃、瞬閃、暴擊與移速增益）、隊友 AI 會用技能、模型與選單畫面、主控台無錯誤
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'companions'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/companions-qa/${label}/`, import.meta.url))
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

// 開新局：騎士主角，第一章三位夥伴到齊，劇情跳到指定步驟，怪物全部先清掉（避免干擾）
async function newGame(step = 'c2_hunt') {
  await ev((step) => {
    localStorage.removeItem('starwish.save.v1')
    const sw = window.__sw
    sw.useGame.getState().setCamMode('explore')
    sw.useGame.getState().setProfile({ classId: 'knight', name: '測試' })
    sw.useGame.getState().startGame()
    for (const c of ['archer', 'mage', 'cleric']) sw.cstate.recruitAlly(c)
    sw.progress.story.step = step
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    sw.useGame.setState({ dialog: null })
  }, step)
  await ready()
}
const place = (x, z) =>
  ev(
    ([x, z]) => {
      const sw = window.__sw
      sw.runtime.player.x = x
      sw.runtime.player.z = z
      let i = 0
      for (const u of sw.combat.units) if (u.kind === 'ally') (u.x = x - 1 + i), (u.z = z + 1.5), i++
    },
    [x, z],
  )
/** 對話一路按到底（會執行 onEnd） */
const finishDialog = () =>
  ev(() => {
    const g = window.__sw.useGame
    for (let i = 0; i < 20 && g.getState().dialog; i++) {
      const d = g.getState().dialog
      if (d.choices && d.index >= d.lines.length - 1) break
      g.getState().advanceDialog()
    }
    return g.getState().dialog
  })
/** 在主角前方放一隻事件怪（不重生） */
const spawn = (dx, dz, o = {}) =>
  ev(
    ([dx, dz, o]) => {
      const sw = window.__sw
      const h = sw.combat.units[0]
      const u = sw.cstate.spawnEnemy({ name: '測試怪', color: '#ff00ff', x: h.x + dx, z: h.z + dz, level: 6, tag: 'qa', ...o })
      u.maxHp = u.hp = o.hp ?? 5000
      return u.id
    },
    [dx, dz, o],
  )
const unit = (id) =>
  ev((id) => {
    const u = window.__sw.combat.units.find((x) => x.id === id)
    return u && { hp: u.hp, maxHp: u.maxHp, poison: u.poisonTime, stun: u.stun, x: u.x, z: u.z, alive: u.alive, target: u.targetId }
  }, id)

// ───────────── 一、事件地點與出現時機 ─────────────
const spots = await ev(() => {
  const sw = window.__sw
  const out = {}
  for (const [k, p] of Object.entries({ herb: { x: 6, z: -51 }, shadow: { x: -17, z: -51 } })) {
    const w = sw.nav.nearestWalkableOverworld(p)
    out[k] = Math.hypot(w.x - p.x, w.z - p.z)
  }
  return out
})
check('兩個入隊地點都在可走的地面上', spots.herb < 0.2 && spots.shadow < 0.2, JSON.stringify(spots))

await newGame('c2_scout')
const ids = () => ev(() => window.__sw.story.interactables().filter((i) => i.kind === 'companion').map((i) => i.id))
check('第二章調查石碑前：兩位都還沒出現', (await ids()).length === 0, JSON.stringify(await ids()))
await ev(() => (window.__sw.progress.story.step = 'c2_hunt'))
check('淨化山谷開始：藥師出現、暗殺者還沒', JSON.stringify(await ids()) === '["companion-apothecary"]', JSON.stringify(await ids()))
const q1 = await ev(() => window.__sw.story.questInfo().lines.join('｜'))
check('任務欄有藥師的支線提示', q1.includes('蘑菇群'), q1)
await ev(() => (window.__sw.progress.story.step = 'c2_crystal'))
check('找到侵蝕源頭：兩位都出現', (await ids()).length === 2, JSON.stringify(await ids()))

// ───────────── 二、藥師入隊事件：先打倒蘑菇才加入；出戰已滿 → 休息名單 ─────────────
await place(6, -48)
await wait(1500)
await shot('1_apothecary_npc')
await ev(() => window.__sw.story.interactWith('companion-apothecary'))
let d = await finishDialog()
check('藥師對話有「幫她擊退蘑菇」選項', !!d?.choices?.some((c) => c.label.includes('擊退')), JSON.stringify(d?.choices?.map((c) => c.label)))
await ev(() => {
  const g = window.__sw.useGame
  g.getState().dialog.choices[0].run()
  g.setState({ dialog: null })
})
const herb = await ev(() => window.__sw.combat.units.filter((u) => u.tag === 'ev_herb' && u.alive).map((u) => u.species))
check('事件：出現 3 隻孢子蘑菇', herb.length === 3 && herb.every((s) => s === 'mushroom'), JSON.stringify(herb))
check('打完之前還沒加入', !(await ev(() => window.__sw.progress.recruited.includes('apothecary'))))
await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units.filter((u) => u.tag === 'ev_herb' && u.alive)) sw.actions.kill(u)
})
await wait(200)
d = await finishDialog()
await ev(() => window.__sw.useGame.getState().dialog && window.__sw.useGame.getState().advanceDialog())
await wait(200)
const after = await ev(() => ({ rec: [...window.__sw.progress.recruited], bench: [...window.__sw.progress.bench], size: window.__sw.cstate.partySize() }))
check('打倒蘑菇後藥師加入名單', after.rec.includes('apothecary'), JSON.stringify(after))
check('出戰已滿（3 位）：藥師先休息，出戰人數仍是 4', after.bench.includes('apothecary') && after.size === 4, JSON.stringify(after))

// ───────────── 三、出戰名單 ─────────────
const sw1 = await ev(() => {
  const sw = window.__sw
  const err = sw.cstate.setActiveCompanions(['archer', 'mage', 'apothecary'])
  sw.useGame.getState().partyChanged()
  return { err, allies: sw.combat.units.filter((u) => u.kind === 'ally').map((u) => u.classId), bench: [...sw.progress.bench] }
})
check('換人：藥師出戰、聖者休息', !sw1.err && JSON.stringify(sw1.allies) === '["archer","mage","apothecary"]' && JSON.stringify(sw1.bench) === '["cleric"]', JSON.stringify(sw1))
const over = await ev(() => window.__sw.cstate.setActiveCompanions(['archer', 'mage', 'apothecary', 'cleric']))
check('超過 3 位出戰會被擋下', !!over, String(over))
const expTest = await ev(() => {
  const sw = window.__sw
  const m = sw.progress.members
  const before = { cleric: m.cleric.exp + m.cleric.level * 1e6, apothecary: m.apothecary.exp + m.apothecary.level * 1e6 }
  const h = sw.combat.units[0]
  const e = sw.cstate.spawnEnemy({ name: '經驗怪', color: '#fff', x: h.x + 3, z: h.z, level: 8, tag: 'qa_exp' })
  sw.actions.kill(e)
  return {
    cleric: m.cleric.exp + m.cleric.level * 1e6 - before.cleric,
    apothecary: m.apothecary.exp + m.apothecary.level * 1e6 - before.apothecary,
  }
})
check('打倒怪物：出戰的藥師拿到經驗、休息的聖者沒有', expTest.apothecary > 0 && expTest.cleric === 0, JSON.stringify(expTest))
const inFight = await ev(() => {
  const sw = window.__sw
  sw.combat.inCombat = true
  const r = sw.cstate.setActiveCompanions(['archer', 'mage', 'cleric'])
  sw.combat.inCombat = false
  return r
})
check('戰鬥中不能換人', inFight === '戰鬥中不能換人', String(inFight))

// 選單畫面
await ev(() => window.__sw.useGame.getState().openMenu('party'))
await wait(400)
const menu = await ev(() => ({
  cards: [...document.querySelectorAll('.squad-card')].map((b) => b.textContent),
  on: document.querySelectorAll('.squad-card.on').length,
  members: [...document.querySelectorAll('.ms-member')].map((b) => b.textContent),
}))
check('選單「隊伍」有出戰名單：4 位夥伴、3 位出戰', menu.cards.length === 4 && menu.on === 3, JSON.stringify(menu.cards))
check('頭像列含休息中的聖者（可以配點、換裝）', menu.members.length === 5 && menu.members.some((t) => t.includes('休息')), JSON.stringify(menu.members))
await shot('2_squad_menu')
// 點休息中的聖者 → 超過上限提示；先讓弓箭手休息再點聖者 → 換成功
await page.click('.squad-card:not(.on)')
await wait(150)
const toast1 = await ev(() => window.__sw.useGame.getState().toast?.text ?? window.__sw.useGame.getState().toast ?? '')
check('出戰已滿時點休息的人：提示先讓一位休息', JSON.stringify(toast1).includes('最多'), JSON.stringify(toast1))
await page.click('.squad-card.on >> nth=0')
await wait(150)
await page.click('.squad-card:has-text("米婭")')
await wait(300)
const swapped = await ev(() => window.__sw.combat.units.filter((u) => u.kind === 'ally').map((u) => u.classId))
check('在選單點兩下完成換人（弓箭手休息、聖者出戰）', !swapped.includes('archer') && swapped.includes('cleric') && swapped.length === 3, JSON.stringify(swapped))
// 手機橫拿
await page.setViewportSize({ width: 844, height: 390 })
await wait(400)
const fit = await ev(() => {
  const r = document.querySelector('.squad')?.getBoundingClientRect()
  return r && { right: Math.round(r.right), w: innerWidth }
})
check('手機橫拿：出戰名單不超出畫面', !!fit && fit.right <= fit.w, JSON.stringify(fit))
await shot('3_squad_phone')
await page.setViewportSize({ width: 1280, height: 720 })
await ev(() => window.__sw.useGame.getState().closeMenu())

// 存讀檔
const saved = await ev(() => {
  const sw = window.__sw
  sw.useGame.getState().saveGame()
  const d = sw.save.readSave()
  return { rec: d.recruited, bench: d.bench }
})
check('存檔保留招募名單與休息名單', saved.rec.includes('apothecary') && JSON.stringify(saved.bench) === '["archer"]', JSON.stringify(saved))
const oldSave = await ev(() => {
  const sw = window.__sw
  const raw = JSON.parse(localStorage.getItem('starwish.save.v1'))
  delete raw.bench
  raw.recruited = ['archer', 'mage', 'cleric', 'apothecary', 'assassin']
  localStorage.setItem('starwish.save.v1', JSON.stringify(raw))
  const d = sw.save.readSave()
  sw.useGame.getState().saveGame() // 還原
  return { bench: d.bench, active: d.recruited.filter((c) => !d.bench.includes(c)) }
})
check('沒有休息名單的存檔：多出來的人自動休息（最後加入的先休息）', JSON.stringify(oldSave.active) === '["archer","mage","cleric"]', JSON.stringify(oldSave))

// ───────────── 四、藥師技能 ─────────────
await ev(() => {
  const sw = window.__sw
  sw.cstate.setActiveCompanions(['cleric', 'apothecary', 'mage'])
  sw.useGame.getState().partyChanged()
})
await place(0, 20)
await wait(800)
const apo = 'ally-apothecary'
// 隊友 AI 先暫停：每幀把技能冷卻填滿，只測手動施放的效果
const freeze = (on) =>
  ev((on) => {
    const sw = window.__sw
    clearInterval(window.__qaFreeze)
    if (on)
      window.__qaFreeze = setInterval(() => {
        for (const u of sw.combat.units) if (u.kind === 'ally') u.gcd = 99
      }, 16)
  }, on)
await freeze(true)
const e1 = await spawn(5, 0)
const e2 = await spawn(6.2, 1)
/** 讓隊友對 target 施放第 idx 個技能；gap = 施放者站在目標前方幾公尺 */
const cast = (uid, idx, target, gap = 4) =>
  ev(
    ([uid, idx, target, gap]) => {
      const sw = window.__sw
      const u = sw.combat.units.find((x) => x.id === uid)
      u.cooldowns[idx] = 0
      u.mp = u.maxMp
      u.stun = 0
      if (target) u.targetId = target
      if (target) {
        const t = sw.combat.units.find((x) => x.id === target)
        u.x = t.x - gap
        u.z = t.z
      }
      const r = sw.actions.castSkill(u, idx)
      if (r !== 'ok') u.gcd = 99 // 失敗時別讓 AI 趁空檔放別的技能
      return r
    },
    [uid, idx, target, gap],
  )
check('毒性擴散施放成功', (await cast(apo, 0, e1)) === 'ok')
await wait(900)
const p1 = await unit(e1)
const p2 = await unit(e2)
check('毒性擴散：目標與旁邊的怪都中毒', p1.poison > 0 && p2.poison > 0, JSON.stringify({ p1: p1.poison, p2: p2.poison }))
const hpA = p1.hp
await wait(2200)
const hpB = (await unit(e1)).hp
check('中毒每秒扣血', hpB < hpA, `${hpA} → ${hpB}`)
// 擴散：中毒的怪倒下時，毒傳給身邊沒中毒的怪
const spread = await ev(
  ([a]) => {
    const sw = window.__sw
    const src = sw.combat.units.find((x) => x.id === a)
    const h = sw.combat.units[0]
    const n = sw.cstate.spawnEnemy({ name: '鄰居', color: '#fff', x: src.x + 1.2, z: src.z, level: 6, tag: 'qa' })
    n.maxHp = n.hp = 5000
    n.targetId = 'hero'
    sw.actions.kill(src)
    return n.poisonTime
  },
  [e1],
)
check('毒性擴散：中毒的怪倒下，毒傳給身邊戰鬥中的怪', spread > 0, String(spread))
await shot('4_poison')
// 治療藥水：播 Heal 動作、補最低血量的隊友
const healed = await ev(() => {
  const sw = window.__sw
  const m = sw.combat.units.find((x) => x.id === 'ally-mage')
  m.hp = Math.round(m.maxHp * 0.3)
  const u = sw.combat.units.find((x) => x.id === 'ally-apothecary')
  const seq = u.actionSeq
  u.cooldowns[1] = 0
  u.mp = u.maxMp
  u.gcd = 0
  const r = sw.actions.castSkill(u, 1)
  return { r, clip: u.actionClip, seq: u.actionSeq - seq, ratio: +(m.hp / m.maxHp).toFixed(2) }
})
check('治療藥水：補血並播放 Heal 動作', healed.r === 'ok' && healed.clip === 'Heal' && healed.seq === 1 && healed.ratio > 0.5, JSON.stringify(healed))
// 毒孢子
const e3 = await spawn(5, -3)
// 讓牠鎖定站在旁邊的隊友（實戰時怪物多半貼著隊伍打），不要一路追主角
await ev(([t]) => {
  const sw = window.__sw
  const e = sw.combat.units.find((x) => x.id === t)
  const m = sw.combat.units.find((x) => x.id === 'ally-mage')
  m.x = e.x - 1.2
  m.z = e.z
  e.targetId = m.id
}, [e3])
const before3 = (await unit(e3)).hp
check('毒孢子施放成功', (await cast(apo, 3, e3)) === 'ok')
const slowed = await ev(async ([t]) => {
  await new Promise((r) => setTimeout(r, 150))
  return window.__sw.combat.units.find((x) => x.id === t).slow
}, [e3])
check('毒孢子：範圍內的怪在爆炸前被減速', slowed > 0, String(slowed))
await wait(250)
const sporeN = await ev(() => window.__sw.combat.spores.length)
check('毒孢子：地上長出蘑菇（倒數中）', sporeN === 1, String(sporeN))
await wait(250)
await shot('5_spore_growing')
await wait(1200)
const s3 = await unit(e3)
check('毒孢子：倒數結束爆炸，造成傷害並中毒', (await ev(() => window.__sw.combat.spores.length)) === 0 && s3.hp < before3 && s3.poison > 0, JSON.stringify({ before3, hp: s3.hp, poison: s3.poison }))
await shot('6_spore_burst')
// 疾行藥劑
const haste = await ev(() => {
  const sw = window.__sw
  const u = sw.combat.units.find((x) => x.id === 'ally-apothecary')
  u.cooldowns[2] = 0
  u.mp = u.maxMp
  const r = sw.actions.castSkill(u, 2)
  return { r, hero: sw.actions.moveMul(sw.combat.units[0]), mage: sw.actions.moveMul(sw.combat.units.find((x) => x.id === 'ally-mage')) }
})
check('疾行藥劑：全隊移動速度 ×1.35', haste.r === 'ok' && Math.abs(haste.hero - 1.35) < 0.01 && Math.abs(haste.mage - 1.35) < 0.01, JSON.stringify(haste))
// 主角實際跑得比較快
const run = await ev(async () => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'enemy' && u.tag === 'qa') u.alive = false
  sw.combat.inCombat = false
  sw.runtime.path = [{ x: sw.runtime.player.x, z: sw.runtime.player.z + 30 }]
  const z0 = sw.runtime.player.z
  await new Promise((r) => setTimeout(r, 1000))
  const dz = sw.runtime.player.z - z0
  sw.runtime.path = null
  return +dz.toFixed(2)
})
check('疾行藥劑：主角實際跑速提高（1 秒 > 6.5 m）', run > 6.5, `${run} m`)

// ───────────── 五、暗殺者入隊與技能 ─────────────
await place(-17, -47)
await ev(() => window.__sw.story.interactWith('companion-assassin'))
d = await finishDialog()
await ev(() => {
  const g = window.__sw.useGame
  g.getState().dialog.choices[0].run()
  g.setState({ dialog: null })
})
const wolves = await ev(() => window.__sw.combat.units.filter((u) => u.tag === 'ev_shadow' && u.alive).map((u) => u.tier))
check('暗殺者事件：狼群首領（精英）＋2 隻幼狼', wolves.length === 3 && wolves.includes('elite'), JSON.stringify(wolves))
await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units.filter((u) => u.tag === 'ev_shadow' && u.alive)) sw.actions.kill(u)
})
await wait(200)
await finishDialog()
await ev(() => window.__sw.useGame.getState().dialog && window.__sw.useGame.getState().advanceDialog())
await wait(200)
const rec2 = await ev(() => ({ rec: [...window.__sw.progress.recruited], bench: [...window.__sw.progress.bench] }))
check('暗殺者加入：名單 5 人（6 人隊伍含主角）', rec2.rec.length === 5 && rec2.rec.includes('assassin') && rec2.bench.includes('assassin'), JSON.stringify(rec2))
await ev(() => {
  const sw = window.__sw
  sw.cstate.setActiveCompanions(['assassin', 'apothecary', 'cleric'])
  sw.useGame.getState().partyChanged()
})
await place(0, 20)
await wait(1500)
await freeze(true)
const sin = 'ally-assassin'
const t1 = await spawn(4, 4)
check('二連擊施放成功', (await cast(sin, 0, t1, 1.2)) === 'ok')
const hits = await ev(async ([t]) => {
  const sw = window.__sw
  const e = sw.combat.units.find((x) => x.id === t)
  const seen = []
  let last = e.hp
  const t0 = performance.now()
  while (performance.now() - t0 < 700) {
    if (e.hp !== last) seen.push(Math.round(performance.now() - t0)), (last = e.hp)
    await new Promise((r) => setTimeout(r, 10))
  }
  return seen
}, [t1])
check('二連擊：分兩下打中', hits.length >= 2, JSON.stringify(hits))
// 旋刃：身邊 3 隻都被打到
const ring3 = await ev(() => {
  const sw = window.__sw
  const u = sw.combat.units.find((x) => x.id === 'ally-assassin')
  const list = [0, 2.1, 4.2].map((a) => {
    const e = sw.cstate.spawnEnemy({ name: '圍', color: '#fff', x: u.x + Math.cos(a) * 1.8, z: u.z + Math.sin(a) * 1.8, level: 6, tag: 'qa' })
    e.maxHp = e.hp = 5000
    e.targetId = u.id
    return e
  })
  u.cooldowns[1] = 0
  u.mp = u.maxMp
  u.gcd = 0
  const r = sw.actions.castSkill(u, 1)
  return { r, hit: list.filter((e) => e.hp < 5000).length }
})
check('旋刃：身邊 3 隻都被打中', ring3.r === 'ok' && ring3.hit === 3, JSON.stringify(ring3))
// 影葉之心：全隊暴擊 +20%
const crit = await ev(() => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  sw.cstate.removeBuffs(h)
  const before = sw.actions.critOf(h)
  const u = sw.combat.units.find((x) => x.id === 'ally-assassin')
  u.cooldowns[2] = 0
  u.mp = u.maxMp
  const r = sw.actions.castSkill(u, 2)
  return { r, before: +before.toFixed(2), after: +sw.actions.critOf(h).toFixed(2) }
})
check('影葉之心：全隊暴擊率 +20%', crit.r === 'ok' && Math.abs(crit.after - crit.before - 0.2) < 0.001, JSON.stringify(crit))
// 瞬閃：從 8 公尺外落到目標身邊，打傷並暈眩
const far = await spawn(-6, 8)
const blink0 = await ev(
  ([t]) => {
    const sw = window.__sw
    const u = sw.combat.units.find((x) => x.id === 'ally-assassin')
    const e = sw.combat.units.find((x) => x.id === t)
    u.x = e.x + 8
    u.z = e.z
    return { d: Math.hypot(u.x - e.x, u.z - e.z), hp: e.hp }
  },
  [far],
)
const br = await ev(
  ([t]) => {
    const sw = window.__sw
    const u = sw.combat.units.find((x) => x.id === 'ally-assassin')
    u.cooldowns[3] = 0
    u.mp = u.maxMp
    u.gcd = 0
    u.targetId = t
    const r = sw.actions.castSkill(u, 3)
    // 記下落地瞬間的距離（之後隊友 AI 會照常移動）
    window.__qaBlink = null
    const e = sw.combat.units.find((x) => x.id === t)
    const x0 = u.x
    const timer = setInterval(() => {
      if (Math.abs(u.x - x0) > 1 && !window.__qaBlink) window.__qaBlink = +Math.hypot(u.x - e.x, u.z - e.z).toFixed(2)
    }, 5)
    setTimeout(() => clearInterval(timer), 1000)
    return r
  },
  [far],
)
await wait(200)
await shot('7_blink_jump')
await wait(300)
const blink1 = await ev(
  ([t]) => {
    const sw = window.__sw
    const e = sw.combat.units.find((x) => x.id === t)
    return { d: window.__qaBlink ?? 99, hp: e.hp, stun: +e.stun.toFixed(2) }
  },
  [far],
)
// 落點貼著目標約 1 m；落地重擊會把目標擊退 0.5～0.7 m
check('瞬閃：落到目標身邊（8 m → 2 m 內，含擊退）', br === 'ok' && blink1.d < 2, JSON.stringify({ before: blink0.d, after: blink1.d }))
check('瞬閃：落地造成傷害並暈眩', blink1.hp < blink0.hp && blink1.stun > 0.3, JSON.stringify({ hp0: blink0.hp, ...blink1 }))
await shot('8_blink_land')

// ───────────── 六、隊友 AI 會自己用技能 ─────────────
await freeze(false)
await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'enemy' && u.tag === 'qa') u.alive = false
})
const used = await ev(async () => {
  const sw = window.__sw
  const h = sw.combat.units[0]
  const foes = [0, 1, 2, 3].map((i) => {
    const e = sw.cstate.spawnEnemy({ name: 'AI 測試', color: '#fff', x: h.x + 5 + (i % 2), z: h.z + (i - 1.5) * 1.2, level: 6, tag: 'qa_ai' })
    e.maxHp = e.hp = 3000
    return e
  })
  h.targetId = foes[0].id
  for (const u of sw.combat.units) if (u.kind === 'ally') (u.cooldowns = [0, 0, 0, 0]), (u.mp = u.maxMp), (u.gcd = 0)
  const sin = sw.combat.units.find((x) => x.id === 'ally-assassin')
  const apo = sw.combat.units.find((x) => x.id === 'ally-apothecary')
  const t0 = performance.now()
  while (performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 100))
  return { sin: sin.cooldowns.map((c) => c > 0), apo: apo.cooldowns.map((c) => c > 0), poisoned: foes.filter((f) => f.poisonTime > 0 || !f.alive).length }
})
check('暗殺者 AI 有用技能（至少 2 種）', used.sin.filter(Boolean).length >= 2, JSON.stringify(used.sin))
check('藥師 AI 有用技能並讓怪中毒', used.apo.filter(Boolean).length >= 1 && used.poisoned >= 1, JSON.stringify(used))
await shot('9_ai_fight')

// ───────────── 七、模型與技能樹 ─────────────
const tree = await ev(() => {
  const t = window.__sw.prog
  return ['assassin', 'apothecary'].map((c) => window.__sw.progress.members[c] && Object.keys(t).length)
})
const trees = await ev(async () => {
  const mod = await import('/src/data/skilltree.ts')
  return { assassin: mod.TREES.assassin.length, apothecary: mod.TREES.apothecary.length }
})
check('兩個新職業都有 12 格技能樹', trees.assassin === 12 && trees.apothecary === 12, JSON.stringify(trees))
const models = await ev(() =>
  performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .filter((n) => /A0[24]\/character-game/.test(n))
    .map((n) => n.split('/').slice(-2).join('/')),
)
check('載入壓縮過的 A02／A04 模型（.web.glb）', models.some((m) => m.startsWith('A02/') && m.endsWith('.web.glb')) && models.some((m) => m.startsWith('A04/') && m.endsWith('.web.glb')), JSON.stringify(models))
void tree

check('主控台沒有錯誤', errs.length === 0, errs.slice(0, 5).join(' | '))
const failed = results.filter((r) => !r.ok)
writeFileSync(OUT + 'results.json', JSON.stringify({ passed: results.length - failed.length, total: results.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
