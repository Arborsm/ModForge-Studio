import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

const base = process.argv[2] || 'http://127.0.0.1:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// 切到工作台模式
await page
  .getByText('工作台', { exact: true })
  .first()
  .click()
  .catch(() => {})
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(__dirname, 'live-workbench.png') })

// 找 AI 本地化入口
const nav = await page.evaluate(() => document.body.innerText.slice(0, 500))
console.log('--- workbench text ---')
console.log(nav)

// 尝试点 AI 本地化
const aiLoc = page.getByText('AI 本地化', { exact: true }).first()
if (await aiLoc.count()) {
  await aiLoc.click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(__dirname, 'live-ai-l10n.png') })
  console.log('clicked AI 本地化')
} else {
  console.log('AI 本地化 not found; text above')
}
await browser.close()
