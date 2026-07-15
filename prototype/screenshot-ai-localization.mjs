import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')
const file = path.join(__dirname, 'ai-localization-redesign.html')
const url = `file:///${file.replace(/\\/g, '/')}`

const shots = [
  { name: 'overview', tab: 'overview' },
  { name: 'knowledge-glossary', tab: 'knowledge', know: 'glossary' },
  { name: 'knowledge-memory', tab: 'knowledge', know: 'memory' },
  { name: 'knowledge-style', tab: 'knowledge', know: 'style' },
  { name: 'official', tab: 'official' },
  { name: 'quality-rules', tab: 'quality', qa: 'rules' },
  { name: 'quality-history', tab: 'quality', qa: 'history' },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 })
await page.goto(url)
for (const shot of shots) {
  await page.click(`.tabs [data-tab="${shot.tab}"]`)
  if (shot.know) await page.click(`[data-know="${shot.know}"]`)
  if (shot.qa) await page.click(`[data-qaview="${shot.qa}"]`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(__dirname, `ai-l10n-${shot.name}.png`) })
  console.log('saved', shot.name)
}
await browser.close()
