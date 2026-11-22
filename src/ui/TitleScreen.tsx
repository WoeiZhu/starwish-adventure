// 開局角色創建：名字、男孩 / 女孩外觀、四職業。左側 3D 人物即時預覽。
import { CLASSES, CLASS_ORDER } from '../data/classes'
import { useGame } from '../game/store'
import { enterAppMode } from '../systems/mobile'

export function TitleScreen() {
  const hero = useGame((s) => s.hero)
  const setProfile = useGame((s) => s.setProfile)
  const startGame = useGame((s) => s.startGame)
  const continueGame = useGame((s) => s.continueGame)
  const save = useGame((s) => s.save)
  const cls = CLASSES[hero.classId]

  return (
    <div className="title">
      <div className="title-logo">
        <div className="title-en">✦ STARWISH ADVENTURE</div>
        <h1>星願冒險團</h1>
        <p>可愛 3D 奇幻冒險 · 第一～二章 · 探索、戰鬥與成長</p>
      </div>

      <form
        className="panel create"
        onSubmit={(e) => {
          e.preventDefault()
          void enterAppMode()
          startGame()
        }}
      >
        {save && (
          <div className="continue">
            <button type="button" className="btn-primary" onClick={() => {
                void enterAppMode()
                continueGame()
              }}>
              繼續冒險
            </button>
            <div className="continue-info">
              {save.name} · {CLASSES[save.classId].name} LV.{save.level}
              <br />
              {new Date(save.savedAt).toLocaleString('zh-TW')}
            </div>
          </div>
        )}
        <h2>{save ? '或開始新的冒險' : '創建你的冒險者'}</h2>

        <label className="field-label" htmlFor="hero-name">
          名字
        </label>
        <input
          id="hero-name"
          className="text-input"
          value={hero.name}
          maxLength={8}
          onChange={(e) => setProfile({ name: e.target.value })}
        />

        <div className="field-label">職業</div>
        <div className="class-grid">
          {CLASS_ORDER.map((id) => {
            const c = CLASSES[id]
            return (
              <button
                type="button"
                key={id}
                className={'class-card' + (hero.classId === id ? ' on' : '')}
                onClick={() => setProfile({ classId: id })}
              >
                <span className="class-dot" style={{ background: c.colors.primary, borderColor: c.colors.accent }} />
                <span className="class-name">{c.name}</span>
                <span className="class-role">{c.role}</span>
              </button>
            )
          })}
        </div>
        <div className="class-detail">
          <b>{cls.name}</b>　{cls.desc}
          <br />
          職業強化 · {cls.buff.name}：{cls.buff.desc}
        </div>

        <button type="submit" className={save ? 'btn' : 'btn-primary'}>
          {save ? '開始新冒險（會覆蓋存檔）' : '開始冒險'}
        </button>
      </form>
    </div>
  )
}
