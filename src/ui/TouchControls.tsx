// 手機觸控操作：左下浮動搖桿（手指按哪裡，搖桿就出現在哪裡；推到底就跑步）。
// 技能、閃避、藥水、互動、換目標按鈕放在 Hud 的右下按鈕區。
import { useEffect, useRef, useState } from 'react'
import { stick } from '../systems/input'

const RADIUS = 46
const RUN_AT = 0.8

export function Joystick() {
  const zone = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const [base, setBase] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  // 離開遊戲畫面時歸零，避免角色自己一直走
  useEffect(
    () => () => {
      stick.x = 0
      stick.y = 0
      stick.run = false
    },
    [],
  )

  const release = () => {
    pointer.current = null
    setBase(null)
    setKnob({ x: 0, y: 0 })
    stick.x = 0
    stick.y = 0
    stick.run = false
  }

  return (
    <div
      ref={zone}
      className="stick-zone"
      onPointerDown={(e) => {
        if (pointer.current !== null) return
        pointer.current = e.pointerId
        zone.current?.setPointerCapture(e.pointerId)
        setBase({ x: e.clientX, y: e.clientY })
        setKnob({ x: 0, y: 0 })
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !base) return
        let dx = e.clientX - base.x
        let dy = e.clientY - base.y
        const len = Math.hypot(dx, dy)
        if (len > RADIUS) {
          dx = (dx / len) * RADIUS
          dy = (dy / len) * RADIUS
        }
        setKnob({ x: dx, y: dy })
        const m = Math.min(1, len / RADIUS)
        // 小於 15% 視為沒推，避免手指微抖就走動
        if (m < 0.15) {
          stick.x = 0
          stick.y = 0
        } else {
          stick.x = dx / RADIUS
          stick.y = -dy / RADIUS
        }
        stick.run = m >= RUN_AT
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
    >
      {base ? (
        <div className="stick-base" style={{ left: base.x, top: base.y }}>
          <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      ) : (
        <div className="stick-base idle">
          <div className="stick-knob" />
        </div>
      )}
    </div>
  )
}
