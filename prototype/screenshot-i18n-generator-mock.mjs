import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'i18n-generator-mock.html')
const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

const scenarios = [
  { id: 'empty', file: 'i18n-generator-empty.png', btn: 'empty' },
  { id: 'file', file: 'i18n-generator-file.png', btn: 'file' },
  { id: 'project', file: 'i18n-generator-project.png', btn: 'project' },
]

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 960 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="i18n-generator"]')

  for (const scenario of scenarios) {
    await page.click(`[data-scenario-btn="${scenario.btn}"]`)
    await page.waitForTimeout(80)
    const shotPath = join(__dirname, scenario.file.replace('.png', '-1680.png'))
    await page.screenshot({ path: shotPath, fullPage: false })
    console.log('screenshot:', shotPath)
  }

  await page.click('[data-scenario-btn="file"]')
  const metrics = await page.evaluate(() => {
    const prefix = document.querySelector('[data-panel="prefix"]')?.getBoundingClientRect()
    const review = document.querySelector('[data-panel="review"]')?.getBoundingClientRect()
    const divider = document.querySelector('[data-divider]')?.getBoundingClientRect()
    if (!prefix || !review || !divider) return { error: 'missing' }
    const gap = review.x - prefix.right
    const gapCenter = prefix.right + gap / 2
    const divCenter = divider.x + divider.width / 2
    return {
      prefixW: Math.round(prefix.width),
      reviewW: Math.round(review.width),
      gap: Math.round(gap),
      dividerOffset: Math.abs(gapCenter - divCenter),
    }
  })
  console.log('metrics:', JSON.stringify(metrics))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
