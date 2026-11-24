// 背包：正方形圖示格子、稀有度邊框、分類／職業篩選／排序、裝備詳情與前後比較、一鍵最佳裝備。
// 電腦：角色｜背包｜詳情 三欄；平板與手機：角色＋背包，點裝備後用彈出面板（直拿是下方抽屜、橫拿是右側面板）。
import { useEffect, useState, type ReactNode } from 'react'
import { CLASSES, CLASS_ORDER, type ClassId } from '../../data/classes'
import { QUALITIES, SLOTS, SLOT_NAME, itemScore, type Item, type ItemStats, type Slot } from '../../data/items'
import { usePotion } from '../../game/combat/rewards'
import {
  BAG_LIMIT,
  POTION_HEAL,
  canEquip,
  computeStats,
  equip,
  equipBest,
  equipBestParty,
  equippedBy,
  equippedItem,
  freshItems,
  progress,
  sellItem,
  sellPrice,
  statsIfEquipped,
  unequip,
  type DerivedStats,
} from '../../game/progress'
import { ClassIcon, ItemIcon, PotionIcon, SlotGhost } from './icons'
import { MQ, useMedia } from './useMedia'

type Cat = 'all' | Slot | 'consumable'
type SortKey = 'quality' | 'score' | 'level' | 'new'
const CATS: { id: Cat; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '防具' },
  { id: 'accessory', label: '飾品' },
  { id: 'consumable', label: '消耗品' },
]
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'quality', label: '依品質' },
  { id: 'score', label: '依戰力' },
  { id: 'level', label: '依等級' },
  { id: 'new', label: '最新取得' },
]
const POTION = 'potion'

const STAT_ROWS: { key: keyof ItemStats; label: string; pct?: boolean }[] = [
  { key: 'atk', label: '攻擊' },
  { key: 'def', label: '防禦' },
  { key: 'hp', label: '生命' },
  { key: 'mp', label: '魔力' },
  { key: 'crit', label: '暴擊', pct: true },
]
const DERIVED_ROWS: { key: keyof Omit<DerivedStats, 'mods' | 'interval'>; label: string; pct?: boolean }[] = [
  { key: 'maxHp', label: '生命' },
  { key: 'maxMp', label: '魔力' },
  { key: 'atk', label: '攻擊' },
  { key: 'def', label: '防禦' },
  { key: 'crit', label: '暴擊', pct: true },
]
const fmt = (v: number, pct?: boolean) => (pct ? `${Math.round(v * 100)}%` : String(Math.round(v * 10) / 10))
const signed = (v: number, pct?: boolean) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), pct)

/** 比目前這個角色身上的同部位更好（而且這個角色能用、沒人穿著） */
function isUpgrade(classId: ClassId, it: Item) {
  if (!canEquip(classId, it) || equippedBy(it.uid)) return false
  const cur = equippedItem(classId, it.slot)
  return !cur || itemScore(it) > itemScore(cur)
}

function sortItems(list: Item[], key: SortKey) {
  const order = new Map(progress.inventory.map((it, i) => [it.uid, i]))
  const by: Record<SortKey, (a: Item, b: Item) => number> = {
    quality: (a, b) => b.quality - a.quality || itemScore(b) - itemScore(a),
    score: (a, b) => itemScore(b) - itemScore(a),
    level: (a, b) => b.level - a.level || b.quality - a.quality,
    new: (a, b) => order.get(b.uid)! - order.get(a.uid)!,
  }
  return [...list].sort(by[key])
}

// ── 格子 ──
function Tile({
  item,
  on,
  dim,
  onClick,
}: {
  item: Item
  on: boolean
  dim: boolean
  onClick: () => void
}) {
  const owner = equippedBy(item.uid)
  return (
    <button
      className={`tile q${item.quality}${on ? ' on' : ''}${dim ? ' dim' : ''}`}
      onClick={onClick}
      aria-label={`${item.name}，${QUALITIES[item.quality].name}，LV.${item.level}`}
    >
      <ItemIcon item={item} />
      <span className="tile-lv">{item.level}</span>
      {owner && (
        <span className="tile-owner" style={{ background: CLASSES[owner].colors.primary }} title={`${CLASSES[owner].name}裝備中`}>
          <ClassIcon classId={owner} size={14} />
        </span>
      )}
      {freshItems.has(item.uid) && <span className="tile-new">NEW</span>}
      {isUpgradeFlag(item) && <span className="tile-up">▲</span>}
    </button>
  )
}
// Tile 需要知道目前選的角色；用模組變數避免一層層傳下去
let upgradeFor: ClassId = 'archer'
const isUpgradeFlag = (it: Item) => isUpgrade(upgradeFor, it)

// ── 左欄：角色裝備與能力值 ──
function HeroColumn({
  classId,
  party,
  onPick,
  onChange,
}: {
  classId: ClassId
  party: ClassId[]
  onPick: (it: Item | null, slot: Slot) => void
  onChange: () => void
}) {
  const s = computeStats(classId)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(''), 2600)
    return () => clearTimeout(id)
  }, [note])
  const say = (n: number, who: string) => setNote(n > 0 ? `${who}換上了 ${n} 件更好的裝備` : `${who}已經是最佳裝備`)
  return (
    <section className="bag-hero">
      <div className="bag-slots">
        {SLOTS.map((slot) => {
          const it = equippedItem(classId, slot)
          return (
            <button
              key={slot}
              className={'slot' + (it ? ` q${it.quality}` : ' empty')}
              onClick={() => onPick(it ?? null, slot)}
              aria-label={`${SLOT_NAME[slot]}：${it ? it.name : '未裝備'}`}
            >
              {it ? <ItemIcon item={it} /> : <SlotGhost slot={slot} />}
              <span className="slot-name">{SLOT_NAME[slot]}</span>
            </button>
          )
        })}
      </div>
      <dl className="bag-stats">
        {DERIVED_ROWS.map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{fmt(s[r.key], r.pct)}</dd>
          </div>
        ))}
      </dl>
      <div className="bag-best">
        <button
          className="m-btn"
          onClick={() => {
            say(equipBest(classId), CLASSES[classId].name)
            onChange()
          }}
        >
          一鍵最佳
        </button>
        <button
          className="m-btn"
          onClick={() => {
            say(equipBestParty(party), '全隊')
            onChange()
          }}
        >
          全隊最佳
        </button>
      </div>
      <p className="bag-note" aria-live="polite">
        {note}
      </p>
    </section>
  )
}

// ── 詳情：屬性、前後比較、動作按鈕 ──
function Compare({ classId, item }: { classId: ClassId; item: Item }) {
  const cur = equippedItem(classId, item.slot)
  const same = cur?.uid === item.uid
  if (!canEquip(classId, item))
    return (
      <dl className="cmp">
        {STAT_ROWS.filter((r) => item.stats[r.key]).map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>+{fmt(item.stats[r.key]!, r.pct)}</dd>
          </div>
        ))}
      </dl>
    )
  const keys = STAT_ROWS.filter((r) => item.stats[r.key] || cur?.stats[r.key])
  const before = computeStats(classId)
  const after = same ? before : statsIfEquipped(classId, item)
  const changed = DERIVED_ROWS.filter((r) => Math.abs(after[r.key] - before[r.key]) > 1e-6)
  return (
    <>
      <div className="cmp-head">
        <span>裝備屬性</span>
        <span>{same ? '' : cur ? `目前：${cur.name}` : '目前：未裝備'}</span>
      </div>
      <dl className="cmp">
        {keys.map((r) => {
          const a = cur?.stats[r.key] ?? 0
          const b = item.stats[r.key] ?? 0
          const d = b - a
          return (
            <div key={r.key}>
              <dt>{r.label}</dt>
              <dd>
                {!same && <span className="cmp-old">{fmt(a, r.pct)} →</span>}
                <b>{fmt(b, r.pct)}</b>
                {!same && d !== 0 && <em className={d > 0 ? 'up' : 'down'}>{signed(d, r.pct)}</em>}
              </dd>
            </div>
          )
        })}
      </dl>
      {!same && changed.length > 0 && (
        <>
          <div className="cmp-head">
            <span>{CLASSES[classId].name}換上後</span>
          </div>
          <dl className="cmp">
            {changed.map((r) => {
              const d = after[r.key] - before[r.key]
              return (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd>
                    <span className="cmp-old">{fmt(before[r.key], r.pct)} →</span>
                    <b>{fmt(after[r.key], r.pct)}</b>
                    <em className={d > 0 ? 'up' : 'down'}>{signed(d, r.pct)}</em>
                  </dd>
                </div>
              )
            })}
          </dl>
        </>
      )}
    </>
  )
}

function itemDetail({
  item,
  classId,
  party,
  onDone,
}: {
  item: Item
  classId: ClassId
  party: ClassId[]
  onDone: (closeDetail: boolean) => void
}) {
  const q = QUALITIES[item.quality]
  const owner = equippedBy(item.uid)
  const usable = canEquip(classId, item)
  const forClass = item.slot === 'weapon' ? item.classId : undefined
  const act = (fn: () => void, close = false) => () => {
    fn()
    onDone(close)
  }
  return {
    body: (
      <>
        <div className="det-top">
          <span className={`tile big q${item.quality}`}>
            <ItemIcon item={item} />
          </span>
          <div className="det-title">
            <h3 style={{ color: q.color }}>{item.name}</h3>
            <div className="det-tags">
              <span className={`tag q${item.quality}`}>{q.name}</span>
              <span className="tag">{SLOT_NAME[item.slot]}</span>
              <span className="tag">LV.{item.level}</span>
              {forClass && <span className="tag">{CLASSES[forClass].name}專用</span>}
            </div>
            {owner && <div className="det-owner">{CLASSES[owner].name}裝備中</div>}
          </div>
        </div>
        <Compare classId={classId} item={item} />
        {!usable && forClass && (
          <p className="det-hint">{CLASSES[classId].name}不能用這把武器{party.includes(forClass) ? '' : `；${CLASSES[forClass].name}還沒加入隊伍`}</p>
        )}
      </>
    ),
    actions: (
      <>
        {owner === classId ? (
          <button className="m-btn" onClick={act(() => unequip(classId, item.slot))}>
            卸下
          </button>
        ) : usable ? (
          <button className="m-btn primary" onClick={act(() => equip(classId, item), true)}>
            {owner ? `從${CLASSES[owner].name}換給${CLASSES[classId].name}` : `裝備給${CLASSES[classId].name}`}
          </button>
        ) : forClass && party.includes(forClass) && owner !== forClass ? (
          <button className="m-btn primary" onClick={act(() => equip(forClass, item), true)}>
            裝備給{CLASSES[forClass].name}
          </button>
        ) : null}
        {!owner && (
          <button className="m-btn" onClick={act(() => sellItem(item.uid), true)}>
            賣出 <small>+{sellPrice(item)} 金幣</small>
          </button>
        )}
      </>
    ),
  }
}

function usePotionDetail({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState('')
  return {
    body: (
      <>
        <div className="det-top">
          <span className="tile big q1">
            <PotionIcon />
          </span>
          <div className="det-title">
            <h3>回復藥水</h3>
            <div className="det-tags">
              <span className="tag">消耗品</span>
              <span className="tag">持有 {progress.potions}</span>
            </div>
          </div>
        </div>
        <p className="det-hint">喝下回復主角 {Math.round(POTION_HEAL * 100)}% 生命，冷卻 8 秒。戰鬥中也可以按技能列的藥水按鈕。</p>
        {msg && <p className="det-hint">{msg}</p>}
      </>
    ),
    actions: (
      <button
        className="m-btn primary"
        disabled={progress.potions <= 0}
        onClick={() => {
          setMsg(usePotion() ?? '已使用藥水')
          onDone()
        }}
      >
        使用
      </button>
    ),
  }
}

/** 手機／平板：點裝備後的彈出面板 */
function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="x-btn sheet-x" onClick={onClose} aria-label="關閉詳情">
          ✕
        </button>
        <div className="sheet-scroll">{children}</div>
        <div className="sheet-actions">{actions}</div>
      </div>
    </div>
  )
}

export function BagTab({ classId, party, onChange }: { classId: ClassId; party: ClassId[]; onChange: () => void }) {
  const desktop = useMedia(MQ.desktop)
  const [cat, setCat] = useState<Cat>('all')
  const [cls, setCls] = useState<ClassId | 'any'>('any')
  const [sort, setSort] = useState<SortKey>('quality')
  const [sel, setSel] = useState<string | null>(null)
  const [, force] = useState(0)
  upgradeFor = classId

  const select = (uid: string | null) => {
    if (uid) freshItems.delete(uid)
    setSel(uid)
  }
  const done = (close: boolean) => {
    if (close && !desktop) setSel(null)
    onChange()
    force((n) => n + 1)
  }

  const pool = progress.inventory.filter(
    (it) => (cat === 'all' || it.slot === cat) && (cls === 'any' || canEquip(cls, it)),
  )
  const items = cat === 'consumable' ? [] : sortItems(pool, sort)
  const showPotion = (cat === 'all' || cat === 'consumable') && progress.potions > 0
  const empties = cat === 'all' && cls === 'any' ? Math.max(0, BAG_LIMIT - progress.inventory.length) : 0
  const selItem = sel && sel !== POTION ? progress.inventory.find((i) => i.uid === sel) : undefined
  const counts = (c: Cat) =>
    c === 'all' ? progress.inventory.length : c === 'consumable' ? progress.potions : progress.inventory.filter((i) => i.slot === c).length

  const itemView = selItem ? itemDetail({ item: selItem, classId, party, onDone: done }) : null
  const potionDetail = usePotionDetail({ onDone: () => done(false) })
  const detail = sel === POTION ? potionDetail : itemView
  const detailTitle = sel === POTION ? '回復藥水' : (selItem?.name ?? '')

  return (
    <div className="bag">
      <HeroColumn
        classId={classId}
        party={party}
        onChange={() => done(false)}
        onPick={(it, slot) => {
          if (it) select(it.uid)
          else {
            setCat(slot)
            setSel(null)
          }
        }}
      />

      <section className="bag-main">
        <div className="bag-tools">
          <div className="chips" role="tablist" aria-label="分類">
            {CATS.map((c) => (
              <button key={c.id} role="tab" aria-selected={cat === c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
                {c.label}
                <small>{counts(c.id)}</small>
              </button>
            ))}
          </div>
          <div className="selects">
            <select aria-label="職業篩選" value={cls} onChange={(e) => setCls(e.target.value as ClassId | 'any')}>
              <option value="any">全部職業</option>
              {CLASS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CLASSES[c].name}可用
                </option>
              ))}
            </select>
            <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="bag-count">
              {progress.inventory.length}/{BAG_LIMIT}
            </span>
          </div>
        </div>
        <div className="bag-scroll">
          <div className="grid">
            {showPotion && (
              <button className={'tile q1' + (sel === POTION ? ' on' : '')} onClick={() => select(POTION)} aria-label={`回復藥水 ${progress.potions} 瓶`}>
                <PotionIcon />
                <span className="tile-count">×{progress.potions}</span>
              </button>
            )}
            {items.map((it) => (
              <Tile key={it.uid} item={it} on={it.uid === sel} dim={!canEquip(classId, it)} onClick={() => select(it.uid)} />
            ))}
            {Array.from({ length: empties }, (_, i) => (
              <span key={'e' + i} className="tile empty" aria-hidden />
            ))}
          </div>
          {items.length === 0 && !showPotion && (
            <p className="bag-empty">
              {progress.inventory.length === 0 ? '還沒有裝備。打倒怪物有機會掉落，走過去就能撿起來。' : '這個分類沒有東西。'}
            </p>
          )}
        </div>
      </section>

      {desktop ? (
        <section className="bag-detail">
          {detail ? (
            <>
              <div className="det-scroll">{detail.body}</div>
              <div className="det-actions">{detail.actions}</div>
            </>
          ) : (
            <p className="bag-empty">點選裝備查看詳情與比較</p>
          )}
        </section>
      ) : (
        detail && (
          <Sheet title={detailTitle} onClose={() => setSel(null)} actions={detail.actions}>
            {detail.body}
          </Sheet>
        )
      )}
    </div>
  )
}
