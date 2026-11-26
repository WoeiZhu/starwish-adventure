// 選單用的小圖示：全部是程式畫的 SVG（裝備、職業、藥水），顏色跟著品質走。
import type { ClassId } from '../../data/classes'
import { CLASSES } from '../../data/classes'
import { QUALITIES, type Item, type Slot } from '../../data/items'

const INK = '#4a3b52'
const S = { stroke: INK, strokeWidth: 2.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

type Kind = 'bow' | 'staff' | 'sword' | 'wand' | 'daggers' | 'flask' | 'armor' | 'ring' | 'amulet' | 'heart' | 'earring' | 'gem' | 'potion'

const WEAPON_KIND: Record<ClassId, Kind> = { archer: 'bow', mage: 'staff', knight: 'sword', cleric: 'wand', assassin: 'daggers', apothecary: 'flask' }

/** 飾品的外觀：依它加的屬性 */
function accessoryKind(item: Item): Kind {
  const s = item.stats
  if (s.atk) return 'ring'
  if (s.def) return 'amulet'
  if (s.hp) return 'heart'
  if (s.crit) return 'earring'
  return 'gem'
}

export function itemKind(item: Item): Kind {
  if (item.slot === 'weapon') return WEAPON_KIND[item.classId ?? 'archer']
  if (item.slot === 'armor') return 'armor'
  return accessoryKind(item)
}

function Shape({ kind, accent, light }: { kind: Kind; accent: string; light: string }) {
  switch (kind) {
    case 'bow':
      return (
        <>
          <path d="M14 6 Q38 24 14 42" fill="none" {...S} stroke={INK} strokeWidth={5} />
          <path d="M14 6 Q38 24 14 42" fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M14 6 L14 42" {...S} strokeWidth={1.6} />
          <path d="M8 24 L40 24" {...S} />
          <path d="M40 24 l-6 -4 m6 4 l-6 4" {...S} fill="none" />
          <path d="M8 24 l-3 -3 m3 3 l-3 3" {...S} fill="none" />
        </>
      )
    case 'staff':
      return (
        <>
          <path d="M16 44 L30 16" {...S} stroke={INK} strokeWidth={5.5} />
          <path d="M16 44 L30 16" stroke="#c98a55" strokeWidth={2.6} strokeLinecap="round" />
          <circle cx={32} cy={12} r={8} fill={accent} {...S} />
          <circle cx={29.5} cy={9.5} r={2.4} fill={light} />
          <path d="M22 16 q4 6 12 4" fill="none" {...S} strokeWidth={2} />
        </>
      )
    case 'sword':
      return (
        <>
          <path d="M33 6 L40 8 L22 30 L18 26 Z" fill={light} {...S} />
          <path d="M35.5 8.5 L21 27" stroke={accent} strokeWidth={2} strokeLinecap="round" />
          <path d="M12 22 L26 36" {...S} strokeWidth={5.5} />
          <path d="M12 22 L26 36" stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
          <path d="M17 31 L9 39" {...S} strokeWidth={5} />
          <path d="M17 31 L9 39" stroke="#c98a55" strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={8} cy={40} r={3} fill={accent} {...S} strokeWidth={2} />
        </>
      )
    case 'wand':
      return (
        <>
          <path d="M14 42 L27 22" {...S} strokeWidth={5.5} />
          <path d="M14 42 L27 22" stroke="#fff6dc" strokeWidth={2.6} strokeLinecap="round" />
          <path
            d="M31 6 L33.6 13 L41 13.4 L35.2 18 L37.4 25 L31 21 L24.6 25 L26.8 18 L21 13.4 L28.4 13 Z"
            fill={accent}
            {...S}
          />
          <circle cx={31} cy={16} r={2.2} fill={light} />
        </>
      )
    case 'daggers':
      // 交叉的兩把短刀
      return (
        <>
          <path d="M10 8 L14 6 L30 28 L27 31 Z" fill={light} {...S} />
          <path d="M38 8 L34 6 L18 28 L21 31 Z" fill={light} {...S} />
          <path d="M25 30 L33 38" {...S} strokeWidth={5} />
          <path d="M25 30 L33 38" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M23 30 L15 38" {...S} strokeWidth={5} />
          <path d="M23 30 L15 38" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={35} cy={40} r={2.6} fill={accent} {...S} strokeWidth={1.8} />
          <circle cx={13} cy={40} r={2.6} fill={accent} {...S} strokeWidth={1.8} />
        </>
      )
    case 'flask':
      // 圓底藥瓶，冒著泡泡
      return (
        <>
          <path d="M20 8 L28 8 L28 18 C36 21 39 27 39 32 C39 39 33 43 24 43 C15 43 9 39 9 32 C9 27 12 21 20 18 Z" fill="#fff" {...S} />
          <path d="M11.4 31 C16 28 32 34 36.6 31 C37 38 32 41 24 41 C16 41 11 38 11.4 31 Z" fill={accent} />
          <circle cx={20} cy={26} r={2} fill={light} stroke={INK} strokeWidth={1.2} />
          <circle cx={27} cy={22} r={1.4} fill={light} stroke={INK} strokeWidth={1.1} />
          <path d="M18 8 L30 8" {...S} strokeWidth={4} stroke="#c98a55" />
        </>
      )
    case 'armor':
      return (
        <>
          <path d="M16 8 L24 12 L32 8 L42 14 L38 22 L34 20 L34 42 L14 42 L14 20 L10 22 L6 14 Z" fill={accent} {...S} />
          <path d="M19 9.5 Q24 17 29 9.5" fill="none" {...S} strokeWidth={2} />
          <path d="M18 28 L30 28" stroke={light} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M24 20 L24 40" stroke={light} strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
        </>
      )
    case 'ring':
      return (
        <>
          <circle cx={24} cy={29} r={12} fill="none" {...S} strokeWidth={6} />
          <circle cx={24} cy={29} r={12} fill="none" stroke="#f6c453" strokeWidth={3} />
          <path d="M18 14 L24 7 L30 14 L24 20 Z" fill={accent} {...S} />
          <path d="M21 13 L24 9.5" stroke={light} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )
    case 'amulet':
      return (
        <>
          <path d="M12 6 Q24 20 36 6" fill="none" {...S} strokeWidth={2} />
          <path d="M14 18 L34 18 L34 28 Q34 38 24 43 Q14 38 14 28 Z" fill={accent} {...S} />
          <path d="M24 22 L24 36 M18 28 L30 28" stroke={light} strokeWidth={2.4} strokeLinecap="round" />
        </>
      )
    case 'heart':
      return (
        <>
          <path d="M12 6 Q24 20 36 6" fill="none" {...S} strokeWidth={2} />
          <path d="M24 42 C10 33 10 21 17 19 C21 18 23 21 24 23 C25 21 27 18 31 19 C38 21 38 33 24 42 Z" fill={accent} {...S} />
          <ellipse cx={19} cy={25} rx={2.6} ry={2} fill={light} />
        </>
      )
    case 'earring':
      return (
        <>
          <path d="M24 6 q8 2 4 10 L24 20" fill="none" {...S} />
          <circle cx={24} cy={20} r={2.6} fill="#f6c453" {...S} strokeWidth={2} />
          <path d="M24 23 L32 33 L24 43 L16 33 Z" fill={accent} {...S} />
          <path d="M20 32 L24 27" stroke={light} strokeWidth={2} strokeLinecap="round" />
        </>
      )
    case 'gem':
      return (
        <>
          <path d="M12 6 Q24 20 36 6" fill="none" {...S} strokeWidth={2} />
          <path d="M24 16 C33 22 35 32 28 40 C25 43 23 43 20 40 C13 32 15 22 24 16 Z" fill={accent} {...S} />
          <path d="M20 28 q1 -5 5 -7" fill="none" stroke={light} strokeWidth={2.2} strokeLinecap="round" />
        </>
      )
    case 'potion':
      return (
        <>
          <path d="M19 6 L29 6 L29 10 L27 10 L27 17 C35 20 38 26 38 31 C38 39 32 43 24 43 C16 43 10 39 10 31 C10 26 13 20 21 17 L21 10 L19 10 Z" fill="#fff" {...S} />
          <path d="M12.4 30 C17 27 31 33 35.6 30 C36 38 31 41 24 41 C17 41 12 38 12.4 30 Z" fill={accent} />
          <circle cx={18} cy={24} r={2.4} fill="#fff" stroke={INK} strokeWidth={1.4} />
          <path d="M19 6 L29 6" {...S} strokeWidth={4} stroke="#c98a55" />
        </>
      )
  }
}

/** 淺一點的同色：寶石反光用 */
function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.6)
  const r = mix(n >> 16)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `rgb(${r},${g},${b})`
}

export function ItemIcon({ item, size = 40 }: { item: Item; size?: number }) {
  const accent = QUALITIES[item.quality].color
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Shape kind={itemKind(item)} accent={accent} light={lighten(accent)} />
    </svg>
  )
}

export function PotionIcon({ size = 40 }: { size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Shape kind="potion" accent="#ff7aa2" light="#ffd0de" />
    </svg>
  )
}

/** 空的裝備欄：淡淡的部位輪廓 */
export function SlotGhost({ slot, size = 34 }: { slot: Slot; size?: number }) {
  const kind: Kind = slot === 'weapon' ? 'sword' : slot === 'armor' ? 'armor' : 'ring'
  return (
    <svg className="ico ghost" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Shape kind={kind} accent="#e6dcec" light="#f6f1f8" />
    </svg>
  )
}

export function ClassIcon({ classId, size = 26 }: { classId: ClassId; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Shape kind={WEAPON_KIND[classId]} accent={CLASSES[classId].colors.accent} light="#ffffff" />
    </svg>
  )
}

/** 角色頭像：職業色圓框＋武器圖示＋等級 */
export function Avatar({ classId, level, size = 44 }: { classId: ClassId; level?: number; size?: number }) {
  const c = CLASSES[classId]
  return (
    <span
      className="m-avatar"
      style={{ width: size, height: size, background: c.colors.primary, borderColor: c.colors.accent }}
    >
      <ClassIcon classId={classId} size={Math.round(size * 0.68)} />
      {level !== undefined && <i className="m-avatar-lv">{level}</i>}
    </span>
  )
}
