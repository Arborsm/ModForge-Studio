import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Compat plugin page verification: opens the workbench, navigates to the
 * Alternative Textures compat plugin page, and asserts:
 *  - The AT navigation item appears in the tools section
 *  - The page opens and renders the schema-driven form framework
 *  - The entry list sidebar or empty/loading state is visible
 *  - The trust notice or panel frame is present
 * Screenshots are archived for manual review.
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_COMPAT_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-compat-plugin-page')
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

  async function waitOverlayGone() {
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
  }

  try {
    let opened = null
    for (const url of fallbackUrls) {
      try {
        await page.goto(`${url}${mockQuery}`, { waitUntil: 'domcontentloaded', timeout: 12_000 })
        await page.waitForSelector('.launcher-shell', { state: 'visible', timeout: 45_000 })
        opened = url
        break
      } catch {
        opened = null
      }
    }
    if (!opened) throw new Error('No dev server responded')

    await page.getByRole('button', { name: '工作台' }).click()
    await page.waitForSelector('.workbench-shell-body', { state: 'visible', timeout: 60_000 })
    await skipGuides()

    // Create a project so the workbench is in an active state
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('AT Verify')
    await projectFields.nth(1).fill('Arbor.AtVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    // Navigate to the AT compat plugin page via the tools section nav
    // The AT plugin page label comes from the plugin i18n bundle: "Alternative Textures"
    const atNavItem = page.locator('.workbench-side-nav-item', { hasText: /Alternative Textures/ }).first()
    if ((await atNavItem.count()) === 0) {
      failures.push('AT compat plugin navigation item not found in workbench side nav')
    } else {
      await atNavItem.click()
      await page.waitForTimeout(1500)
      await skipGuides()

      // Assert the page framework rendered: either the entry list sidebar,
      // the empty state card, or the loading state should be visible
      const hasEntryList = (await page.locator('.compat-entry-list').count()) > 0
      const hasEmptyState = (await page.locator('.empty-state-card-fill').count()) > 0
      const hasPanelFrame = (await page.locator('.panel-frame').count()) > 0

      if (!hasEntryList && !hasEmptyState && !hasPanelFrame) {
        failures.push('AT page did not render any expected UI container (entry list, empty state, or panel frame)')
      }

      // If the entry list is visible, assert it has the panel frame structure
      if (hasEntryList) {
        const entryListTitle = await page.locator('.panel-frame-title').first().textContent()
        if (!entryListTitle) {
          failures.push('AT entry list panel frame has no title text')
        }
      }

      await page.screenshot({ path: `${screenshotDir}/01-at-plugin-page.png` })

      // Navigate to the plugin manager page to verify it renders
      const pluginManagerNav = page.locator('.workbench-side-nav-item', { hasText: /插件管理|Plugin manager/ }).first()
      if ((await pluginManagerNav.count()) === 0) {
        failures.push('Plugin manager navigation item not found in workbench side nav')
      } else {
        await pluginManagerNav.click()
        await page.waitForTimeout(1500)

        const hasPluginManagerPanel = (await page.locator('.plugin-manager-list').count()) > 0 ||
          (await page.locator('.empty-state-card-fill').count()) > 0
        if (!hasPluginManagerPanel) {
          failures.push('Plugin manager page did not render plugin list or empty state')
        }

        // Assert the trust notice is present (code-pack plugins run in full-trust mode)
        const hasTrustNotice = (await page.locator('.plugin-manager-trust-notice').count()) > 0
        if (!hasTrustNotice) {
          failures.push('Plugin manager trust notice is not visible')
        }

        await page.screenshot({ path: `${screenshotDir}/02-plugin-manager.png` })
      }
    }
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`Compat plugin page check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`Compat plugin page check passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
