import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'settings-window-redesign-mock.html')
const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('.panel')

  const cats = ['appearance', 'loading', 'view', 'interaction', 'debug']
  for (const cat of cats) {
    await page.click(`.seg-tab[data-cat="${cat}"]`)
    await page.waitForTimeout(100)
    if (cat === 'loading') {
      await page.click('#speed-mode-toggle')
      await page.waitForTimeout(60)
    }
    const out = join(__dirname, `settings-window-redesign-b-${cat}.png`)
    await page.screenshot({ path: out, fullPage: false })
    console.log('screenshot:', out)
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
