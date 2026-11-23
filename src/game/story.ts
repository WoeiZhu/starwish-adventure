// 劇情：任務進度、可互動物件（村長、商人、待招募夥伴、寶箱、祭壇、月光石碑、星晶簇、月泉）與事件流程。
// 第一章在草原、森林、石環招募夥伴並擊敗史萊姆王；第二章前往北方的月光山谷。
import { CLASSES, type ClassId } from '../data/classes'
import { makeItem, type Quality } from '../data/items'
import { DRAW_LEVER, DRAW_NOTICE } from '../data/terrain'
import { CHESTS, EVENT_SPOTS, GROVE, MERCHANT, NPC_ELDER, REGION_NAME, RUINS, SPRING, STELE } from '../data/world'
import { sfx } from '../systems/sfx'
import { burst, flash, pillar, ring, shake } from './combat/fx'
import { addFeed, addFloater, combat, companionClasses, hero, partySize, recruitAlly, spawnEnemy } from './combat/state'
import type { Unit } from './combat/types'
import { C2_HUNT_GOAL, HUNT_GOAL, addItem, progress, storyReached, unlock } from './progress'
import { runtime } from './runtime'
import { useGame, type Choice } from './store'

export type InteractKind = 'elder' | 'merchant' | 'companion' | 'chest' | 'altar' | 'stele' | 'grove' | 'spring' | 'lever' | 'notice'
export interface Interactable {
  id: string
  kind: InteractKind
  x: number
  z: number
  facing: number
  name: string
  /** 提示文字用的動詞 */
  verb: string
  classId?: ClassId
  /** 頭上是否顯示任務標記 */
  marker: boolean
}

const SPOTS = [EVENT_SPOTS.meadow, EVENT_SPOTS.forest, EVENT_SPOTS.ruins]
const SPOT_HINT = ['翠綠草原東側傳來求救聲', '西邊的迷霧森林有冒險者失蹤', '東北方的古代石環有位學者在調查']
const POTION_PRICE = 15
/** 事件怪物全滅後要執行的後續（不存檔：讀檔後事件會重新開始） */
const pending: Record<string, () => void> = {}

const story = () => progress.story
const heroClass = () => useGame.getState().hero.classId
const companions = () => companionClasses(heroClass())

/** 目前場上可互動的物件 */
export function interactables(): Interactable[] {
  const s = story()
  const list: Interactable[] = [
    { id: 'elder', kind: 'elder', ...NPC_ELDER, verb: '交談', marker: s.step === 'talk' || s.step === 'done' },
    { id: 'merchant', kind: 'merchant', ...MERCHANT, verb: '交談', marker: false },
    { id: 'altar', kind: 'altar', x: RUINS.x, z: RUINS.z, facing: 0, name: '石環祭壇', verb: '調查', marker: s.step === 'boss' && !bossAlive() },
    // 第二章：月光山谷的三個調查點
    { id: 'stele', kind: 'stele', ...STELE, facing: 0.2, name: '月光石碑', verb: '調查', marker: s.step === 'c2_scout' },
    { id: 'grove', kind: 'grove', x: GROVE.x, z: GROVE.z, facing: 0, name: '星晶簇', verb: '調查', marker: s.step === 'c2_crystal' && !tagAlive('ev_grove') },
    { id: 'spring', kind: 'spring', x: SPRING.x, z: SPRING.z, facing: 0, name: '月泉', verb: '調查', marker: s.step === 'c2_boss' && !tagAlive('boss2') },
  ]
  // 待招募的夥伴：教學任務完成後才會出現在事件地點
  if (s.step !== 'talk' && s.step !== 'hunt') {
    companions().forEach((c, i) => {
      if (progress.recruited.includes(c)) return
      list.push({
        id: `companion-${c}`,
        kind: 'companion',
        x: SPOTS[i].x,
        z: SPOTS[i].z,
        facing: i === 2 ? 2.4 : -0.6,
        name: CLASSES[c].companion,
        verb: '交談',
        classId: c,
        marker: true,
      })
    })
  }
  // 東側吊橋：從山谷那一側放下後，石環 ↔ 星晶林之間就多了一條捷徑
  if (!progress.unlocks.includes('east_bridge')) {
    list.push({ id: 'lever', kind: 'lever', ...DRAW_LEVER, facing: 0, name: '吊橋絞盤', verb: '轉動', marker: false })
    list.push({ id: 'notice', kind: 'notice', ...DRAW_NOTICE, facing: Math.PI, name: '告示牌', verb: '閱讀', marker: false })
  }
  for (const c of CHESTS) {
    if (!s.chests.includes(c.id)) {
      list.push({ id: c.id, kind: 'chest', x: c.x, z: c.z, facing: c.rot, name: '寶箱', verb: '開啟', marker: false })
    }
  }
  return list
}

const tagAlive = (tag: string) => combat.units.some((u) => u.tag === tag && u.alive)
const bossAlive = () => tagAlive('boss')

/**
 * 區域首領何時開始定期重生：森林精英在救出森林夥伴之後、石環 Boss 在第一章完成之後、
 * 星晶林的魔靈在第二章擊碎星晶簇之後、月泉的靈鹿在第二章完成之後
 */
export function areaBossUnlocked(id: string) {
  if (id === 'ab_ruins') return storyReached('done')
  if (id === 'ab_grove') return storyReached('c2_boss') && !combat.units.some((u) => u.tag === 'ev_grove')
  if (id === 'ab_spring') return storyReached('c2_done')
  if (id === 'ab_forest') {
    const forestMate = companions()[1]
    return progress.recruited.includes(forestMate) && !combat.units.some((u) => u.tag === 'ev_forest')
  }
  return false
}

function say(speaker: string, lines: string[], choices?: Choice[], onEnd?: () => void) {
  runtime.path = null
  runtime.approach = false
  useGame.getState().openDialog({ speaker, lines, index: 0, choices, onEnd })
}

function setStep(step: typeof progress.story.step, feed: string) {
  story().step = step
  addFeed(`任務更新：${feed}`, '#b8860b')
  sfx.levelUp()
  useGame.getState().saveGame()
}

function joined(c: ClassId) {
  const cls = CLASSES[c]
  recruitAlly(c)
  const u = combat.units.find((x) => x.classId === c)
  if (u) {
    pillar(u.x, u.z, '#ffe27a', 0.9, 5, 0.9)
    ring(u.x, u.z, '#ffe27a', 0.3, 2.6, 0.6)
    burst(u.x, 0.3, u.z, '#ffe27a', 24, 4, { up: 6, gravity: 5, life: 1 })
  }
  addFeed(`${cls.companion}（${cls.name}）加入了隊伍！`, '#2f9e52')
  sfx.levelUp()
  useGame.getState().partyChanged()
  if (progress.recruited.length >= 3 && story().step === 'recruit') {
    setStep('boss', '四人到齊！前往古代石環的祭壇')
  } else useGame.getState().saveGame()
}

/** 在指定位置周圍生成一群事件史萊姆 */
function ambush(tag: string, at: { x: number; z: number }, count: number, level: number) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.6
    spawnEnemy({
      name: '野生史萊姆',
      color: ['#7ed957', '#6ec3f4', '#ff9ec4'][i % 3],
      x: at.x + Math.cos(a) * 3.2,
      z: at.z + Math.sin(a) * 3.2,
      level,
      tag,
    })
  }
}

function talkElder() {
  const s = story()
  const name = NPC_ELDER.name
  if (s.step === 'talk') {
    return say(
      name,
      [
        '歡迎來到星光村！你就是新來的冒險者吧？',
        '用 W/A/S/D 走動，或用滑鼠左鍵點地面。點擊怪物可以鎖定，站定不動時普通攻擊會自動進行（邊跑邊打是不行的喔），按 1、2、3 用技能，4 是必殺技。',
        '最近草原上的史萊姆變多了，牠們成群住在村子外面的營地，村子附近是安全的。先去南邊打倒 3 隻，記得從遠處一隻一隻引過來。',
        '危險時按空白鍵閃避、按 Z 喝藥水。一個人的時候別逞強，打不過就回村子休息。',
      ],
      undefined,
      () => setStep('hunt', `打倒 ${HUNT_GOAL} 隻史萊姆`),
    )
  }
  if (s.step === 'hunt') return say(name, [`還差 ${HUNT_GOAL - s.huntKills} 隻。史萊姆在村子南邊的草原上。`])
  if (s.step === 'recruit') {
    const left = companions()
      .map((c, i) => (progress.recruited.includes(c) ? null : SPOT_HINT[i]))
      .filter(Boolean)
    return say(name, ['做得好！不過接下來的路，一個人走太危險了。', `我聽說：${left.join('；')}。去看看吧，他們會是可靠的夥伴。`])
  }
  if (s.step === 'boss') {
    return say(name, ['四個人都到齊了呢！', '東北方古代石環的祭壇封印著史萊姆王。準備好之後，去調查祭壇吧。'])
  }
  if (s.step === 'done') {
    return say(
      name,
      [
        '你們打倒了史萊姆王！星光村會永遠記得你們。',
        '不過……史萊姆王倒下的那一刻，祭壇的光直直射向了北方。',
        '村子北邊的林帶後面是「月光山谷」，山谷深處的月泉一直守護著這片土地。最近夜裡常聽見狼嚎，連溫馴的蘑菇精都變得很暴躁。',
        '從廣場往北的小路可以穿過林帶。先去看看山谷入口的月光石碑吧。山谷裡的怪物比草原強，記得補充藥水。',
      ],
      undefined,
      () => setStep('c2_scout', '前往北方的月光山谷，調查入口的月光石碑'),
    )
  }
  if (s.step === 'c2_scout') return say(name, ['月光石碑就在北邊林帶的出口，沿著廣場往北的小路走就會看到。'])
  if (s.step === 'c2_hunt') return say(name, ['山谷的幼狼和蘑菇被星晶侵蝕了嗎……', '幼狼會突然撲過來，蘑菇會噴出毒霧。看到綠色的霧就趕快離開！'])
  if (s.step === 'c2_crystal') return say(name, ['星晶林在山谷東側。如果那裡就是侵蝕的源頭，一定有強大的東西守著。'])
  if (s.step === 'c2_boss') {
    return say(name, ['月之碎片……傳說月泉的守護者是一頭苔蘚靈鹿。', '如果牠也被侵蝕了，就靠你們讓牠恢復平靜了。牠會治療同伴，用暈眩技能打斷牠的詠唱！'])
  }
  say(name, [
    '月泉恢復了光芒，連村子的井水都變得清甜了。謝謝你們！',
    '不過星晶到底是從哪裡掉下來的呢？最近天空偶爾會出現奇怪的裂縫……也許那會是下一段旅程了。',
  ])
}

/** 第二章的解說由第三位夥伴（在石環研究古代遺跡的學者）負責；還沒招募時由主角自己念 */
function scholar() {
  const c = companions()[2]
  return progress.recruited.includes(c) ? CLASSES[c].companion : hero().name
}

const ENGRAVING = '石碑上刻著：「月泉映照星辰，靈鹿守之。若星墜於谷，泉水蒙塵，萬物將失其溫順。」'

function readStele() {
  const s = story()
  if (!storyReached('done')) {
    return say('月光石碑', [ENGRAVING, '石碑在微微發光，但現在還看不懂這段話的意思。（第一章完成後再來調查）'])
  }
  if (s.step === 'done' || s.step === 'c2_scout') {
    return say(
      scholar(),
      [
        ENGRAVING,
        '看這些發光的碎片……和石環祭壇是同一種力量。史萊姆王的封印碎掉之後，碎片落進了山谷。',
        '山谷的動物就是被這些星晶侵蝕，才會變得這麼兇。',
        `先把失控的月影幼狼和孢子蘑菇各打倒 ${C2_HUNT_GOAL} 隻，減弱星晶的力量，再去找侵蝕的源頭。`,
      ],
      undefined,
      () => setStep('c2_hunt', `淨化山谷——打倒月影幼狼與孢子蘑菇各 ${C2_HUNT_GOAL} 隻`),
    )
  }
  say('月光石碑', [ENGRAVING, storyReached('c2_done') ? '石碑發出和月泉一樣清澈的光。' : '石碑的光比之前明亮了一些。'])
}

function touchGrove() {
  const s = story()
  if (tagAlive('ev_grove')) return
  if (!storyReached('c2_crystal')) {
    return say('星晶簇', ['巨大的星晶簇嗡嗡作響，四周的空氣都在震動。', '太危險了，先淨化山谷再來調查吧。'])
  }
  if (s.step === 'c2_crystal') {
    return say(
      scholar(),
      ['就是這個！整座山谷的星晶都是從這裡長出來的。', '把它擊碎的話……等等，裡面好像有什麼在動！'],
      [
        {
          label: '擊碎星晶簇',
          desc: '挑戰精英怪「星晶魔靈・核」',
          run: () => {
            const lv = hero().level
            spawnEnemy({ name: '星晶魔靈・核', color: '#8fd8ff', species: 'crystal', tier: 'elite', x: GROVE.x, z: GROVE.z, level: lv + 1, tag: 'ev_grove' })
            for (const side of [-1, 1]) {
              spawnEnemy({ name: '月影幼狼', color: '#8fa6d8', species: 'wolf', x: GROVE.x + side * 2.5, z: GROVE.z + 2, level: lv - 1, tag: 'ev_grove' })
            }
            pillar(GROVE.x, GROVE.z, '#8fd8ff', 1.4, 7, 1)
            ring(GROVE.x, GROVE.z, '#8fd8ff', 0.5, GROVE.r, 0.8)
            shake(0.4)
            sfx.ultimate()
            addFeed('星晶簇碎裂，星晶魔靈・核現身了！', '#6fa8dc')
            pending.ev_grove = () =>
              say(
                scholar(),
                ['魔靈碎掉之後，留下了一塊散發月光的碎片……這是「月之碎片」！', '把它帶到山谷深處的月泉，應該就能淨化泉水。'],
                undefined,
                () => setStep('c2_boss', '帶著月之碎片前往山谷深處的月泉'),
              )
          },
        },
        { label: '還沒準備好', run: () => {} },
      ],
    )
  }
  const b = combat.units.find((u) => u.area === 'ab_grove')
  const state = !b
    ? '殘留的星晶正在慢慢聚集……'
    : b.alive
      ? '星晶魔靈又凝聚成形了！'
      : `約 ${Math.max(1, Math.ceil(b.respawnTime - b.deadTime))} 秒後，殘留的星晶會再次凝聚成魔靈。`
  say('星晶簇', ['星晶簇的碎片還在微微發光。', `${state}可以反覆挑戰來收集裝備。`])
}

function useSpring() {
  const s = story()
  if (tagAlive('boss2')) return
  if (!storyReached('c2_boss')) {
    return say('月泉', ['泉水混濁，水底沉著幾塊黯淡的星晶。', '好像需要某種東西才能淨化它。'])
  }
  if (s.step === 'c2_boss') {
    return say(
      '月泉',
      [
        '你們把月之碎片放進泉水——',
        '泉水亮了一瞬間，又被黑影吞沒。泉底傳來沉重的腳步聲……',
        '靈鹿會蓄力衝撞（紅圈），會詠唱治療（用暈眩技能打斷），半血時還會呼喚幼狼。',
      ],
      [
        {
          label: '放入月之碎片',
          desc: '挑戰 Boss「苔蘚靈鹿」',
          run: () => {
            spawnEnemy({ name: '被侵蝕的苔蘚靈鹿', color: '#7cc98a', species: 'stag', tier: 'boss', x: SPRING.x, z: SPRING.z, level: hero().level + 2, tag: 'boss2' })
            ring(SPRING.x, SPRING.z, '#7cc98a', 0.5, SPRING.r + 1, 0.8)
            pillar(SPRING.x, SPRING.z, '#7cc98a', 1.6, 8, 1)
            shake(0.5)
            sfx.ultimate()
            addFeed('苔蘚靈鹿從月泉中站了起來！', '#2f9e52')
            pending.boss2 = () => {
              setStep('c2_done', '第二章完成！')
              say('苔蘚靈鹿', [
                '……（靈鹿身上的星晶一片片碎裂，眼神恢復了溫柔）',
                '靈鹿低頭碰了碰泉水，月泉重新亮起清澈的光。牠看了你們一眼，緩緩走進森林深處。',
              ])
              useGame.getState().setChapterDone(2)
            }
          },
        },
        { label: '還沒準備好', run: () => {} },
      ],
    )
  }
  const b = combat.units.find((u) => u.area === 'ab_spring')
  const state = !b
    ? '泉底的星晶還在微微發亮……'
    : b.alive
      ? '靈鹿又被殘留的星晶影響，守在泉水中央。'
      : `約 ${Math.max(1, Math.ceil(b.respawnTime - b.deadTime))} 秒後，靈鹿會再次失控出現。`
  say('月泉', ['泉水清澈，映著天上的星星。', `${state}可以反覆挑戰來收集裝備。`])
}

function talkMerchant() {
  const buy = (n: number, price: number): Choice => ({
    label: `買 ${n} 瓶藥水`,
    desc: `${price} 金幣`,
    disabled: progress.gold < price ? '金幣不足' : undefined,
    run: () => {
      progress.gold -= price
      progress.potions += n
      addFeed(`買了 ${n} 瓶生命藥水`)
      sfx.pickup(false)
      talkMerchant() // 留在商店畫面，方便連續購買
    },
  })
  say(
    MERCHANT.name,
    [`要補給嗎？你現在有 ${progress.gold} 金幣、${progress.potions} 瓶藥水。不需要的裝備可以在背包裡賣掉換錢。`],
    [buy(1, POTION_PRICE), buy(3, POTION_PRICE * 3 - 5), { label: '離開', run: () => {} }],
  )
}

function talkCompanion(c: ClassId) {
  const cls = CLASSES[c]
  const n = cls.companion
  const idx = companions().indexOf(c)
  const lv = hero().level
  const leave: Choice = { label: '暫時離開', desc: '事件保留，之後還能回來', run: () => {} }

  if (idx === 0) {
    return say(
      n,
      ['救、救命！', `我是${n}，是個${cls.name}。本來在追蹤史萊姆的巢穴，結果反而被包圍了……`],
      [
        {
          label: '協助擊退怪物',
          desc: '並肩作戰，打倒周圍的史萊姆',
          run: () => {
            joined(c)
            ambush('ev_meadow', EVENT_SPOTS.meadow, 3, lv - 1)
            pending.ev_meadow = () => say(n, ['呼……得救了，謝謝你！', '你的身手真好。讓我跟你一起旅行吧，我不會拖後腿的！'])
          },
        },
        {
          label: '提供補給物資',
          desc: '給她 2 瓶藥水，趁隙一起脫身',
          disabled: progress.potions < 2 ? '藥水不足' : undefined,
          run: () => {
            progress.potions -= 2
            joined(c)
            say(n, ['太感謝了！喝下藥水總算有力氣了。', '這份恩情我會用行動報答，讓我加入你的隊伍吧！'])
          },
        },
        leave,
      ],
    )
  }
  if (idx === 1) {
    return say(
      n,
      ['噓——小聲點。', `我是${n}。那隻大傢伙是「迷霧史萊姆王子」，牠一直守在這裡，我已經被困了一整天。`, '牠蓄力的時候地上會出現紅圈，千萬別站在裡面！'],
      [
        {
          label: '一起打倒牠',
          desc: '挑戰精英怪「迷霧史萊姆王子」',
          run: () => {
            joined(c)
            const at = EVENT_SPOTS.forest
            spawnEnemy({ name: '迷霧史萊姆王子', color: '#8a7bd8', x: at.x + 3.5, z: at.z + 1, level: lv + 1, tier: 'elite', tag: 'ev_forest' })
            ambush('ev_forest', { x: at.x + 3.5, z: at.z + 1 }, 2, lv - 1)
            pending.ev_forest = () => say(n, ['我們……真的贏了！', '有你在我就安心多了。接下來的路，讓我跟著你吧。'])
          },
        },
        leave,
      ],
    )
  }
  say(
    n,
    [`啊，有人來了。我是${n}，正在研究這座古代石環。`, '石環中央的祭壇封印著史萊姆王。最近封印越來越弱，草原上的史萊姆才會變多。', '我一個人沒辦法處理……如果你們願意幫忙，我可以一起去。'],
    [
      {
        label: '邀請同行',
        desc: `${n}加入隊伍`,
        run: () => {
          joined(c)
          say(n, ['太好了！人到齊了我們就去祭壇，把封印的源頭徹底解決。'])
        },
      },
      leave,
    ],
  )
}

function openChest(id: string) {
  const def = CHESTS.find((c) => c.id === id)
  if (!def || story().chests.includes(id)) return
  const tier = CHESTS.indexOf(def) // 草原 → 森林 → 石環，獎勵越來越好
  const quality = (tier + 1) as Quality
  const item = makeItem(tier === 1 ? 'armor' : 'weapon', hero().level + 1, quality, heroClass())
  if (!addItem(item)) return useGame.getState().showToast('背包已滿，整理後再來開寶箱')
  const gold = 30 + tier * 40
  story().chests.push(id)
  progress.gold += gold
  progress.potions += 2
  pillar(def.x, def.z, '#ffe27a', 0.8, 4, 0.8)
  burst(def.x, 0.6, def.z, '#ffe27a', 30, 4.5, { up: 7, gravity: 8, life: 1 })
  flash(def.x, 0.7, def.z, '#ffffff', 1.6, 0.25)
  addFloater(def, '寶箱！', '#ffe27a', true, 1.8)
  addFeed(`寶箱：${item.name}、${gold} 金幣、藥水 ×2`, '#b8860b')
  sfx.levelUp()
  useGame.getState().saveGame()
}

function useAltar() {
  const s = story()
  if (bossAlive()) return
  if (storyReached('done')) {
    const b = combat.units.find((u) => u.area === 'ab_ruins')
    const state = !b
      ? '祭壇的光芒正在慢慢凝聚……'
      : b.alive
        ? '石像已經甦醒，守在祭壇中央。'
        : `石像正在沉睡，約 ${Math.max(1, Math.ceil(b.respawnTime - b.deadTime))} 秒後會再次甦醒。`
    return say('石環祭壇', ['封印已經解除，祭壇靜靜地散發著溫暖的光。', `${state}史萊姆王每隔一段時間就會重生，可以反覆挑戰來收集裝備。`])
  }
  if (partySize() < 4 || s.step !== 'boss') {
    return say('石環祭壇', ['祭壇上刻著四個職業的徽記：弓、杖、劍、聖印。', `看來需要四人到齊才能啟動。（目前 ${partySize()}/4）`])
  }
  say(
    '石環祭壇',
    ['四個徽記同時亮了起來，地面開始震動……', '啟動祭壇就會喚醒史萊姆王。牠的重擊範圍很大，看到紅圈請立刻離開。'],
    [
      {
        label: '啟動祭壇',
        desc: '挑戰 Boss「史萊姆王」',
        run: () => {
          spawnEnemy({ name: '史萊姆王', color: '#b06bff', x: RUINS.x, z: RUINS.z - 2.5, level: hero().level + 1, tier: 'boss', tag: 'boss' })
          ring(RUINS.x, RUINS.z, '#b06bff', 0.5, RUINS.r, 0.8)
          pillar(RUINS.x, RUINS.z, '#b06bff', 1.6, 8, 1)
          shake(0.5)
          sfx.ultimate()
          addFeed('史萊姆王甦醒了！', '#a96bf0')
          pending.boss = () => {
            setStep('done', '第一章完成！')
            useGame.getState().setChapterDone(1)
          }
        },
      },
      { label: '還沒準備好', run: () => {} },
    ],
  )
}

/** 放下東側吊橋：打通古代石環 ↔ 星晶林的捷徑（會存檔） */
function lowerBridge() {
  if (!unlock('east_bridge')) return
  sfx.taunt()
  shake(0.3)
  addFeed('吊橋放下了！古代石環與星晶林之間打通了捷徑', '#3f9a6a')
  useGame.getState().showToast('捷徑開通：東側吊橋')
  useGame.getState().saveGame()
}

/** 與指定物件互動（由 F 鍵或點擊觸發） */
export function interactWith(id: string) {
  const it = interactables().find((i) => i.id === id)
  if (!it) return
  if (it.kind === 'elder') talkElder()
  else if (it.kind === 'merchant') talkMerchant()
  else if (it.kind === 'companion') talkCompanion(it.classId!)
  else if (it.kind === 'chest') openChest(it.id)
  else if (it.kind === 'stele') readStele()
  else if (it.kind === 'grove') touchGrove()
  else if (it.kind === 'spring') useSpring()
  else if (it.kind === 'lever') lowerBridge()
  else if (it.kind === 'notice') say('告示牌', ['「吊橋已收起。」', '絞盤在河的對岸。從月光山谷那一側過來，就能把橋放下。'])
  else useAltar()
}

/** F 鍵：推進對話，或與最近的物件互動 */
export function interactNearest() {
  const g = useGame.getState()
  if (g.phase !== 'playing' || g.paused) return
  if (g.dialog) return g.advanceDialog()
  if (runtime.nearId) interactWith(runtime.nearId)
}

/** 怪物被擊敗時呼叫：推進教學任務、檢查事件怪物是否全滅 */
export function storyOnKill(e: Unit) {
  const s = story()
  // 只算草原上的普通史萊姆（哥布林、事件怪物、首領都不算）
  if (s.step === 'hunt' && e.species === 'slime' && e.tier === 'normal' && !e.tag) {
    s.huntKills++
    if (s.huntKills >= HUNT_GOAL) setStep('recruit', '尋找夥伴——草原東側傳來求救聲')
  }
  // 第二章淨化山谷：幼狼與蘑菇各打倒 C2_HUNT_GOAL 隻
  if (s.step === 'c2_hunt' && (e.species === 'wolf' || e.species === 'mushroom')) {
    if (e.species === 'wolf') s.c2Wolf = Math.min(C2_HUNT_GOAL, s.c2Wolf + 1)
    else s.c2Shroom = Math.min(C2_HUNT_GOAL, s.c2Shroom + 1)
    if (s.c2Wolf >= C2_HUNT_GOAL && s.c2Shroom >= C2_HUNT_GOAL) setStep('c2_crystal', '前往山谷東側的星晶林，調查發光的星晶簇')
  }
  if (e.tag && pending[e.tag] && !combat.units.some((u) => u.tag === e.tag && u.alive)) {
    const done = pending[e.tag]
    delete pending[e.tag]
    done()
  }
}

// 回到標題（之後開新局或讀檔）時清掉進行中的事件，避免舊事件的後續被觸發
useGame.subscribe((s, prev) => {
  if (s.phase === 'title' && prev.phase !== 'title') for (const k of Object.keys(pending)) delete pending[k]
})

export interface QuestInfo {
  title: string
  lines: string[]
}
/** HUD 任務欄的文字 */
export function questInfo(): QuestInfo {
  const s = story()
  switch (s.step) {
    case 'talk':
      return { title: '初來乍到', lines: [`與${NPC_ELDER.name}交談（${REGION_NAME.village}中央，頭上有 ! 標記）`] }
    case 'hunt':
      return { title: '草原的考驗', lines: [`打倒史萊姆 ${s.huntKills}/${HUNT_GOAL}（村子南邊的草原）`] }
    case 'recruit':
      return {
        title: `尋找夥伴 ${progress.recruited.length}/3`,
        lines: companions()
          .map((c, i) => (progress.recruited.includes(c) ? null : SPOT_HINT[i]))
          .filter((x): x is string => !!x),
      }
    case 'boss':
      return {
        title: '封印的源頭',
        lines: [bossAlive() ? '擊敗史萊姆王！看到紅圈立刻離開' : '前往東北方的古代石環，調查中央的祭壇'],
      }
    case 'done':
      return { title: '第一章 完成', lines: [`回${REGION_NAME.village}向${NPC_ELDER.name}報告（頭上有 ! 標記）`, '區域首領會定期重生，可以反覆挑戰刷裝備'] }
    case 'c2_scout':
      return { title: '第二章　月光山谷', lines: ['從村子廣場往北穿過林帶，調查山谷入口的月光石碑'] }
    case 'c2_hunt':
      return {
        title: '淨化山谷',
        lines: [`月影幼狼 ${s.c2Wolf}/${C2_HUNT_GOAL}、孢子蘑菇 ${s.c2Shroom}/${C2_HUNT_GOAL}`, '幼狼會撲擊，蘑菇的綠色毒霧要快點離開'],
      }
    case 'c2_crystal':
      return { title: '侵蝕的源頭', lines: [tagAlive('ev_grove') ? '擊敗星晶魔靈・核！紅圈落下前移開' : '前往山谷東側的星晶林，調查中央的星晶簇'] }
    case 'c2_boss':
      return {
        title: '月泉的守護者',
        lines: [tagAlive('boss2') ? '擊敗苔蘚靈鹿！牠詠唱治療時用暈眩技能打斷' : '帶著月之碎片前往山谷深處的月泉'],
      }
    default:
      return { title: '第二章 完成', lines: ['自由探索，繼續升級與收集裝備', '各地的區域首領會定期重生，可以反覆挑戰刷裝備'] }
  }
}
