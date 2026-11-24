// 武器包與掉落物模型的自動測試（本機 Edge 無頭模式，先開 dev server：npm run dev，port 5183）
//   node assets-qa.mjs [標籤]
// 測項：四個職業手上的武器模型、騎士盾牌換階、弓的拉弦動畫、箭矢、掉落物、寶箱開箱、武器店購買、
//       藥水擺設、只下載壓縮版模型、反覆換裝的資源釋放、截圖
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'assets'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/map-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.QA_URL ?? 'http://localhost:5183/'

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
const models = []
page.on('response', async (r) => {
  if (!/\/models\/.*\.glb$/.test(r.url())) return
  const len = +(r.headers()['content-length'] ?? 0)
  models.push({ url: r.url().replace(/^.*\/models\//, ''), status: r.status(), kb: Math.round(len / 1024) })
})
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
const shot = (name) => page.screenshot({ path: OUT + name + '.jpg', type: 'jpeg', quality: 85 })
const ready = () => page.waitForFunction(() => !window.__sw.mapState.loading && !window.__sw.stream.isPriming(), null, { timeout: 60000 })

await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(() => window.__sw?.useGame, null, { timeout: 30000 })

/** 場景裡掛在手上的武器包模型（找名稱是 WeaponRoot 的根節點） */
const gearInfo = () =>
  ev(() => {
    const out = []
    window.__sw.scene.traverse((o) => {
      if (o.name !== 'WeaponRoot' && o.name !== 'ArrowNock') return
      let hand = o.parent
      while (hand && !/Hand$/.test(hand.name)) hand = hand.parent
      if (!hand) return
      const meshes = []
      o.traverse((c) => c.isMesh && meshes.push(c.name))
      out.push({ hand: hand.name, meshes: meshes.length, visible: o.visible })
    })
    return out
  })
/** 某個位置附近、確實顯示中的掉落物 / 寶箱模型數量（根節點名稱 LootRoot，往上每層都要可見） */
const lootNear = (x, z, r) =>
  ev(
    ({ x, z, r }) => {
      const THREE_V = window.__sw.scene.position.constructor
      const v = new THREE_V()
      let n = 0
      window.__sw.scene.traverse((o) => {
        if (o.name !== 'LootRoot') return
        for (let p = o; p; p = p.parent) if (!p.visible) return
        o.getWorldPosition(v)
        if (Math.hypot(v.x - x, v.z - z) < r) n++
      })
      return n
    },
    { x, z, r },
  )
const memory = () =>
  ev(() => {
    const m = window.__sw.gl.info.memory
    return { geo: m.geometries, tex: m.textures, calls: window.__sw.gl.info.render.calls }
  })

/** 新遊戲：指定主角職業，招募其他三人，怪物先關掉 */
async function newGame(classId) {
  await ev((classId) => {
    localStorage.clear()
    const sw = window.__sw
    sw.useGame.getState().setProfile({ classId })
    sw.useGame.getState().startGame()
    for (const c of ['archer', 'mage', 'knight', 'cleric']) if (c !== classId) sw.cstate.recruitAlly(c)
    for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
    sw.progress.gold = 3000
  }, classId)
  await ready()
}

/** 主角正面特寫：隊友先移到後面，鏡頭在主角斜前方 */
async function heroCloseUp() {
  await ev(() => {
    const sw = window.__sw
    sw.runtime.path = null
    const p = sw.runtime.player
    p.facing = 0
    for (const u of sw.combat.units) if (u.team === 'party' && u.id !== 'hero') (u.x = p.x + (Math.random() - 0.5) * 3), (u.z = p.z - 3.5)
    // 鏡頭最近 2.9（CameraRig 的 minDist），再近會算錯仰角
    Object.assign(sw.cam, { yaw: 0.45, yawT: 0.45, dist: 3, distT: 3, tilt: -0.2, tiltT: -0.2 })
  })
  await wait(1300)
}

/** 四人排成一列面向鏡頭，近距離拍（隊友在跟隨距離內不會移動） */
async function lineUp(dist = 4.6, tilt = -0.2) {
  await ev(
    ({ dist, tilt }) => {
      const sw = window.__sw
      sw.runtime.path = null
      const p = sw.runtime.player
      p.facing = 0
      const party = sw.combat.units.filter((u) => u.team === 'party')
      party.forEach((u, i) => {
        const x = p.x + (i - 1.5) * 1.25
        if (u.id === 'hero') p.x = x
        u.x = x
        u.z = p.z
        u.facing = 0
        if (u.ai) u.ai.path = null
      })
      Object.assign(sw.cam, { yaw: 0, yawT: 0, dist, distT: dist, tilt, tiltT: tilt })
    },
    { dist, tilt },
  )
  await wait(1400)
}

// ── 1. 四個職業的武器（第 1 階） ──
for (const c of ['archer', 'mage', 'knight', 'cleric']) {
  await newGame(c)
  await wait(1500)
  const g = await gearInfo()
  // 主角＋三位隊友：弓 1、杖 1、權杖 1、劍 1 + 盾 1 = 5 個武器模型
  check(`${c}：四人手上都掛著武器包模型（含騎士盾牌）`, g.length === 5 && g.every((x) => x.meshes > 0), JSON.stringify(g))
  if (c === 'archer') {
    await lineUp()
    await shot('01_party_tier1')
  }
  await heroCloseUp()
  await shot(`01_${c}_closeup`)
}

// ── 2. 換成第 3 階武器與高等防具：武器與盾牌模型跟著換（主角當騎士，方便特寫） ──
await newGame('knight')
await wait(1500)
const before = await memory()
const t3 = await ev(() => {
  const sw = window.__sw
  const res = []
  for (const [c, model, lvl] of [['knight', 'sword-03', 30], ['archer', 'bow-02', 15]]) {
    const w = { uid: 'qa-w-' + c, slot: 'weapon', classId: c, name: 'QA ' + model, quality: 3, level: lvl, stats: { atk: 50 }, model }
    sw.progress.inventory.push(w)
    sw.progress.members[c].equip.weapon = w.uid
  }
  const a = { uid: 'qa-armor', slot: 'armor', name: 'QA 防具', quality: 3, level: 30, stats: { def: 30 } }
  sw.progress.inventory.push(a)
  sw.progress.members.knight.equip.armor = a.uid
  sw.cstate.refreshParty()
  sw.useGame.getState().bumpGear()
  return res
})
await wait(1500)
const urls = models.map((m) => m.url)
check('騎士換上第 3 階劍：下載 sword-03', urls.some((u) => u.endsWith('sword-03.web.glb')), '')
check('騎士防具 LV30：換成第 3 階盾牌 shield-ivory-gold', urls.some((u) => u.endsWith('shield-ivory-gold.web.glb')), '')
check('弓箭手裝備指定 bow-02（武器店的商品）', urls.some((u) => u.endsWith('bow-02.web.glb')), '')
await heroCloseUp()
await shot('02_knight_tier3_sword_shield')
say('換裝前後', before, await memory(), t3)

// 反覆換裝 6 次：幾何體、貼圖數量不能一直增加（武器包模型共用快取）
const swaps = []
for (let i = 0; i < 6; i++) {
  await ev((i) => {
    const sw = window.__sw
    sw.progress.members.knight.equip.weapon = i % 2 ? 'qa-w-knight' : undefined
    sw.cstate.refreshParty()
    sw.useGame.getState().bumpGear()
  }, i)
  await wait(500)
  swaps.push(await memory())
}
say('反覆換裝', swaps)
check('反覆換裝 6 次資源不增加', swaps[5].geo <= swaps[1].geo + 2 && swaps[5].tex <= swaps[1].tex + 1, JSON.stringify([swaps[1], swaps[5]]))

// ── 3. 村子商人旁的藥水擺設；弓箭手攻擊：拉弦動畫、箭矢模型（村子是安全區不能攻擊，走到草原） ──
await newGame('archer')
const vm = await ev(() => window.__sw.story.interactables().find((i) => i.id === 'merchant'))
await ev(({ x, z }) => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x, z: z + 2 })
}, vm)
await page.waitForFunction(() => !window.__sw.runtime.path, null, { timeout: 40000 })
await ev((f) => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'party' && u.id !== 'hero') (u.x = sw.runtime.player.x - 3), (u.z = sw.runtime.player.z + 2)
  Object.assign(sw.cam, { yaw: f + 0.4, yawT: f + 0.4, dist: 5, distT: 5, tilt: 0.2, tiltT: 0.2 })
}, vm.facing)
await wait(1200)
await shot('07_village_potion_crate')
check('村子商人旁邊有藥水擺設（紅藍綠 3 瓶）', (await lootNear(vm.x, vm.z, 1.8)) === 3)
await ev(() => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: 6, z: 27 })
})
await page.waitForFunction(() => !window.__sw.runtime.path, null, { timeout: 40000 })
await ev(() => {
  const sw = window.__sw
  const p = sw.runtime.player
  // 只留主角，前方 7 公尺放一隻史萊姆
  for (const u of sw.combat.units) if (u.team === 'party' && u.id !== 'hero') u.alive = false
  p.facing = 0
  const e = sw.cstate.spawnEnemy({ name: '測試史萊姆', color: '#7ad', x: p.x, z: p.z + 7, level: 1, tag: 'qa' })
  e.maxHp = e.hp = 99999
  e.atk = 0
  sw.combat.units.find((u) => u.id === 'hero').targetId = e.id
})
await ev(() => Object.assign(window.__sw.cam, { yaw: 1.4, yawT: 1.4, dist: 7, distT: 7, tilt: -0.1, tiltT: -0.1 }))
let arrowSeen = 0
let bowAnim = 0
for (let i = 0; i < 40 && (!arrowSeen || !bowAnim); i++) {
  await wait(100)
  const r = await ev(() => {
    const sw = window.__sw
    let arrows = 0
    let string = null
    sw.scene.traverse((o) => {
      if (o.name === 'ArrowNock' && o.parent?.parent?.visible && o.parent.visible) arrows++
      if (o.name === 'EditableBowstring' && !string) string = o
    })
    // 拉弦放箭是形變動畫：弓弦與弓身的 morph 權重離開 0
    let moved = 0
    sw.scene.traverse((o) => {
      if (o.name === 'EditableBowstring' || o.name === 'WeaponMesh') moved = Math.max(moved, ...(o.morphTargetInfluences ?? [0]))
    })
    return { arrows, projectiles: sw.combat.projectiles.length, moved: +moved.toFixed(4) }
  })
  if (r.arrows && !arrowSeen) {
    arrowSeen = r.arrows
    await shot('03_archer_arrow')
  }
  if (r.moved > 0.001) bowAnim = r.moved
}
check('弓箭手射出的是箭矢模型', arrowSeen > 0, `arrows=${arrowSeen}`)
check('攻擊時弓弦有動（DrawRelease）', bowAnim > 0, `moved=${bowAnim}`)

// ── 4. 掉落物：金幣、藥水、裝備包、飾品袋 ──
await ev(() => {
  const sw = window.__sw
  for (const u of sw.combat.units) if (u.team === 'enemy') (u.alive = false), (u.deadTime = -1e6)
  sw.combat.projectiles.length = 0
  const p = sw.runtime.player
  const mk = (kind, dx, item) => ({ id: 'qa-' + kind + dx, x: p.x + dx, z: p.z + 3.4, kind, amount: 1, item, age: 1, color: '#ffd23c' })
  sw.combat.drops.push(
    mk('gold', -1.5),
    mk('potion', -0.5),
    { ...mk('item', 0.5, { uid: 'qa-d1', slot: 'weapon', classId: 'archer', name: 'x', quality: 2, level: 1, stats: { atk: 1 } }), color: '#4a9cf5' },
    { ...mk('item', 1.5, { uid: 'qa-d2', slot: 'accessory', name: 'y', quality: 3, level: 1, stats: { hp: 1 } }), color: '#a96bf0' },
  )
  // 掉落物 0.5 秒內不會被吸過來；把年齡拉回 0.6 後主角不動就不會撿到（吸取範圍 3.2）
  sw.runtime.player.facing = 0
})
// 鏡頭在主角背後，掉落物在主角前方
await ev(() => Object.assign(window.__sw.cam, { yaw: Math.PI, yawT: Math.PI, dist: 6, distT: 6, tilt: 0.15, tiltT: 0.15 }))
await wait(700)
const heroAt = await ev(() => ({ x: window.__sw.runtime.player.x, z: window.__sw.runtime.player.z }))
const drops = { visibleLoot: await lootNear(heroAt.x, heroAt.z + 3.4, 2.2), drops: await ev(() => window.__sw.combat.drops.length) }
await shot('04_drops')
check('四種掉落物都用模型顯示', drops.visibleLoot === 4 && drops.drops === 4, JSON.stringify(drops))

// ── 5. 寶箱：關著是模型，打開後留在原地並播放開箱 ──
await newGame('knight')
const toChest = await ev(() => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x: -3, z: 31.4 })
  return !!sw.runtime.path
})
await page.waitForFunction(() => !window.__sw.runtime.path, null, { timeout: 40000 })
// 主角站在寶箱北邊；鏡頭在主角後上方，隊友移開
await ev(() => {
  const sw = window.__sw
  const p = sw.runtime.player
  p.facing = 0
  for (const u of sw.combat.units) if (u.team === 'party' && u.id !== 'hero') (u.x = p.x + 3), (u.z = p.z - 2)
  Object.assign(sw.cam, { yaw: Math.PI + 0.5, yawT: Math.PI + 0.5, dist: 5.5, distT: 5.5, tilt: 0.3, tiltT: 0.3 })
})
await wait(1200)
await shot('05a_chest_closed')
const closed = await lootNear(-3, 33, 0.8)
await ev(() => window.__sw.story.interactWith('c_meadow'))
await wait(1500)
await shot('05b_chest_opened')
const opened = { n: await lootNear(-3, 33, 0.8), chests: await ev(() => window.__sw.progress.story.chests) }
check('寶箱：開啟前顯示模型', toChest && closed === 1, `models=${closed}`)
check('寶箱：開啟後模型留在原地', opened.chests.includes('c_meadow') && opened.n === 1, JSON.stringify(opened))

// ── 6. 武器店：進城後在武器店門口買第 1 階武器 ──
await newGame('archer')
await ev(() => {
  const sw = window.__sw
  sw.travel.enterMap('starlight-town-meshy', { x: 0, z: 12.7, facing: Math.PI })
})
await ready()
await wait(800)
const shop = await ev(() => {
  const sw = window.__sw
  const door = sw.story.interactables().find((i) => i.id === 'town-door-weapon-shop')
  sw.story.interactWith(door.id)
  const d1 = sw.useGame.getState().dialog
  const first = d1.choices.map((c) => c.label)
  // 選「主角的武器」
  d1.choices[0].run()
  const d2 = sw.useGame.getState().dialog
  const items = d2.choices.map((c) => ({ label: c.label, desc: c.desc, disabled: c.disabled }))
  const goldBefore = sw.progress.gold
  d2.choices[0].run()
  const w = sw.progress.inventory.find((i) => i.uid === sw.progress.members.archer.equip.weapon)
  return { first, items, goldBefore, goldAfter: sw.progress.gold, equipped: w && { name: w.name, model: w.model, level: w.level } }
})
say('武器店', shop)
check('武器店：列出隊伍四人', shop.first.length === 5, JSON.stringify(shop.first))
check('武器店：弓箭手 3 階商品，高階要等級', shop.items.length === 5 && !!shop.items[1].disabled && !!shop.items[2].disabled, JSON.stringify(shop.items))
check('武器店：買下後扣錢並換上 bow-01', shop.goldAfter < shop.goldBefore && shop.equipped?.model === 'bow-01', JSON.stringify(shop.equipped))
// 再打開一次武器店的弓箭手商品頁截圖
await ev(() => {
  const sw = window.__sw
  sw.useGame.getState().closeDialog()
  sw.progress.members.archer.level = 12
  sw.story.interactWith('town-door-weapon-shop')
  sw.useGame.getState().dialog.choices[0].run()
  const d = sw.useGame.getState().dialog
  sw.useGame.setState({ dialog: { ...d, index: d.lines.length - 1 } })
})
await wait(600)
await shot('08_weapon_shop_menu')
await ev(() => {
  const sw = window.__sw
  sw.useGame.getState().closeDialog()
  sw.progress.members.archer.level = 1
})
// 讀回存檔：武器的模型 id 要保留
const saved = await ev(() => {
  const sw = window.__sw
  sw.useGame.getState().saveGame()
  const d = sw.save.readSave()
  return d && d.inventory.find((i) => i.model === 'bow-01')?.name
})
check('存檔後武器店的武器保留模型 id', !!saved, saved ?? '')

// ── 7. 藥水擺設：城裡雜貨商人、村子商人 ──
const gv = await ev(() => window.__sw.story.interactables().find((i) => i.id === 'town-npc-general-vendor'))
await ev(({ x, z }) => {
  const sw = window.__sw
  sw.runtime.path = sw.nav.findPath(sw.runtime.player, { x, z: z + 1.6 })
}, gv)
await page.waitForFunction(() => !window.__sw.runtime.path, null, { timeout: 40000 })
await ev(() => {
  const sw = window.__sw
  sw.runtime.player.facing = Math.PI
  Object.assign(sw.cam, { yaw: 0, yawT: 0, dist: 6, distT: 6, tilt: 0.25, tiltT: 0.25 })
})
await wait(1200)
await shot('06_town_potion_crate')
const bottles = await lootNear(gv.x, gv.z, 1.8)
check('城裡雜貨商人旁邊有藥水擺設（紅藍綠 3 瓶）', bottles === 3, `models=${bottles}`)

// ── 8. 只下載壓縮版 ──
const weaponLoot = models.filter((m) => /starwish-weapons|star-coin|potion-bottle|material-pouch|equipment-bundle|wooden-chest/.test(m.url))
const raw = weaponLoot.filter((m) => !m.url.endsWith('.web.glb'))
check('武器與掉落物只下載 .web.glb', raw.length === 0 && weaponLoot.length > 0, JSON.stringify(raw))
say('下載的武器與掉落物模型', weaponLoot.map((m) => `${m.url} ${m.kb}KB`))
const totalKb = weaponLoot.reduce((a, m) => a + m.kb, 0)
say('合計', totalKb, 'KB')

const real = errs.filter((e) => !/favicon/.test(e))
check('沒有主控台錯誤', real.length === 0, JSON.stringify(real.slice(0, 5)))
const passed = results.filter((r) => r.ok).length
say(`結果：${passed}/${results.length} 通過`)
writeFileSync(OUT + 'assets-results.json', JSON.stringify({ results, models: weaponLoot, totalKb }, null, 2))
writeFileSync(OUT + 'assets.log.txt', log.join('\n'))
await browser.close()
