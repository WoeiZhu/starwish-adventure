# 把原始 GLB 壓成遊戲用的 .web.glb（meshopt 網格壓縮、貼圖轉 WebP 並縮小）。
# 不合併、不攤平節點：寶箱的箱蓋、弓弦有動畫，要保留原本的節點結構。
# 用法：在 tools/assets 底下執行 `npm install` 後 `./build-web.ps1`
$ErrorActionPreference = 'Stop'
$models = Join-Path $PSScriptRoot '..\..\public\models'

# 檔案（相對 public/models）與貼圖上限
$jobs = @(
  # 第二章雙刀／藥使：獨立三階武器、共用藥瓶與保留手腕修正的掛點人物。
  @{ dir = 'starwish-weapon-expansion-20261126-v001'; files = 'assassin-1','assassin-2','assassin-3','apothecary-1','apothecary-2','apothecary-3','potion-shared'; size = 512 },
  @{ dir = 'starwish-weapon-expansion-20261126-v001'; files = 'A02-modular','A04-modular'; size = 1024; prune = $false },
  @{ dir = 'starwish-weapons-20261123-v001'; files = 'sword-01','sword-02','sword-03','bow-01','bow-02','bow-03','staff-01','staff-02','staff-03','wand-01','wand-02','wand-03','shared-shield','shield-silver-blue','shield-ivory-gold','shared-arrow'; size = 512 },
  @{ dir = '.'; files = 'star-coin','potion-bottle','potion-bottle-blue','potion-bottle-green','material-pouch','equipment-bundle'; size = 512 },
  @{ dir = '.'; files = 'wooden-chest'; size = 1024 },
  # 新版城鎮（城牆式）用的單體模型：依配置表擺放，不用整座城的 town-environment
  @{ dir = 'starwish-town-meshy-20261123-v001'; files = 'weapon-shop','general-store','adventurers-guild','town-inn','star-fountain','town-tree','town-wall'; size = 1024 },
  # 舊角色與怪物：原檔每個 4～5 MB（2048 貼圖，載入後約 22 MB 顯存），壓成約 0.3 MB
  @{ dir = '.'; files = 'archer','mage','knight','cleric','guide-npc','merchant-npc','elite-goblin','guardian-boss','moss-stag'; size = 1024 },
  @{ dir = '.'; files = 'slime','moon-wolf','spore-mushroom','star-crystal'; size = 512 },
  # 新角色（v002）：城門衛兵、新怪物（鐵牙野豬、月翼蝠、砂鱗蜥兵、裂岩甲蟹）、第二章夥伴（暗殺者 A02、藥師 A04）。原檔 3.4～13.6 MB
  @{ dir = 'starwish-characters-20261126-v002'; files = 'G01\character-game','M01\character-game','M02\character-game','M03\character-game','M04\character-game','A02\character-game','A04\character-game'; size = 1024 }
)

foreach ($job in $jobs) {
  foreach ($name in $job.files) {
    $src = Join-Path $models "$($job.dir)\$name.glb"
    $out = Join-Path $models "$($job.dir)\$name.web.glb"
    # 空節點也可能是遊戲必要掛點；兩款模組人物必須保留 Weapon*Socket。
    $taskPrune = if ($job.ContainsKey('prune')) { $job.prune.ToString().ToLowerInvariant() } else { 'true' }
    npx gltf-transform optimize $src $out --compress meshopt --texture-compress webp --texture-size $job.size `
      --simplify false --join false --flatten false --instance false --palette false --prune $taskPrune
    if ($LASTEXITCODE -ne 0) { throw "壓縮失敗：$src" }
    '{0,-40} {1,8:N0} KB -> {2,6:N0} KB' -f "$name.glb", ((Get-Item $src).Length / 1KB), ((Get-Item $out).Length / 1KB)
  }
}

# 新版城鎮的遠景版本（.lod.web.glb）：網格簡化、貼圖 512。城外遠看、城內遠處用。
$lod = @(
  @{ files = 'weapon-shop','general-store','adventurers-guild','town-inn','town-gate'; ratio = 0.18; err = 0.004 },
  @{ files = 'town-wall','town-tree'; ratio = 0.1; err = 0.03 }
)
foreach ($job in $lod) {
  foreach ($name in $job.files) {
    $src = Join-Path $models "starwish-town-meshy-20261123-v001\$name.glb"
    $out = Join-Path $models "starwish-town-meshy-20261123-v001\$name.lod.web.glb"
    npx gltf-transform optimize $src $out --compress meshopt --texture-compress webp --texture-size 512 `
      --simplify true --simplify-ratio $job.ratio --simplify-error $job.err --join false --flatten false --instance false --palette false
    if ($LASTEXITCODE -ne 0) { throw "壓縮失敗：$src" }
  }
}
