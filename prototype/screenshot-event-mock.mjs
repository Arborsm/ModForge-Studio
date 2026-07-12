import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'event-workspace-mock.html')
const shotBrowse = join(__dirname, 'event-workspace-mock.png')
const shotEdit = join(__dirname, 'event-workspace-edit-mock.png')

const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function measureBrowse(page) {
  return page.evaluate(() => {
    const browser = document.querySelector('[data-panel="browser"]')?.getBoundingClientRect()
    const stage = document.querySelector('[data-panel="stage"]')?.getBoundingClientRect()
    const detail = document.querySelector('[data-panel="detail"]')?.getBoundingClientRect()
    const dividers = [...document.querySelectorAll('.item-workspace-divider')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect())

    if (!browser || !stage || !detail) {
      return { error: 'missing panels' }
    }

    const gap1Center = browser.right + (stage.x - browser.right) / 2
    const gap2Center = stage.right + (detail.x - stage.right) / 2
    const div1Center = dividers[0] ? dividers[0].x + dividers[0].width / 2 : null
    const div2Center = dividers[1] ? dividers[1].x + dividers[1].width / 2 : null

    const title = document.querySelector('.detail-hero h2')
    return {
      mode: 'browse',
      browserW: Math.round(browser.width),
      stageW: Math.round(stage.width),
      detailW: Math.round(detail.width),
      gap1: Math.round(stage.x - browser.right),
      gap2: Math.round(detail.x - stage.right),
      divider1Offset: div1Center == null ? null : Math.abs(gap1Center - div1Center),
      divider2Offset: div2Center == null ? null : Math.abs(gap2Center - div2Center),
      titleOverflow: title ? title.scrollWidth > title.clientWidth : null,
    }
  })
}

async function measureEdit(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-panel="stage"]')?.getBoundingClientRect()
    const script = document.querySelector('[data-panel="script"]')?.getBoundingClientRect()
    const divider = [...document.querySelectorAll('.item-workspace-divider')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect())[0]

    if (!stage || !script) {
      return { error: 'missing edit panels' }
    }

    const gapCenter = stage.right + (script.x - stage.right) / 2
    const divCenter = divider ? divider.x + divider.width / 2 : null

    return {
      mode: 'edit',
      stageW: Math.round(stage.width),
      scriptW: Math.round(script.width),
      gap: Math.round(script.x - stage.right),
      dividerOffset: divCenter == null ? null : Math.abs(gapCenter - divCenter),
    }
  })
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 960 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="event-workspace"]')

  await page.screenshot({ path: shotBrowse, fullPage: false })
  const browseMetrics = await measureBrowse(page)
  console.log(JSON.stringify(browseMetrics, null, 2))
  console.log('screenshot browse:', shotBrowse)

  await page.click('#modeEdit')
  await page.waitForTimeout(100)
  await page.screenshot({ path: shotEdit, fullPage: false })
  const editMetrics = await measureEdit(page)
  console.log(JSON.stringify(editMetrics, null, 2))
  console.log('screenshot edit:', shotEdit)

  // Also capture 1440 wide browse
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.click('#modeBrowse')
  await page.waitForTimeout(100)
  const shot1440 = join(__dirname, 'event-workspace-mock-1440.png')
  await page.screenshot({ path: shot1440, fullPage: false })
  const m1440 = await measureBrowse(page)
  console.log('1440 metrics:', JSON.stringify(m1440, null, 2))
  console.log('screenshot 1440:', shot1440)

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
