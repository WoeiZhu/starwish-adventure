// 賣東西：商店（武器店、雜貨店、野外商人）與背包的「賣東西」都開這個畫面。
// 每件東西標出「留著／可賣／低等級／待用」，可以一鍵標記、一鍵賣出；裝備中的不會出現在這裡。
import { useEffect, useMemo, useState } from 'react'
import { QUALITIES, SLOT_NAME, describeStats, type Item, type Slot } from '../data/items'
import { addFeed } from '../game/combat/state'
import { LOW_LEVEL_GAP, equippedBy, progress, sellAdvice, sellMany, sellPrice, type SellAdvice } from '../game/progress'
import { useGame } from '../game/store'
import { sfx } from '../systems/sfx'
import { isTouch } from '../systems/mobile'
import { ItemIcon } from './menu/icons'

type Cat = 'all' | Slot
const CATS: { id: Cat; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '防具' },
  { id: 'accessory', label: '飾品' },
]
/** 自動標記只動「稀有以下」；史詩、傳說要自己點 */
const AUTO_MAX_QUALITY = 2

interface Row {
  it: Item
  adv: SellAdvice
}

const tagOf = (a: SellAdvice) => (a.keep ? { t: '留著', c: 'keep' } : a.nobody ? { t: '待用', c: 'wait' } : { t: '可賣', c: 'junk' })
const reasonOf = (a: SellAdvice) =>
  [
    a.keep ? '隊上有人換上它會變強，建議留著。' : a.nobody ? '名單上還沒有人能用（例如還沒入隊職業的武器），先留著比較好。' : '能用的人都有更好的了，賣掉不可惜。',
    a.low ? `等級比隊伍最高等級低 ${LOW_LEVEL_GAP} 級以上。` : '',
  ].join('')

export function SellPanel() {
  const closeSell = useGame((s) => s.closeSell)
  const heroClass = useGame((s) => s.hero.classId)
  const [cat, setCat] = useState<Cat>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<string | null>(null)
  const [arm, setArm] = useState<'auto' | 'picked' | null>(null)
  const [msg, setMsg] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    document.documentElement.classList.add('menu-open')
    return () => document.documentElement.classList.remove('menu-open')
  }, [])
  // 「再按一次確認」過了 3 秒自動取消
  useEffect(() => {
    if (!arm) return
    const id = setTimeout(() => setArm(null), 3000)
    return () => clearTimeout(id)
  }, [arm])

  const roster = useMemo(() => [heroClass, ...progress.recruited], [heroClass, version])
  // 可賣的排前面，其次依等級低到高
  const rows: Row[] = useMemo(() => {
    void version
    const all = progress.inventory.filter((it) => !equippedBy(it.uid)).map((it): Row => ({ it, adv: sellAdvice(it, roster) }))
    const rank = (r: Row) => (r.adv.junk ? 0 : r.adv.nobody ? 1 : 2)
    return all.sort((a, b) => rank(a) - rank(b) || a.it.level - b.it.level || a.it.quality - b.it.quality)
  }, [roster, version])

  const shown = rows.filter((r) => cat === 'all' || r.it.slot === cat)
  const byUid = new Map(rows.map((r) => [r.it.uid, r]))
  const autoSet = rows.filter((r) => r.adv.junk && r.it.quality <= AUTO_MAX_QUALITY)
  const lowSet = rows.filter((r) => r.adv.low && !r.adv.keep && !r.adv.nobody && r.it.quality <= AUTO_MAX_QUALITY)
  const commonSet = rows.filter((r) => r.it.quality === 0 && !r.adv.keep && !r.adv.nobody)
  const pickedRows = [...picked].map((u) => byUid.get(u)).filter(Boolean) as Row[]
  const sum = (list: Row[]) => list.reduce((n, r) => n + sellPrice(r.it), 0)
  const risky = pickedRows.filter((r) => r.adv.keep || r.it.quality > AUTO_MAX_QUALITY).length
  const focusRow = focus ? byUid.get(focus) : undefined

  const mark = (list: Row[]) => {
    setArm(null)
    setPicked((p) => new Set([...p, ...list.map((r) => r.it.uid)]))
    setMsg(list.length ? `已標記 ${list.length} 件` : '沒有符合的東西')
  }
  const toggle = (uid: string) => {
    setArm(null)
    setFocus(uid)
    setPicked((p) => {
      const n = new Set(p)
      if (!n.delete(uid)) n.add(uid)
      return n
    })
  }
  const doSell = (list: Row[]) => {
    const r = sellMany(list.map((x) => x.it.uid))
    if (r.count > 0) {
      sfx.pickup(true)
      addFeed(`賣出 ${r.count} 件裝備（+${r.gold} 金幣）`, '#9a6b00')
      useGame.getState().saveGame()
    }
    setPicked(new Set())
    setFocus(null)
    setArm(null)
    setMsg(r.count > 0 ? `賣出 ${r.count} 件，獲得 ${r.gold} 金幣` : '沒有賣出任何東西')
    setVersion((v) => v + 1)
  }
  const press = (kind: 'auto' | 'picked', list: Row[]) => {
    if (list.length === 0) return
    if (arm === kind) return doSell(list)
    setArm(kind)
  }

  return (
    <div
      className="ms-back"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="ms sell" role="dialog" aria-modal="true" aria-label="賣東西">
        <header className="ms-head">
          <h2 className="sell-title">賣東西</h2>
          <span className="sell-gold" aria-live="polite">
            金幣 <b>{progress.gold}</b>
          </span>
          <button className="x-btn ms-x" onClick={closeSell} aria-label="關閉">
            ✕{!isTouch && <kbd>Esc</kbd>}
          </button>
        </header>

        <div className="sell-tools">
          <div className="chips" role="tablist" aria-label="分類">
            {CATS.map((c) => (
              <button key={c.id} role="tab" aria-selected={cat === c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
                {c.label}
                <small>{c.id === 'all' ? rows.length : rows.filter((r) => r.it.slot === c.id).length}</small>
              </button>
            ))}
          </div>
          <div className="chips sell-marks" aria-label="一鍵標記">
            <span className="sell-label">標記</span>
            <button className="chip" onClick={() => mark(autoSet)}>
              沒用的<small>{autoSet.length}</small>
            </button>
            <button className="chip" onClick={() => mark(lowSet)}>
              低等級<small>{lowSet.length}</small>
            </button>
            <button className="chip" onClick={() => mark(commonSet)}>
              普通品質<small>{commonSet.length}</small>
            </button>
            <button className="chip" onClick={() => (setPicked(new Set()), setArm(null), setMsg(''))} disabled={picked.size === 0}>
              取消標記
            </button>
          </div>
        </div>

        <div className="sell-scroll">
          <div className="grid">
            {shown.map(({ it, adv }) => {
              const tag = tagOf(adv)
              const on = picked.has(it.uid)
              return (
                <button
                  key={it.uid}
                  className={`tile q${it.quality} sell-tile ${tag.c}${on ? ' picked' : ''}${focus === it.uid ? ' on' : ''}`}
                  onClick={() => toggle(it.uid)}
                  aria-pressed={on}
                  aria-label={`${it.name}，${QUALITIES[it.quality].name}，LV.${it.level}，${tag.t}${adv.low ? '，低等級' : ''}，賣 ${sellPrice(it)} 金幣`}
                >
                  <ItemIcon item={it} />
                  <span className="tile-lv">{it.level}</span>
                  <span className={`sell-tag ${tag.c}`}>{tag.t}</span>
                  {adv.low && <span className="sell-low">低</span>}
                  {on && <span className="sell-check">✓</span>}
                </button>
              )
            })}
          </div>
          {shown.length === 0 && (
            <p className="bag-empty">{rows.length === 0 ? '背包裡沒有可以賣的裝備（裝備中的不能賣）。' : '這個分類沒有東西。'}</p>
          )}
        </div>

        <div className="sell-info" aria-live="polite">
          {focusRow ? (
            <>
              <b style={{ color: QUALITIES[focusRow.it.quality].color }}>{focusRow.it.name}</b>
              <span>
                {QUALITIES[focusRow.it.quality].name}・{SLOT_NAME[focusRow.it.slot]}・LV.{focusRow.it.level}・{describeStats(focusRow.it.stats)}・賣 {sellPrice(focusRow.it)} 金幣
              </span>
              <em>{reasonOf(focusRow.adv)}</em>
            </>
          ) : (
            <span>
              點一下東西就會勾選。<b className="t-keep">留著</b>＝有人用得到、<b className="t-junk">可賣</b>＝比身上和備品都差、<b className="t-low">低</b>＝等級偏低。史詩以上不會被自動標記。
            </span>
          )}
          {msg && <strong className="sell-msg">{msg}</strong>}
        </div>

        <footer className="sell-bar">
          <button className={'m-btn' + (arm === 'auto' ? ' danger' : '')} disabled={autoSet.length === 0} onClick={() => press('auto', autoSet)}>
            {arm === 'auto' ? '再按一次確認' : '一鍵賣出沒用的'}
            <small>
              {autoSet.length} 件・+{sum(autoSet)}
            </small>
          </button>
          <button
            className={'m-btn primary' + (arm === 'picked' ? ' danger' : '')}
            disabled={pickedRows.length === 0}
            onClick={() => press('picked', pickedRows)}
          >
            {arm === 'picked' ? (risky ? `含 ${risky} 件建議留著／高品質，確定賣出？` : '再按一次確認') : '賣出已勾選'}
            <small>
              {pickedRows.length} 件・+{sum(pickedRows)}
            </small>
          </button>
          <button className="m-btn" onClick={closeSell}>
            完成
          </button>
        </footer>
      </div>
    </div>
  )
}
