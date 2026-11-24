// 傷害計算（純函式）：只算數字，不改任何單位狀態、不放特效。
// 戰鬥（actions.ts 的 damage）和技能測試頁共用同一套公式。
export interface DamageInput {
  atk: number
  def: number
  /** 技能倍率 */
  power: number
  critChance: number
  /** 減傷比例（守護壁壘），上限 90% */
  guard?: number
  /** 破甲：受到的傷害增加比例 */
  vuln?: number
}

export function rollDamage(i: DamageInput, rnd: () => number = Math.random) {
  let d = i.atk * i.power - i.def * 0.5
  const crit = rnd() < i.critChance
  if (crit) d *= 1.6
  d *= 0.9 + rnd() * 0.2
  d *= 1 - Math.min(0.9, i.guard ?? 0)
  if (i.vuln) d *= 1 + i.vuln
  return { amount: Math.max(1, Math.round(d)), crit }
}
