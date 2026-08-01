import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual + geometry verification for the map patch workspace ("本次改动").
 *
 * Drives the real product path in the browser dev mock: creates a project,
 * adds an EditMap patch from project content, then exercises the change-card
 * panel — card typography and alignment, the preview-mode switch, the add
 * panel exclusivity rule, and the notification-based error path (the file
 * picker's host dialog does not exist in the browser, so the import failure
 * arrives as a toast). Runs light and dark at 1680 and 1440. Screenshots land
 * in the system temp dir unless overridden via MODFORGE_MAP_PATCH_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_MAP_PATCH_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-map-patch-ui')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

async function main() {
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const failures = []
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`))

  async function skipGuides() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) return
      await skip.first().click()
      await page.waitForTimeout(400)
    }
  }

  try {
    let opened = null
    for (const url of process.env.MODFORGE_MAP_PATCH_URL ? [process.env.MODFORGE_MAP_PATCH_URL] : fallbackUrls) {
      try {
        await page.goto(`${url}${mockQuery}`, { waitUntil: 'domcontentloaded', timeout: 12_000 })
        await page.waitForSelector('.launcher-shell', { state: 'visible', timeout: 45_000 })
        opened = url
        break
      } catch {
        opened = null
      }
    }
    if (!opened) throw new Error('No dev server responded on the candidate ports')

    await page.getByRole('button', { name: '工作台' }).click()
    await page.waitForSelector('.workbench-shell-body', { state: 'visible', timeout: 60_000 })
    await skipGuides()

    // 1. Create a project through the real product path.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Map Patch UI Verify')
    await projectFields.nth(1).fill('Arbor.MapPatchUiVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

    // 2. The dev mock serves two vanilla maps; clicking one in the map catalog
    //    creates (or reuses) its EditMap patch through the real product path and
    //    opens the patch editor.
    await page.locator('.workbench-side-nav-item[data-tip="地图制作"]').first().click()
    await page.waitForSelector('.map-catalog', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('.map-catalog-card', { hasText: 'Town' }).first().click()
    await page.waitForSelector('.map-patch-page', { state: 'visible', timeout: 20_000 })
    await skipGuides()

    // 3. Toolbar: target name uses a class (no inline styles) and the preview
    //    switch defaults to 结果.
    if ((await page.locator('.map-patch-target-name').count()) !== 1) failures.push('canvas toolbar is missing the styled target name')
    const switchLabels = await page.locator('.map-patch-preview-switch button').allInnerTexts()
    if (switchLabels.join(',') !== '之前,结果,差异') failures.push(`preview switch labels changed: ${switchLabels.join(',')}`)
    const activeSwitch = await page.locator('.map-patch-preview-switch button.is-active').innerText()
    if (activeSwitch !== '结果') failures.push(`preview switch should default to 结果, got ${activeSwitch}`)
    const switchFont = await page
      .locator('.map-patch-preview-switch button')
      .first()
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    if (switchFont < 11) failures.push(`preview switch font too small (${switchFont}px)`)

    // 4. The mock cannot load the game map; the canvas shows its load state,
    //    never an inline banner.
    if ((await page.locator('.map-patch-inline-error').count()) !== 0)
      failures.push('inline error banner leaked back into the patch editor')

    // 5. Add one card of each type through the add panel; the file card stays exclusive.
    const addPanel = async (label) => {
      await page.locator('.map-patch-add-btn').click()
      await page.locator('.map-patch-type-option', { hasText: label }).first().click()
      await page.waitForTimeout(300)
    }
    await addPanel('从源地图复制')
    await addPanel('修改图块')
    await addPanel('修改地图属性')
    const cardCount = await page.locator('.change-card').count()
    if (cardCount !== 3) failures.push(`expected 3 change cards, found ${cardCount}`)

    // File card exclusivity: its type option is disabled in the add panel.
    await page.locator('.map-patch-add-btn').click()
    const fileOption = page.locator('.map-patch-type-option', { hasText: '从源地图复制' }).first()
    if (!(await fileOption.isDisabled())) failures.push('file card type option should be disabled once a file card exists')
    await page.keyboard.press('Escape')
    await page.locator('.map-patch-add-btn').click()

    // 6. Card typography and geometry: statuses readable, rows aligned, no overflow.
    const cardMetrics = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.change-card')]
      const status = document.querySelector('.change-card .card-status')
      const scroll = document.querySelector('.map-patch-cards-scroll')
      return {
        statusFontSize: status ? Number.parseFloat(getComputedStyle(status).fontSize) : 0,
        lefts: [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left)))],
        horizontalOverflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
        headerCountFont: (() => {
          const count = document.querySelector('.map-patch-cards-header .count')
          return count ? Number.parseFloat(getComputedStyle(count).fontSize) : 0
        })(),
      }
    })
    if (cardMetrics.statusFontSize < 11) failures.push(`card status font too small (${cardMetrics.statusFontSize}px)`)
    if (cardMetrics.headerCountFont < 11) failures.push(`cards header count font too small (${cardMetrics.headerCountFont}px)`)
    if (cardMetrics.lefts.length !== 1) failures.push(`change cards are not left-aligned (distinct lefts: ${cardMetrics.lefts.join(',')})`)
    if (cardMetrics.horizontalOverflow > 1) failures.push(`cards panel overflows horizontally by ${cardMetrics.horizontalOverflow}px`)
    await page.screenshot({ path: `${screenshotDir}/01-cards-1680.png` })

    // 7. Error path: the browser has no native file dialog, so the import
    //    failure must arrive as a notification, not an inline error.
    const fileCard = page.locator('.change-card', { hasText: '从源地图复制' }).first()
    await fileCard.getByRole('button', { name: '导入地图素材' }).click()
    const importToast = page.locator('.notification-toast-title', { hasText: '导入地图素材失败' })
    await importToast.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null)
    if ((await importToast.count()) === 0) failures.push('map import failure did not surface through the notification system')
    if ((await fileCard.locator('.map-patch-inline-error').count()) !== 0)
      failures.push('import failure rendered an inline error inside the card')
    await page.screenshot({ path: `${screenshotDir}/02-error-toast.png` })

    // 8. Collapse/expand keeps card headers single-row.
    await page.locator('.change-card .change-card-toggle').first().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${screenshotDir}/03-collapsed-1680.png` })

    // 9. Narrow desktop width and dark theme.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${screenshotDir}/04-cards-1440.png` })
    await page.setViewportSize({ width: 1680, height: 1000 })
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${screenshotDir}/05-cards-dark-1680.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`map patch UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`map patch UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
