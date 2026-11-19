# 星願冒險團 Starwish Adventure

可愛 3D 網頁 RPG。依遊戲企劃書（不公開）分四階段開發，目前完成 **階段 A：3D 探索原型**、**階段 B：戰鬥與四職業**、**階段 C：RPG 成長系統**、**階段 D：故事與探索內容**（四個階段全部完成）。

**線上試玩：** https://woeizhu.github.io/starwish-adventure/ （第一次載入約 44 MB 模型，需要一點時間）

推上 `main` 分支後，`.github/workflows/deploy.yml` 會自動打包並部署到 GitHub Pages。

## 啟動

```bash
npm install
npm run dev
```

開啟 http://localhost:5183 （埠號設定在 `vite.config.ts`）。`npm run build` 會先做型別檢查再打包。

## 操作

| 操作 | 功能 |
|------|------|
| W / A / S / D（或方向鍵） | 自由移動，會取消點擊自動移動 |
| Shift | 按住跑步 |
| 滑鼠左鍵點地面 | A* 尋路自動移動、避開障礙 |
| 滑鼠左鍵點怪物 | 鎖定目標並自動接近；進入射程後自動普通攻擊 |
| 1 / 2 / 3 | 技能（3 為職業強化，持續 8 秒、冷卻 30 秒） |
| 4 | 必殺技（冷卻 45 秒） |
| Space | 閃避（短暫無敵，冷卻 1.4 秒） |
| Tab | 切換鎖定目標 |
| Z | 喝藥水（回復 45% 生命，冷卻 8 秒） |
| I / K / P | 背包 / 技能樹 / 隊伍（開啟時遊戲暫停） |
| 滾輪 | 鏡頭遠近：遠景俯視地圖 ↔ 近景看臉與服裝 |
| 滑鼠右鍵拖曳 | 左右旋轉鏡頭、上下調整俯仰角 |
| Q、E | 旋轉鏡頭 |
| R / Home | 鏡頭回正 |
| F / Enter | 交談、開寶箱、調查祭壇、推進對話（選項按 1 / 2 / 3） |
| Esc | 暫停 / 繼續 |
| H | 操作說明 |

## 架構

```
src/
  data/      資料層：職業表、外觀設定、地圖佈局與碰撞體（資料驅動）
  game/      規則層：Zustand 狀態（store）、每幀資料（runtime）
    combat/  戰鬥：state（單位與投射物）、actions（傷害 / 技能）、sim（每幀更新、怪物與隊友 AI）
  systems/   輸入、碰撞、A* 尋路（與畫面無關，可單獨測試）
  scene/     3D 場景層：World、Player、CameraRig、Slime、Npc、CombatLayer（隊友、血條、特效、飄字）
    characters/  CharacterModel 是模型替換點；GlbCharacter 載入骨架模型並以程式驅動動作；ChibiCharacter 為備援的程序化人物
  ui/        介面層：角色創建、HUD、暫停、對話
```

## 階段進度

- [x] **A 3D 探索原型**：草原場景、男 / 女主角 × 四職業外觀、WASD 與點擊移動、縮放相機、史萊姆待機、NPC 對話、HUD、暫停
- [x] **B 戰鬥與四職業**：四職能力值、血條、怪物追擊與脫戰、自動普攻、每職 4 個技能（含職業強化與必殺技）、隊友 AI（戰士嘲諷、聖者治療、弓手與法師輸出）、閃避、倒下與復活。隊友在階段 D 改為事件招募
- [x] **C RPG 成長系統**：四人各自累積經驗、LV.50 上限、每級 1 技能點、三分支技能樹（每職 12 節點、可免費重置）、武器 / 防具 / 飾品與五種品質、可見掉落與自動拾取、藥水、背包（上限 40）、自動存檔與讀檔
- [x] **D 故事與探索內容**：單人開局、第一章任務鏈、三個招募事件（含選項）、四個區域（星光村 / 翠綠草原 / 迷霧森林 / 古代石環）、三個寶箱、商人、精英怪與 Boss（紅圈預兆、狂暴、召喚）、章節完成畫面

## 調整數值

- 職業能力、普攻、技能效果：`src/data/classes.ts`（技能由 projectile / melee / taunt / heal / buff / zone 效果組合）
- 怪物數值與等級成長公式：`src/data/enemies.ts`（怪物重生時等級會隨主角提高）
- 裝備名稱、品質倍率、掉落機率：`src/data/items.ts`
- 技能樹節點：`src/data/skilltree.ts`
- 等級成長、經驗曲線、能力值計算：`src/game/progress.ts`
- 劇情流程、對話、事件與任務文字：`src/game/story.ts`
- 區域範圍、事件地點、寶箱位置：`src/data/world.ts`
- 精英與 Boss 的能力倍率、隊伍人數對怪物強度的影響：`src/game/combat/state.ts`（`TIER`、`PARTY_SCALE`）
- 存檔格式：`src/game/save.ts`（localStorage 鍵 `starwish.save.v1`）
- 開發模式下主控台可用 `window.__sw`（combat、sim、runtime、useGame、progress、story）檢查狀態

## 人物模型

四職業使用 `Character/` 的 GLB 骨架模型，執行時讀取 `public/models/{archer,mage,knight,cleric}.glb`（英文檔名的複本）。更新模型後請重新複製過去；對應表在 `src/data/appearance.ts` 的 `CLASS_MODELS`。

模型只有靜止姿勢、沒有動畫片段，待機 / 行走 / 跑步由 `GlbCharacter.tsx` 依骨頭名稱（Hips、Spine02、LeftUpLeg、LeftArm…）即時計算。

另有五個**內含動畫片段**的 GLB（`public/models/`），由 `characters/clipModel.ts` 載入並用 AnimationMixer 播放：

| 檔案 | 用在 | 動作 |
|------|------|------|
| `slime.glb` | 普通怪（史萊姆） | Idle、Hop、Attack、Hit、Death；依個體顏色染色 |
| `elite-goblin.glb` | 精英怪 | Idle、Walk、Run、Death；原 Attack 片段 7 秒且會位移，改由程式揮拳 |
| `guardian-boss.glb` | Boss | Idle、Walk、Run、Death；Attack 取 1.0～2.7 秒並加速 |
| `guide-npc.glb` | 村長（莉莉安） | Idle |
| `merchant-npc.glb` | 商人 | Idle |

怪物顯示在 `scene/Enemy.tsx`（依階級換模型，載入失敗退回程序化史萊姆），NPC 由 `Appearance.clipModelUrl` 指定。怪物顯示高度與動作選段調整在 `Enemy.tsx` 的 `CONFIG`。

## 第一章流程

1. 單人開局，與莉莉安村長交談，接下教學任務。
2. 到村子南邊的草原打倒 3 隻史萊姆。
3. 招募三位夥伴（主角沒選的三個職業，順序固定）：
   - 翠綠草原東側：被史萊姆包圍的冒險者。可選擇並肩作戰、給 2 瓶藥水，或暫時離開。
   - 迷霧森林（地圖西側）：被精英怪「迷霧史萊姆王子」困住的冒險者。
   - 古代石環（地圖東北）：調查石環的學者，對話後加入。
4. 四人到齊後調查石環中央的祭壇，挑戰 Boss「史萊姆王」。半血時會狂暴並召喚手下。
5. 擊敗後顯示章節完成畫面，之後可自由探索。

隊伍人數越少，怪物越弱（單人時生命 35%、攻擊 60%），所以單人開局也打得贏。事件怪物不會重生也不會脫戰回血，主角倒下重來時已打掉的血量會保留。
