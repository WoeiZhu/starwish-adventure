// 開一個網址截圖（本機 Edge 無頭模式）：node shot.mjs <url> <輸出.png> [寬] [高]
import { chromium } from 'playwright-core'

const [, , url, out, w = '1800', h = '600'] = process.argv
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('ERR', m.text()))
await page.goto(url)
await page.waitForFunction(() => window.done === true, null, { timeout: 30000 })
await page.screenshot({ path: out })
await browser.close()
