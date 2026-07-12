import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'character-workspace-mock.html')
const shotPath = join(__dirname, 'character-workspace-mock.png')

const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="character-workspace"]')
  await page.screenshot({ path: shotPath, fullPage: false })

  const metrics = await page.evaluate(() => {
    const browser = document.querySelector('[data-panel="browser"]').getBoundingClientRect()
    const stage = document.querySelector('[data-panel="stage"]').getBoundingClientRect()
    const detail = document.querySelector('[data-panel="detail"]').getBoundingClientRect()
    const dividers = [...document.querySelectorAll('.item-workspace-divider')].map((el) => el.getBoundingClientRect())

    const gap1Center = browser.right + (stage.x - browser.right) / 2
    const gap2Center = stage.right + (detail.x - stage.right) / 2
    const div1Center = dividers[0] ? dividers[0].x + dividers[0].width / 2 : null
    const div2Center = dividers[1] ? dividers[1].x + dividers[1].width / 2 : null

    return {
      browserW: Math.round(browser.width),
      stageW: Math.round(stage.width),
      detailW: Math.round(detail.width),
      gap1: Math.round(stage.x - browser.right),
      gap2: Math.round(detail.x - stage.right),
      divider1Offset: div1Center == null ? null : Math.abs(gap1Center - div1Center),
      divider2Offset: div2Center == null ? null : Math.abs(gap2Center - div2Center),
    }
  })

  console.log(JSON.stringify(metrics, null, 2))
  console.log('screenshot:', shotPath)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
