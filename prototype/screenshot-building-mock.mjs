import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'building-workspace-mock.html')
const shotPath = join(__dirname, 'building-workspace-mock.png')

const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="building-workspace"]')
  await page.screenshot({ path: shotPath, fullPage: false })

  const metrics = await page.evaluate(() => {
    const rail = document.querySelector('[data-panel="browser"]').getBoundingClientRect()
    const main = document.querySelector('[data-panel="preview"]').getBoundingClientRect()
    const detail = document.querySelector('[data-panel="detail"]').getBoundingClientRect()
    const canvases = document.querySelector('.canvases').getBoundingClientRect()
    const footer = document.querySelector('.footer').getBoundingClientRect()
    return {
      railW: Math.round(rail.width),
      mainW: Math.round(main.width),
      detailW: Math.round(detail.width),
      canvasH: Math.round(canvases.height),
      footerH: Math.round(footer.height),
      canvasShare: Number((canvases.height / main.height).toFixed(3)),
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
