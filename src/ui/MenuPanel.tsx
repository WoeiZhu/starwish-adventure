// 選單：隊伍（能力值）、背包（裝備）、技能樹（配點）。開啟時遊戲暫停。
// 手機近乎全螢幕（避開瀏海、用 100dvh）；電腦是置中的大面板。關閉鈕固定在右上角。
import { useEffect, useState } from 'react'
import { isTouch } from '../systems/mobile'
import { BagTab } from './menu/BagTab'
import { MapTab } from './menu/MapTab'
import { Avatar } from './menu/icons'
import { CLASSES, MAX_ACTIVE, MAX_LEVEL, type ClassId } from '../data/classes'
import { QUALITIES, SLOTS, SLOT_NAME, describeStats, type Item } from '../data/items'
import { BRANCH_NAMES, TREES, nodeText, type TreeNode } from '../data/skilltree'
import { activeCompanions, combat, refreshParty, setActiveCompanions } from '../game/combat/state'
import {
  addRank,
  computeStats,
  equippedItem,
  expToNext,
  freshItems,
  nodeBlock,
  pointsLeft,
  progress,
  upgradeCount,
  resetTree,
} from '../game/progress'
import { useGame, type MenuTab } from '../game/store'

const TABS: { id: MenuTab; label: string; key: string }[] = [
  { id: 'party', label: '隊伍', key: 'P' },
  { id: 'bag', label: '背包', key: 'I' },
  { id: 'tree', label: '技能樹', key: 'K' },
  { id: 'map', label: '地圖', key: 'M' },
]

function ItemChip({ item }: { item: Item }) {
  const q = QUALITIES[item.quality]
  return (
    <span className="item-name" style={{ color: q.color }}>
      {item.name}
    </span>
  )
}

/** 出戰名單：招募的隊友裡選最多 3 位出戰；休息的不上場、不拿經驗 */
function Squad({ onChange }: { onChange: () => void }) {
  const recruited = progress.recruited
  if (!recruited.length) return null
  const active = activeCompanions()
  const g = useGame.getState()
  const toggle = (c: ClassId) => {
    const next = active.includes(c) ? active.filter((x) => x !== c) : [...active, c]
    if (next.length > MAX_ACTIVE) return g.showToast(`最多 ${MAX_ACTIVE} 位隊友出戰，先讓一位休息`)
    const err = setActiveCompanions(next)
    if (err) return g.showToast(err)
    g.partyChanged()
    g.saveGame()
    onChange()
  }
  return (
    <section className="squad" aria-label="出戰名單">
      <h3>
        出戰名單 {active.length}/{MAX_ACTIVE}
        <small>點一下切換出戰／休息。休息中的隊友不會獲得經驗</small>
      </h3>
      <div className="squad-list">
        {recruited.map((c) => {
          const on = active.includes(c)
          return (
            <button key={c} className={'squad-card' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(c)}>
              <Avatar classId={c} level={progress.members[c].level} size={36} />
              <span className="ms-member-text">
                <b>{CLASSES[c].companion}</b>
                <small>{CLASSES[c].name}</small>
              </span>
              <span className="squad-state">{on ? '出戰' : '休息'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function PartyTab({ classId, onChange }: { classId: ClassId; onChange: () => void }) {
  const c = CLASSES[classId]
  const m = progress.members[classId]
  const s = computeStats(classId)
  const need = expToNext(m.level)
  const rows: [string, string][] = [
    ['生命', String(s.maxHp)],
    ['魔力', String(s.maxMp)],
    ['攻擊', String(s.atk)],
    ['防禦', String(s.def)],
    ['暴擊率', `${Math.round(s.crit * 100)}%`],
    ['攻擊間隔', `${s.interval.toFixed(2)} 秒`],
    ['射程', String(c.attack.range)],
  ]
  return (
    <div className="menu-body party-wrap">
      <Squad onChange={onChange} />
      <div className="party-cols">
      <div className="menu-col">
        <h3>
          {c.name} <small>{c.role}</small>
        </h3>
        <div className="exp-row">
          <span>LV.{m.level}</span>
          <div className="bar exp">
            <div className="bar-fill" style={{ width: m.level >= MAX_LEVEL ? '100%' : `${(m.exp / need) * 100}%` }} />
          </div>
          <span>{m.level >= MAX_LEVEL ? '已滿級' : `${Math.floor(m.exp)} / ${need}`}</span>
        </div>
        <dl className="stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="menu-col">
        <h3>裝備</h3>
        {SLOTS.map((slot) => {
          const it = equippedItem(classId, slot)
          return (
            <div key={slot} className="equip-row">
              <span className="slot-tag">{SLOT_NAME[slot]}</span>
              {it ? (
                <div>
                  <ItemChip item={it} />
                  <div className="item-stats">{describeStats(it.stats)}</div>
                </div>
              ) : (
                <span className="muted">未裝備</span>
              )}
            </div>
          )
        })}
        <h3>技能</h3>
        {c.skills.map((sk, i) => (
          <div key={sk.id} className="skill-row">
            <kbd>{i + 1}</kbd> {sk.name}
            <span className="muted">
              　MP {sk.mp} · 冷卻 {Math.round(Math.max(1, sk.cooldown * 0.3, sk.cooldown - s.mods.cooldown[i]) * 10) / 10} 秒
              {s.mods.power[i] > 1 ? ` · 威力 +${Math.round((s.mods.power[i] - 1) * 100)}%` : ''}
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

function TreeTab({ classId, onChange }: { classId: ClassId; onChange: () => void }) {
  const m = progress.members[classId]
  const left = pointsLeft(classId)
  const nodes = TREES[classId]
  const node = (n: TreeNode) => {
    const rank = m.nodes[n.id] ?? 0
    const block = nodeBlock(classId, n)
    return (
      <button
        key={n.id}
        className={'node' + (rank > 0 ? ' learned' : '') + (block ? ' blocked' : ' open')}
        disabled={!!block}
        onClick={() => {
          if (addRank(classId, n)) onChange()
        }}
      >
        <span className="node-name">
          {n.name}
          <b>
            {rank}/{n.maxRank}
          </b>
        </span>
        <span className="node-desc">{nodeText(n, rank)}</span>
        {block && rank < n.maxRank && <span className="node-block">{block}</span>}
      </button>
    )
  }
  return (
    <div className="menu-body tree">
      <div className="tree-head">
        <span>
          可用技能點 <b className={left > 0 ? 'pts' : ''}>{left}</b>　每升一級獲得 1 點
        </span>
        <button
          className="btn"
          onClick={() => {
            resetTree(classId)
            onChange()
          }}
        >
          重置技能（免費）
        </button>
      </div>
      <div className="tree-grid">
        {BRANCH_NAMES.map((name, b) => (
          <div key={name} className="branch">
            <h3>{name}</h3>
            {nodes.filter((n) => n.branch === b).map(node)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MenuPanel() {
  const tab = useGame((s) => s.menu)
  const openMenu = useGame((s) => s.openMenu)
  const closeMenu = useGame((s) => s.closeMenu)
  const bumpGear = useGame((s) => s.bumpGear)
  const heroClass = useGame((s) => s.hero.classId)
  const [member, setMember] = useState<ClassId>(heroClass)
  const [, force] = useState(0)
  useEffect(() => {
    if (!tab) return
    document.documentElement.classList.add('menu-open')
    return () => document.documentElement.classList.remove('menu-open')
  }, [tab])
  if (!tab) return null

  // 出戰中的隊伍（主角＋出戰隊友）；名單另外加上休息中的隊友（也能配點、換裝）
  const party = [heroClass, ...activeCompanions()]
  const roster = [...party, ...progress.bench]
  const heroName = combat.units[0]?.name ?? ''
  // 配點或換裝後：重算戰鬥中的能力值、更新武器外觀、重繪面板
  const onChange = () => {
    refreshParty()
    bumpGear()
    force((n) => n + 1)
  }
  const points = roster.reduce((n, c) => n + pointsLeft(c), 0)
  const fresh = progress.inventory.filter((i) => freshItems.has(i.uid)).length
  // 背包紅點：有更好的裝備就顯示件數，否則顯示新撿到的件數
  const ups = upgradeCount(roster)
  const badge = (id: MenuTab) => (id === 'tree' ? points : id === 'bag' ? ups || fresh : 0)

  return (
    <div
      className="ms-back"
      // 選單開著時，手勢不要穿透到後面的遊戲
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className={`ms ms-${tab}`} role="dialog" aria-modal="true" aria-label="選單">
        <header className="ms-head">
          <nav className="ms-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={t.id === tab}
                className={'ms-tab' + (t.id === tab ? ' on' : '')}
                onClick={() => t.id !== tab && openMenu(t.id)}
              >
                {t.label}
                {!isTouch && <kbd>{t.key}</kbd>}
                {badge(t.id) > 0 && <i className="badge">{badge(t.id)}</i>}
              </button>
            ))}
          </nav>
          <div className="ms-members" role="tablist" aria-label="隊伍成員">
            {roster.map((c) => {
              const pts = pointsLeft(c)
              const name = c === heroClass ? heroName : CLASSES[c].companion
              const rest = progress.bench.includes(c)
              return (
                <button
                  key={c}
                  role="tab"
                  aria-selected={c === member}
                  className={'ms-member' + (c === member ? ' on' : '') + (rest ? ' rest' : '')}
                  onClick={() => setMember(c)}
                  aria-label={`${name}，${CLASSES[c].name} LV.${progress.members[c].level}${rest ? '，休息中' : ''}`}
                >
                  <Avatar classId={c} level={progress.members[c].level} size={38} />
                  <span className="ms-member-text">
                    <b>{name}</b>
                    <small>{CLASSES[c].name}{rest ? '・休息' : ''}</small>
                  </span>
                  {pts > 0 && <i className="badge">{pts}</i>}
                </button>
              )
            })}
          </div>
          <div className="ms-gold" aria-label="金幣">
            <span className="coin" aria-hidden />
            {progress.gold}
          </div>
          <button className="x-btn ms-x" onClick={closeMenu} aria-label="關閉選單">
            ✕{!isTouch && <kbd>Esc</kbd>}
          </button>
        </header>
        <main className="ms-body">
          {tab === 'party' && <PartyTab classId={member} onChange={onChange} />}
          {tab === 'bag' && <BagTab classId={member} party={party} onChange={onChange} />}
          {tab === 'tree' && <TreeTab classId={member} onChange={onChange} />}
          {tab === 'map' && <MapTab />}
        </main>
      </div>
    </div>
  )
}
