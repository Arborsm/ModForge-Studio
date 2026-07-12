import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'map-workspace-mock.html')
const shotBrowse = join(__dirname, 'map-workspace-mock.png')
const shotEdit = join(__dirname, 'map-workspace-edit-mock.png')
const shotLocked = join(__dirname, 'map-workspace-edit-locked-mock.png')

const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function measureBrowse(page) {
  return page.evaluate(() => {
    const browser = document.querySelector('[data-panel="browser"]')?.getBoundingClientRect()
    const viewport = document.querySelector('[data-panel="viewport"]')?.getBoundingClientRect()
    const detail = document.querySelector('[data-panel="detail"]')?.getBoundingClientRect()
    const dividers = [...document.querySelectorAll('.item-workspace-divider')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect())

    if (!browser || !viewport || !detail) {
      return { error: 'missing panels', panels: { browser: !!browser, viewport: !!viewport, detail: !!detail } }
    }

    const gap1Center = browser.right + (viewport.x - browser.right) / 2
    const gap2Center = viewport.right + (detail.x - viewport.right) / 2
    const div1Center = dividers[0] ? dividers[0].x + dividers[0].width / 2 : null
    const div2Center = dividers[1] ? dividers[1].x + dividers[1].width / 2 : null

    const title = document.querySelector('.detail-hero h2')
    return {
      mode: 'browse',
      browserW: Math.round(browser.width),
      viewportW: Math.round(viewport.width),
      detailW: Math.round(detail.width),
      gap1: Math.round(viewport.x - browser.right),
      gap2: Math.round(detail.x - viewport.right),
      divider1Offset: div1Center == null ? null : Math.abs(gap1Center - div1Center),
      divider2Offset: div2Center == null ? null : Math.abs(gap2Center - div2Center),
      titleOverflow: title ? title.scrollWidth > title.clientWidth : null,
    }
  })
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 980 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-panel="browser"]')

  console.log('browse measure', await measureBrowse(page))
  await page.screenshot({ path: shotBrowse })

  await page.click('#modeEdit')
  await page.waitForTimeout(150)
  await page.screenshot({ path: shotEdit })

  await page.click('#projectToggle')
  await page.waitForTimeout(150)
  await page.screenshot({ path: shotLocked })

  // layers tab smoke
  await page.click('#modeBrowse')
  await page.click('#projectToggle')
  await page.click('[data-detail-tab="layers"]')
  await page.waitForTimeout(100)
  const layersVisible = await page.evaluate(() => {
    const panel = document.querySelector('[data-detail-panel="layers"]')
    return panel && !panel.hidden
  })
  console.log('layers tab visible', layersVisible)

  await browser.close()
  console.log('wrote', shotBrowse)
  console.log('wrote', shotEdit)
  console.log('wrote', shotLocked)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
