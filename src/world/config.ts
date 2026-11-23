// 世界串流與更新範圍設定：區塊大小、載入／卸載距離、怪物 AI 與顯示範圍。
// 數值都集中在這裡，依實測調整（docs/map-qa 有每次測試的紀錄）。
export const STREAM = {
  /** 區塊邊長（公尺） */
  chunkSize: 16,
  /** 區塊中心距離主角多近就載入（場景物件、地面細節） */
  loadRadius: 50,
  /** 超過多遠才卸載（比載入距離大，來回走動時不會一直重建） */
  unloadRadius: 66,
  /** 主角接近區域出口多近時，開始預載出口另一側 */
  exitNear: 16,
  /** 預載出口另一側的範圍 */
  exitPreload: 26,
  /** 每幀最多新建幾個區塊（分散建立成本，避免卡頓） */
  buildsPerFrame: 2,
  /** 主角周圍這個範圍內的區塊都準備好，才允許移動（讀檔、傳送時） */
  readyRadius: 18,
}

export const AI = {
  /** 距離主角這個範圍內的怪物執行完整 AI；更遠的只處理重生計時與回血 */
  fullRadius: 40,
  /** 怪物顯示槽位的範圍（與 AI 範圍分開設定） */
  displayRadius: 48,
}

/** 世界種子與程序生成版本：之後的支線區塊用（種子＋區塊座標＋版本決定內容） */
export const WORLD_SEED = 20261123
export const GENERATOR_VERSION = 1
