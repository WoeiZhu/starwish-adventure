# 把原始 GLB 壓成遊戲用的 .web.glb（meshopt 網格壓縮、貼圖轉 WebP 並縮小）。
# 不合併、不攤平節點：寶箱的箱蓋、弓弦有動畫，要保留原本的節點結構。
# 用法：在 tools/assets 底下執行 `npm install` 後 `./build-web.ps1`
$ErrorActionPreference = 'Stop'
$models = Join-Path $PSScriptRoot '..\..\public\models'

# 檔案（相對 public/models）與貼圖上限
$jobs = @(
  @{ dir = 'starwish-weapons-20261123-v001'; files = 'sword-01','sword-02','sword-03','bow-01','bow-02','bow-03','staff-01','staff-02','staff-03','wand-01','wand-02','wand-03','shared-shield','shield-silver-blue','shield-ivory-gold','shared-arrow'; size = 512 },
  @{ dir = '.'; files = 'star-coin','potion-bottle','potion-bottle-blue','potion-bottle-green','material-pouch','equipment-bundle'; size = 512 },
  @{ dir = '.'; files = 'wooden-chest'; size = 1024 },
  # 新版城鎮（城牆式）用的單體模型：依配置表擺放，不用整座城的 town-environment
  @{ dir = 'starwish-town-meshy-20261123-v001'; files = 'weapon-shop','general-store','adventurers-guild','town-inn','star-fountain','town-tree','town-wall'; size = 1024 }
)

foreach ($job in $jobs) {
  foreach ($name in $job.files) {
    $src = Join-Path $models "$($job.dir)\$name.glb"
    $out = Join-Path $models "$($job.dir)\$name.web.glb"
    npx gltf-transform optimize $src $out --compress meshopt --texture-compress webp --texture-size $job.size `
      --simplify false --join false --flatten false --instance false --palette false
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
