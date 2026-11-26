// 技能樹：每職業 3 個分支 × 4 個節點 = 12 節點。
// 分支內由上而下解鎖：需要達到指定等級，且前一個節點至少投入 1 點。
import type { ClassId } from './classes'

export type NodeEffect =
  /** 第 skill 個技能（0–3）的威力，每級 +perRank（比例） */
  | { type: 'skillPower'; skill: number; perRank: number }
  /** 第 skill 個技能的冷卻，每級 -perRank 秒 */
  | { type: 'skillCooldown'; skill: number; perRank: number }
  /** 第 skill 個技能的範圍半徑，每級 +perRank */
  | { type: 'zoneRadius'; skill: number; perRank: number }
  /** 職業強化的效果量，每級 +perRank（比例） */
  | { type: 'buffAmount'; perRank: number }
  /** 職業強化的持續時間，每級 +perRank 秒 */
  | { type: 'buffDuration'; perRank: number }
  /** 能力值：atk/def/hp/mp/atkSpeed/heal 為比例，crit 為絕對值 */
  | { type: 'stat'; stat: 'atk' | 'def' | 'hp' | 'mp' | 'crit' | 'atkSpeed' | 'heal'; perRank: number }
  /** 必殺技命中後，敵人受到的傷害每級 +perRank（比例），持續 6 秒 */
  | { type: 'vuln'; perRank: number }

export interface TreeNode {
  id: string
  branch: 0 | 1 | 2
  row: number
  name: string
  /** 說明文字，{v} 會換成目前等級的數值 */
  desc: string
  maxRank: number
  reqLevel: number
  effect: NodeEffect
}

export const BRANCH_NAMES = ['攻擊系', '職業強化系', '必殺技系']
export const MAX_RANK = 5
const REQ_LEVEL = [
  [1, 3, 8, 15],
  [2, 5, 10, 16],
  [4, 9, 14, 20],
]

type Row = [name: string, desc: string, effect: NodeEffect]
function tree(classId: ClassId, branches: [Row[], Row[], Row[]]): TreeNode[] {
  return branches.flatMap((rows, b) =>
    rows.map(
      ([name, desc, effect], row): TreeNode => ({
        id: `${classId}_${b}_${row}`,
        branch: b as 0 | 1 | 2,
        row,
        name,
        desc,
        maxRank: MAX_RANK,
        reqLevel: REQ_LEVEL[b][row],
        effect,
      }),
    ),
  )
}

const buffRows = (buffName: string, statName: string, stat: NodeEffect): Row[] => [
  [`${buffName}強化`, `${buffName}效果 +{v}%`, { type: 'buffAmount', perRank: 0.1 }],
  [statName, '', stat],
  ['縮短冷卻', `${buffName}冷卻 -{v} 秒`, { type: 'skillCooldown', skill: 2, perRank: 2 }],
  ['持續時間提升', `${buffName}持續 +{v} 秒`, { type: 'buffDuration', perRank: 1 }],
]

export const TREES: Record<ClassId, TreeNode[]> = {
  archer: tree('archer', [
    [
      ['連射', '連射傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['穿透箭', '穿透箭傷害 +{v}%', { type: 'skillPower', skill: 1, perRank: 0.1 }],
      ['多重箭', '連射冷卻 -{v} 秒', { type: 'skillCooldown', skill: 0, perRank: 0.4 }],
      ['暴擊精通', '暴擊率 +{v}%', { type: 'stat', stat: 'crit', perRank: 0.03 }],
    ],
    buffRows('疾風之姿', '敏捷提升', { type: 'stat', stat: 'atkSpeed', perRank: 0.04 }),
    [
      ['箭雨', '箭雨傷害 +{v}%', { type: 'skillPower', skill: 3, perRank: 0.1 }],
      ['箭雨強化', '箭雨範圍 +{v}', { type: 'zoneRadius', skill: 3, perRank: 0.4 }],
      ['破甲效果', '箭雨命中的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極箭雨', '箭雨冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
  mage: tree('mage', [
    [
      ['火球', '火球傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['冰霜衝擊', '冰霜衝擊傷害 +{v}%', { type: 'skillPower', skill: 1, perRank: 0.1 }],
      ['寒冰擴散', '冰霜衝擊範圍 +{v}', { type: 'zoneRadius', skill: 1, perRank: 0.3 }],
      ['元素精通', '攻擊力 +{v}%', { type: 'stat', stat: 'atk', perRank: 0.03 }],
    ],
    buffRows('魔力覺醒', '魔力湧泉', { type: 'stat', stat: 'mp', perRank: 0.06 }),
    [
      ['隕石風暴', '隕石風暴傷害 +{v}%', { type: 'skillPower', skill: 3, perRank: 0.1 }],
      ['隕石強化', '隕石風暴範圍 +{v}', { type: 'zoneRadius', skill: 3, perRank: 0.4 }],
      ['灼燒破甲', '隕石命中的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極隕石', '隕石風暴冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
  knight: tree('knight', [
    [
      ['盾擊', '盾擊傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['威嚇怒吼', '挑釁冷卻 -{v} 秒', { type: 'skillCooldown', skill: 1, perRank: 0.6 }],
      ['劍術精通', '攻擊力 +{v}%', { type: 'stat', stat: 'atk', perRank: 0.04 }],
      ['鐵壁', '防禦力 +{v}%', { type: 'stat', stat: 'def', perRank: 0.04 }],
    ],
    buffRows('鋼鐵意志', '強健體魄', { type: 'stat', stat: 'hp', perRank: 0.04 }),
    [
      ['守護壁壘', '守護壁壘冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 2 }],
      ['不屈', '最大生命 +{v}%', { type: 'stat', stat: 'hp', perRank: 0.04 }],
      ['震懾', '守護壁壘範圍內的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極壁壘', '守護壁壘冷卻再 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
  cleric: tree('cleric', [
    [
      ['聖光術', '聖光術傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['治癒強化', '治療量 +{v}%', { type: 'stat', stat: 'heal', perRank: 0.08 }],
      ['快速治癒', '治癒之光冷卻 -{v} 秒', { type: 'skillCooldown', skill: 1, perRank: 0.4 }],
      ['神聖之力', '攻擊力 +{v}%', { type: 'stat', stat: 'atk', perRank: 0.04 }],
    ],
    buffRows('生命祝福', '聖潔體質', { type: 'stat', stat: 'hp', perRank: 0.03 }),
    [
      ['神聖領域', '神聖領域傷害 +{v}%', { type: 'skillPower', skill: 3, perRank: 0.1 }],
      ['領域擴張', '神聖領域範圍 +{v}', { type: 'zoneRadius', skill: 3, perRank: 0.4 }],
      ['聖裁', '神聖領域內的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極領域', '神聖領域冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
  assassin: tree('assassin', [
    [
      ['二連擊', '二連擊傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['旋刃', '旋刃傷害 +{v}%', { type: 'skillPower', skill: 1, perRank: 0.1 }],
      ['旋刃擴展', '旋刃範圍 +{v}', { type: 'zoneRadius', skill: 1, perRank: 0.25 }],
      ['要害精通', '暴擊率 +{v}%', { type: 'stat', stat: 'crit', perRank: 0.03 }],
    ],
    buffRows('影葉之心', '敏捷提升', { type: 'stat', stat: 'atkSpeed', perRank: 0.04 }),
    [
      ['瞬閃', '瞬閃傷害 +{v}%', { type: 'skillPower', skill: 3, perRank: 0.1 }],
      ['落影', '瞬閃範圍 +{v}', { type: 'zoneRadius', skill: 3, perRank: 0.3 }],
      ['破綻', '瞬閃命中的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極瞬閃', '瞬閃冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
  apothecary: tree('apothecary', [
    [
      ['毒性擴散', '中毒傷害 +{v}%', { type: 'skillPower', skill: 0, perRank: 0.1 }],
      ['藥效強化', '治療量 +{v}%', { type: 'stat', stat: 'heal', perRank: 0.08 }],
      ['毒霧擴大', '毒性擴散範圍 +{v}', { type: 'zoneRadius', skill: 0, perRank: 0.25 }],
      ['藥理精通', '攻擊力 +{v}%', { type: 'stat', stat: 'atk', perRank: 0.04 }],
    ],
    buffRows('疾行藥劑', '魔力湧泉', { type: 'stat', stat: 'mp', perRank: 0.06 }),
    [
      ['毒孢子', '毒孢子傷害 +{v}%', { type: 'skillPower', skill: 3, perRank: 0.1 }],
      ['孢子擴散', '毒孢子範圍 +{v}', { type: 'zoneRadius', skill: 3, perRank: 0.4 }],
      ['腐蝕', '毒孢子命中的敵人受到傷害 +{v}%', { type: 'vuln', perRank: 0.04 }],
      ['終極孢子', '毒孢子冷卻 -{v} 秒', { type: 'skillCooldown', skill: 3, perRank: 3 }],
    ],
  ]),
}

const STAT_DESC: Record<string, string> = {
  atk: '攻擊力 +{v}%',
  def: '防禦力 +{v}%',
  hp: '最大生命 +{v}%',
  mp: '最大魔力 +{v}%',
  crit: '暴擊率 +{v}%',
  atkSpeed: '攻擊速度 +{v}%',
  heal: '治療量 +{v}%',
}

/** 節點在指定等級的說明文字（rank 0 時顯示下一級的數值） */
export function nodeText(n: TreeNode, rank: number) {
  const e = n.effect
  const r = Math.max(1, rank)
  const ratio = e.type === 'skillPower' || e.type === 'buffAmount' || e.type === 'stat' || e.type === 'vuln'
  const v = ratio ? Math.round(e.perRank * r * 100) : Math.round(e.perRank * r * 10) / 10
  const text = n.desc || (e.type === 'stat' ? STAT_DESC[e.stat] : '')
  return text.replace('{v}', String(v))
}
