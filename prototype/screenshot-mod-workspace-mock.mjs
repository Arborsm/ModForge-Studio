import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'mod-workspace-mock.html')
const shotPopulated = join(__dirname, 'mod-workspace-mock.png')
const shotEmpty = join(__dirname, 'mod-workspace-empty-mock.png')
const shotWide = join(__dirname, 'mod-workspace-mock-1680.png')

const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function measure(page) {
  return page.evaluate(() => {
    const library = document.querySelector('[data-panel="library"]')?.getBoundingClientRect()
    const detail = document.querySelector('[data-panel="detail"]')?.getBoundingClientRect()
    const divider = document.querySelector('[data-divider="library-detail"]')?.getBoundingClientRect()
    const title = document.querySelector('.detail-hero h2')

    if (!library || !detail || !divider) {
      return {
        error: 'missing panels',
        library: Boolean(library),
        detail: Boolean(detail),
        divider: Boolean(divider),
      }
    }

    const gapCenter = library.right + (detail.x - library.right) / 2
    const dividerCenter = divider.x + divider.width / 2

    return {
      libraryW: Math.round(library.width),
      detailW: Math.round(detail.width),
      gap: Math.round(detail.x - library.right),
      dividerOffset: Math.abs(gapCenter - dividerCenter),
      titleOverflow: title ? title.scrollWidth > title.clientWidth : null,
      libraryLeft: Math.round(library.left),
      detailRight: Math.round(detail.right),
    }
  })
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('[data-layout="mod-workspace"]')
  await page.waitForSelector('.mod-row.is-active, .empty-detail')

  await page.screenshot({ path: shotPopulated, fullPage: false })
  const metrics1440 = await measure(page)
  console.log('viewport 1440:', JSON.stringify(metrics1440, null, 2))
  console.log('screenshot:', shotPopulated)

  await page.setViewportSize({ width: 1680, height: 960 })
  await page.screenshot({ path: shotWide, fullPage: false })
  const metrics1680 = await measure(page)
  console.log('viewport 1680:', JSON.stringify(metrics1680, null, 2))
  console.log('screenshot:', shotWide)

  await page.click('.mock-bar [data-mock="empty-sel"]')
  await page.waitForSelector('.empty-detail')
  await page.screenshot({ path: shotEmpty, fullPage: false })
  console.log('screenshot empty:', shotEmpty)

  const offsetOk =
    metrics1440.dividerOffset != null &&
    metrics1440.dividerOffset <= 1 &&
    metrics1680.dividerOffset != null &&
    metrics1680.dividerOffset <= 1

  if (!offsetOk) {
    console.error('divider not centered (offset > 1px)')
    process.exitCode = 1
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
