// 城鎮測試頁截圖：node townlab-shots.mjs [標籤] [A|B] [寬] [高]
// 依序套用測試頁的驗收鏡頭並截圖，存到 docs/town-qa/<標籤>/lab_*.png，同時印出效能數字
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [, , label = 'lab', layout = 'B', w = '1280', h = '720'] = process.argv
const OUT = fileURLToPath(new URL(`../../docs/town-qa/${label}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto((process.env.QA_URL ?? 'http://localhost:5183/') + 'town-lab.html', { waitUntil: 'load' })
await page.waitForFunction(() => window.__townlab, null, { timeout: 30000 })
await page.evaluate((id) => {
  window.__townlab.setPanel(false)
  window.__townlab.setId(id)
}, layout)
await page.waitForTimeout(6000)
const n = await page.evaluate(() => window.__townlab.shots.length)
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => window.__townlab.applyShot(i), i)
  await page.waitForTimeout(1600)
  const name = await page.evaluate((i) => window.__townlab.shots[i].name, i)
  await page.screenshot({ path: `${OUT}lab_${layout}_${i + 1}.png` })
  console.log(i + 1, name, JSON.stringify(await page.evaluate(() => ({ ...window.__townlab.stats }))))
}
if (errs.length) console.log('ERRORS', errs.slice(0, 5))
await browser.close()
