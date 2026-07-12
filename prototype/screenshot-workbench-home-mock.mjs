import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'workbench-home-mock.html')
const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

const scenarios = [
  { id: 'rich', file: 'workbench-home-rich.png', btn: 'rich' },
  { id: 'none', file: 'workbench-home-none.png', btn: 'none' },
  { id: 'empty', file: 'workbench-home-empty.png', btn: 'empty' },
]

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 960 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="workbench-home"]')

  for (const scenario of scenarios) {
    await page.click(`[data-scenario-btn="${scenario.btn}"]`)
    await page.waitForTimeout(120)
    const shotPath = join(__dirname, scenario.file)
    await page.screenshot({ path: shotPath, fullPage: false })
    console.log('screenshot:', shotPath)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
