// 選單面板：隊伍（能力值）、背包（裝備）、技能樹（配點）。開啟時遊戲暫停。
import { useState } from 'react'
import { CLASSES, MAX_LEVEL, type ClassId } from '../data/classes'
import { QUALITIES, SLOTS, SLOT_NAME, describeStats, itemScore, type Item } from '../data/items'
import { BRANCH_NAMES, TREES, nodeText, type TreeNode } from '../data/skilltree'
import { combat, refreshParty } from '../game/combat/state'
import {
  BAG_LIMIT,
  addRank,
  canEquip,
  computeStats,
  equip,
  equippedBy,
  equippedItem,
  expToNext,
  nodeBlock,
  pointsLeft,
  progress,
  resetTree,
  sellItem,
  unequip,
} from '../game/progress'
import { useGame, type MenuTab } from '../game/store'

const TABS: { id: MenuTab; label: string; key: string }[] = [
  { id: 'party', label: '隊伍', key: 'P' },
  { id: 'bag', label: '背包', key: 'I' },
  { id: 'tree', label: '技能樹', key: 'K' },
]

function ItemChip({ item }: { item: Item }) {
  const q = QUALITIES[item.quality]
  return (
    <span className="item-name" style={{ color: q.color }}>
      {item.name}
    </span>
  )
}

function PartyTab({ classId }: { classId: ClassId }) {
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
    <div className="menu-body">
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
              　MP {sk.mp} · 冷卻 {Math.max(1, sk.cooldown - s.mods.cooldown[i])} 秒
              {s.mods.power[i] > 1 ? ` · 威力 +${Math.round((s.mods.power[i] - 1) * 100)}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BagTab({ classId, onChange }: { classId: ClassId; onChange: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const items = [...progress.inventory].sort((a, b) => b.quality - a.quality || itemScore(b) - itemScore(a))
  const sel = items.find((i) => i.uid === selected)
  const owner = sel ? equippedBy(sel.uid) : undefined
  const current = sel ? equippedItem(classId, sel.slot) : undefined
  const diff = sel && current && current.uid !== sel.uid ? Math.round(itemScore(sel) - itemScore(current)) : null
  const act = (fn: () => void) => {
    fn()
    onChange()
  }

  return (
    <div className="menu-body">
      <div className="menu-col wide">
        <h3>
          背包 <small>{items.length} / {BAG_LIMIT}　金幣 {progress.gold}　藥水 {progress.potions}</small>
        </h3>
        {items.length === 0 && <p className="muted">還沒有裝備。打倒史萊姆有機會掉落，走過去就能撿起來。</p>}
        {items.length > 0 &&
          SLOTS.map((slot) => {
            const group = items.filter((it) => it.slot === slot)
            return (
              <section key={slot} className="bag-group">
                <h4>
                  {SLOT_NAME[slot]} <small>{group.length}</small>
                </h4>
                {group.length === 0 ? (
                  <p className="muted small">沒有{SLOT_NAME[slot]}</p>
                ) : (
                  <div className="bag-grid">
                    {group.map((it) => {
                      const by = equippedBy(it.uid)
                      return (
                        <button
                          key={it.uid}
                          className={'bag-item' + (it.uid === selected ? ' on' : '') + (canEquip(classId, it) ? '' : ' dim')}
                          style={{ borderColor: QUALITIES[it.quality].color }}
                          onClick={() => setSelected(it.uid)}
                        >
                          <ItemChip item={it} />
                          <span className="item-stats">{describeStats(it.stats)}</span>
                          {by && <span className="worn">{CLASSES[by].name}裝備中</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
      </div>
      <div className="menu-col">
        <h3>{CLASSES[classId].name}的裝備</h3>
        {SLOTS.map((slot) => {
          const it = equippedItem(classId, slot)
          return (
            <div key={slot} className="equip-row">
              <span className="slot-tag">{SLOT_NAME[slot]}</span>
              {it ? (
                <>
                  <div>
                    <ItemChip item={it} />
                    <div className="item-stats">{describeStats(it.stats)}</div>
                  </div>
                  <button className="mini" onClick={() => act(() => unequip(classId, slot))}>
                    卸下
                  </button>
                </>
              ) : (
                <span className="muted">未裝備</span>
              )}
            </div>
          )
        })}
        {sel && (
          <div className="item-detail" style={{ borderColor: QUALITIES[sel.quality].color }}>
            <ItemChip item={sel} />
            <div className="muted">
              {QUALITIES[sel.quality].name} · {SLOT_NAME[sel.slot]} · LV.{sel.level}
              {sel.classId ? ` · ${CLASSES[sel.classId].name}專用` : ''}
            </div>
            <div className="item-stats">{describeStats(sel.stats)}</div>
            {diff !== null && (
              <div className={diff >= 0 ? 'up' : 'down'}>
                與目前裝備相比：{diff >= 0 ? '+' : ''}
                {diff}
              </div>
            )}
            <div className="detail-actions">
              {owner === classId ? (
                <button className="btn" onClick={() => act(() => unequip(classId, sel.slot))}>
                  卸下
                </button>
              ) : canEquip(classId, sel) ? (
                <button className="btn-primary small" onClick={() => act(() => equip(classId, sel))}>
                  裝備給{CLASSES[classId].name}
                </button>
              ) : (
                <span className="muted">此職業無法使用，請切換上方角色</span>
              )}
              {!owner && (
                <button
                  className="btn"
                  onClick={() =>
                    act(() => {
                      sellItem(sel.uid)
                      setSelected(null)
                    })
                  }
                >
                  賣出
                </button>
              )}
            </div>
          </div>
        )}
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
  if (!tab) return null

  const party = combat.units.filter((u) => u.team === 'party')
  // 配點或換裝後：重算戰鬥中的能力值、更新武器外觀、重繪面板
  const onChange = () => {
    refreshParty()
    bumpGear()
    force((n) => n + 1)
  }

  return (
    <div className="overlay">
      <div className="panel menu">
        <div className="menu-top">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => t.id !== tab && openMenu(t.id)}>
                {t.label} <kbd>{t.key}</kbd>
              </button>
            ))}
          </div>
          <button className="btn" onClick={closeMenu}>
            關閉 <kbd>Esc</kbd>
          </button>
        </div>
        <div className="members">
          {party.map((u) => {
            const c = CLASSES[u.classId!]
            const pts = pointsLeft(u.classId!)
            return (
              <button key={u.id} className={u.classId === member ? 'on' : ''} onClick={() => setMember(u.classId!)}>
                <span className="class-dot" style={{ background: c.colors.primary, borderColor: c.colors.accent }} />
                {u.name}
                <small>
                  {c.name} LV.{progress.members[u.classId!].level}
                </small>
                {pts > 0 && <i className="badge">{pts}</i>}
              </button>
            )
          })}
        </div>
        {tab === 'party' && <PartyTab classId={member} />}
        {tab === 'bag' && <BagTab classId={member} onChange={onChange} />}
        {tab === 'tree' && <TreeTab classId={member} onChange={onChange} />}
      </div>
    </div>
  )
}
