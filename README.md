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
| 滑鼠左鍵點怪物 | 鎖定目標並自動接近；進入射程且站定後才自動普通攻擊（移動中不出手） |
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

## 手機版

手機（觸控為主的裝置）會自動切換成手機模式，固定橫向遊玩：

- 按「開始冒險 / 繼續冒險」時進入全螢幕並鎖定橫向（Android Chrome）。離開全螢幕後，右上角會出現 ⛶ 按鈕可切回。
- 直拿時畫面會提示轉成橫向，遊戲自動暫停，轉回來自動繼續。
- iPhone Safari 不支援程式切全螢幕與鎖定方向：請用「分享 → 加入主畫面」，從桌面圖示開啟就沒有網址列（`public/manifest.webmanifest`）。
- 操作：左下浮動搖桿（推到底跑步）、右下技能 / 閃避 / 藥水 / 換目標按鈕、靠近人物時出現互動按鈕；單指拖曳畫面轉鏡頭、雙指開合縮放。
- 右上 ☰ 選單可切換畫質：手機預設「省電」（不放大解析度、陰影貼圖 1024），電腦預設「高畫質」。

相關程式：`src/systems/mobile.ts`、`src/ui/TouchControls.tsx`、`src/ui/RotateHint.tsx`、`src/mobile.css`。

## 架構

```
src/
  data/      資料層：職業表、外觀設定、地圖佈局與碰撞體（資料驅動）
  game/      規則層：Zustand 狀態（store）、每幀資料（runtime）
    combat/  戰鬥：state（單位與投射物）、actions（傷害 / 技能）、sim（每幀更新、怪物與隊友 AI）
  systems/   輸入、碰撞、分區 A* 尋路（與畫面無關，可單獨測試）
  world/     地圖串流：區塊設定（config）、區塊內容與程序生成接口（chunks）、載入／卸載管理（stream）、碰撞空間索引、目前地圖（maps）
  scene/     3D 場景層：World、Town（星光鎮）、Chunks（分區塊畫地面與草木）、Landmarks（地標）、Vista（遠景）、Player、CameraRig、CombatLayer
    characters/  CharacterModel 是模型替換點；GlbCharacter 載入骨架模型並以程式驅動動作；ChibiCharacter 為備援的程序化人物
  ui/        介面層：角色創建、HUD、暫停、對話
```

## 階段進度

- [x] **A 3D 探索原型**：草原場景、男 / 女主角 × 四職業外觀、WASD 與點擊移動、縮放相機、史萊姆待機、NPC 對話、HUD、暫停
- [x] **B 戰鬥與四職業**：四職能力值、血條、怪物追擊與脫戰、自動普攻、每職 4 個技能（含職業強化與必殺技）、隊友 AI（戰士嘲諷、聖者治療、弓手與法師輸出）、閃避、倒下與復活。隊友在階段 D 改為事件招募
- [x] **C RPG 成長系統**：四人各自累積經驗、LV.50 上限、每級 1 技能點、三分支技能樹（每職 12 節點、可免費重置）、武器 / 防具 / 飾品與五種品質、可見掉落與自動拾取、藥水、背包（上限 40）、自動存檔與讀檔
- [x] **D 故事與探索內容**：單人開局、第一章任務鏈、三個招募事件（含選項）、四個區域（星光村 / 翠綠草原 / 迷霧森林 / 古代石環）、三個寶箱、商人、精英怪與 Boss（紅圈預兆、狂暴、召喚）、章節完成畫面
- [x] **E 第二章 月光山谷**：地圖往北延伸出新區域、四種新怪物（幼狼撲擊、蘑菇毒霧、魔靈遠程彈幕、靈鹿衝撞與治療）、第二章任務鏈（石碑 → 淨化山谷 → 星晶林 → 月泉 Boss）、兩個新的區域首領
- [x] **F 地圖系統**：河流與三座橋（東側吊橋是要從山谷放下的捷徑）、北方隘口、步道岔路、各區地標、邊界山壁與封閉入口、遠景山脈與遠方地標；分區塊載入、遠處怪物簡化更新、分區尋路、存檔第 2 版。說明與測試紀錄見 `docs/map-system.md`
- [x] **F2 星光鎮**：南方街道盡頭的 Meshy 城門通往獨立的城鎮地圖（4 間建築、4 位 NPC、旅館休息、雜貨店）；進出城不彈跳、野外怪物暫存、城內存讀檔（存檔第 3 版）、載入失敗退回城門外。轉職與委託板尚未實作。說明與測試紀錄見 `docs/town-integration.md`
- [x] **F3 武器包與掉落物模型**：角色手上換成武器包模型（每職業 3 階，依裝備等級換階；騎士盾牌依防具等級換階）、弓攻擊時拉弦、弓箭手射出箭矢模型、星光鎮武器店開張、掉落物（金幣 / 藥水 / 裝備包 / 飾品袋）與寶箱改用模型（寶箱會開箱並留在原地）、商人旁的藥水擺設。說明與測試紀錄見 `docs/assets-integration.md`
- [ ] **G 程序生成支線**：洞窟與野外支路（接口已預留在 `src/world/chunks.ts` 的 `GENERATORS`）

## 調整數值

- 職業能力、普攻、技能效果：`src/data/classes.ts`（技能由 projectile / melee / taunt / heal / buff / zone 效果組合）
- 怪物數值與等級成長公式：`src/data/enemies.ts`（怪物重生時等級會隨主角提高）
- 怪物營地與區域首領：`src/data/world.ts` 的 `CAMPS`（位置、等級、數量、種族）與 `AREA_BOSSES`（重生秒數、首次出現延遲）
- 裝備名稱、品質倍率、掉落機率：`src/data/items.ts`
- 技能樹節點：`src/data/skilltree.ts`
- 等級成長、經驗曲線、能力值計算：`src/game/progress.ts`
- 劇情流程、對話、事件與任務文字：`src/game/story.ts`
- 區域範圍、名稱與配色：`src/data/regions.ts`；事件地點、寶箱位置：`src/data/world.ts`
- 河流、橋、隘口、步道、地標、邊界與遠景：`src/data/terrain.ts`
- 區塊大小、載入／卸載距離、怪物 AI 與顯示範圍：`src/world/config.ts`
- 精英與 Boss 的能力倍率、隊伍人數對怪物強度的影響：`src/game/combat/state.ts`（`TIER`、`PARTY_SCALE`）
- 存檔格式：`src/game/save.ts`（localStorage 鍵 `starwish.save.v1`，資料內 version 2；會自動轉換第 1 版）
- 開發模式下主控台可用 `window.__sw`（combat、sim、runtime、useGame、progress、story、nav、stream、gl）檢查狀態
- 地圖自動測試：`tools/qa/map-qa.mjs`（無頭 Edge，先 `npm run dev`；在 `tools/qa` 執行一次 `npm install`）；城鎮 `town-qa.mjs`、武器與掉落物 `assets-qa.mjs`
- 武器店商品與售價：`src/game/story.ts` 的 `SHOP_QUALITY`、`SHOP_PRICE_RATE`；各階等級門檻與模型換階規則：`src/data/weaponModels.ts`
- 單獨看模型：開 dev server 後瀏覽 `http://localhost:5183/tools/qa/preview.html?f=star-coin.web.glb,wooden-chest.web.glb`（`v=side` / `v=top` 換角度）

## 人物模型

四職業使用 `Character/` 的 GLB 骨架模型，執行時讀取 `public/models/{archer,mage,knight,cleric}.glb`（英文檔名的複本）。更新模型後請重新複製過去；對應表在 `src/data/appearance.ts` 的 `CLASS_MODELS`。

手上的武器與盾牌來自武器包 `public/models/starwish-weapons-20261123-v001/`（對應在 `src/data/weaponModels.ts`），由 `characters/Gear.tsx` 掛到手部骨頭；武器包載入前或失敗時改用 `characters/weapons.ts` 的程序化武器。武器、掉落物、寶箱都載入 `tools/assets/build-web.ps1` 壓縮過的 `.web.glb`。

模型只有靜止姿勢、沒有動畫片段，待機 / 行走 / 跑步由 `GlbCharacter.tsx` 依骨頭名稱（Hips、Spine02、LeftUpLeg、LeftArm…）即時計算。

另有九個**內含動畫片段**的 GLB（`public/models/`），由 `characters/clipModel.ts` 載入並用 AnimationMixer 播放：

| 檔案 | 用在 | 動作 |
|------|------|------|
| `slime.glb` | 普通怪（史萊姆） | Idle、Hop、Attack、Hit、Death；依個體顏色染色 |
| `elite-goblin.glb` | 精英怪 | Idle、Walk、Run、Death；原 Attack 片段 7 秒且會位移，改由程式揮拳 |
| `guardian-boss.glb` | Boss | Idle、Walk、Run、Death；Attack 取 1.0～2.7 秒並加速 |
| `moon-wolf.glb` | 月影幼狼（第二章普通怪） | Idle、Walk、Run、Pounce（普攻取後段、撲擊播整段）、Hit、Death |
| `spore-mushroom.glb` | 孢子蘑菇（第二章普通怪） | Idle、Walk、Bonk（普攻）、Spore（毒霧）、Hit、Death；自帶的投射物節點隱藏 |
| `star-crystal.glb` | 星晶魔靈（第二章精英） | Idle、Float（移動）、Shoot（射擊與彈幕）、Hit、Death；自帶的投射物節點隱藏，改用遊戲的光彈 |
| `moss-stag.glb` | 苔蘚靈鹿（第二章 Boss） | Idle、Walk、Run、Charge（衝撞）、Heal（治療詠唱）、Hit、Death |
| `guide-npc.glb` | 村長（莉莉安） | Idle |
| `merchant-npc.glb` | 商人 | Idle |

怪物顯示在 `scene/Enemy.tsx`（依種族與階級換模型；第二章的模型當精英 ×1.4、Boss ×2 放大，載入失敗退回程序化史萊姆），NPC 由 `Appearance.clipModelUrl` 指定。怪物顯示高度與動作選段調整在 `Enemy.tsx` 的 `CONFIG`。

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

### 區域與重生

- 村莊與出生點周圍是安全區：怪物不會追進來，在安全區內也無法攻擊區域首領與怪物。
- 普通怪分布在村外的營地：草原是史萊姆，迷霧森林與石環是哥布林；先靠近的怪會成群，建議一次拉一隻。
- 區域首領（森林的迷霧史萊姆王子、石環的史萊姆王）在完成對應劇情後，會每隔一段時間重生（120 / 240 秒），重生等級隨主角提高，可反覆挑戰刷裝備。
- 第二章新增兩個區域首領：星晶林的「星晶魔靈・核」（150 秒）與月泉的「苔蘚靈鹿」（300 秒）。

## 第二章流程（月光山谷）

1. 第一章完成後回村子找村長，得知祭壇的光指向北方。
2. 從村子廣場往北的小路穿過林帶，調查山谷入口的月光石碑。
3. 淨化山谷：打倒月影幼狼與孢子蘑菇各 4 隻。幼狼會撲擊；蘑菇會噴出綠色毒霧，留在地上持續扣血。
4. 到山谷東側的星晶林調查星晶簇，擊敗精英「星晶魔靈・核」。牠會遠程射擊，並在目標周圍落下三道紅圈。
5. 帶著月之碎片到山谷深處的月泉，挑戰 Boss「苔蘚靈鹿」：蓄力衝撞（紅圈）、血量偏低時詠唱治療（用暈眩技能可以打斷）、半血狂暴並呼喚幼狼。
6. 擊敗後顯示第二章完成畫面。

山谷的營地等級比草原高（6～8 級起跳，同樣會隨主角成長）。地圖範圍、山谷位置與營地設定都在 `src/data/world.ts`（`BOUNDS`、`VALLEY_EDGE`、`CAMPS`、`AREA_BOSSES`），種族數值在 `src/data/enemies.ts` 的 `SPECIES`，特技在 `src/game/combat/sim.ts`。
