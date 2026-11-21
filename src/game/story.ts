// 第一章劇情：任務進度、可互動物件（村長、商人、待招募夥伴、寶箱、祭壇）與事件流程。
import { CLASSES, type ClassId } from '../data/classes'
import { makeItem, type Quality } from '../data/items'
import { CHESTS, EVENT_SPOTS, MERCHANT, NPC_ELDER, REGION_NAME, RUINS } from '../data/world'
import { sfx } from '../systems/sfx'
import { burst, flash, pillar, ring, shake } from './combat/fx'
import { addFeed, addFloater, combat, companionClasses, hero, partySize, recruitAlly, spawnEnemy } from './combat/state'
import type { Unit } from './combat/types'
import { HUNT_GOAL, addItem, progress } from './progress'
import { runtime } from './runtime'
import { useGame, type Choice } from './store'

export type InteractKind = 'elder' | 'merchant' | 'companion' | 'chest' | 'altar'
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
    { id: 'elder', kind: 'elder', ...NPC_ELDER, verb: '交談', marker: s.step === 'talk' },
    { id: 'merchant', kind: 'merchant', ...MERCHANT, verb: '交談', marker: false },
    { id: 'altar', kind: 'altar', x: RUINS.x, z: RUINS.z, facing: 0, name: '石環祭壇', verb: '調查', marker: s.step === 'boss' && !bossAlive() },
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
  for (const c of CHESTS) {
    if (!s.chests.includes(c.id)) {
      list.push({ id: c.id, kind: 'chest', x: c.x, z: c.z, facing: c.rot, name: '寶箱', verb: '開啟', marker: false })
    }
  }
  return list
}

const bossAlive = () => combat.units.some((u) => u.tag === 'boss' && u.alive)

/** 區域首領何時開始定期重生：森林精英在救出森林夥伴之後，石環 Boss 在第一章完成之後 */
export function areaBossUnlocked(id: string) {
  if (id === 'ab_ruins') return story().step === 'done'
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
  say(name, ['你們打倒了史萊姆王！星光村會永遠記得你們。', '前方還有更遼闊的世界——水晶洞窟、古代遺跡、天空神殿，那會是下一段旅程了。'])
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
  if (s.step === 'done') {
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
            useGame.getState().setChapterDone(true)
          }
        },
      },
      { label: '還沒準備好', run: () => {} },
    ],
  )
}

/** 與指定物件互動（由 F 鍵或點擊觸發） */
export function interactWith(id: string) {
  const it = interactables().find((i) => i.id === id)
  if (!it) return
  if (it.kind === 'elder') talkElder()
  else if (it.kind === 'merchant') talkMerchant()
  else if (it.kind === 'companion') talkCompanion(it.classId!)
  else if (it.kind === 'chest') openChest(it.id)
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
    default:
      return { title: '第一章 完成', lines: ['自由探索，繼續升級與收集裝備', '區域首領會定期重生，可以反覆挑戰刷裝備'] }
  }
}
