import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * GSQ builder mount check: opens the GameStateQuery builder standalone (mail
 * trigger) and asserts it renders with real surfaces (opaque panels, visible
 * borders) instead of the transparent scatter from the portal-inheritance bug.
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_GSQ_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-gsq-mount')
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

    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('GSQ Verify')
    await projectFields.nth(1).fill('Arbor.GsqVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    await page.locator('.workbench-side-nav-item', { hasText: '邮件制作' }).first().click()
    await page.waitForTimeout(1200)
    await skipGuides()
    await page.getByRole('button', { name: '新建信件' }).first().click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '添加触发', exact: true }).first().click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '条件构建器' }).first().click()
    await page.waitForSelector('.game-state-query-stack', { state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(600)

    // The portal-inheritance bug left the modal fully transparent; assert the
    // modal panel and its docks now paint real surfaces and borders.
    const modalBg = await page.locator('.game-state-query-modal').evaluate((node) => getComputedStyle(node).backgroundColor)
    const modalBorder = await page.locator('.game-state-query-modal').evaluate((node) => getComputedStyle(node).borderTopColor)
    const transparent = (color) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent'
    if (transparent(modalBg)) failures.push(`GSQ modal background is still transparent (${modalBg})`)
    if (transparent(modalBorder)) failures.push(`GSQ modal border is still transparent (${modalBorder})`)
    const chainDockBg = await page.locator('.game-state-query-chain-dock').evaluate((node) => getComputedStyle(node).backgroundColor)
    if (transparent(chainDockBg)) failures.push(`GSQ chain dock background is still transparent (${chainDockBg})`)

    await page.screenshot({ path: `${screenshotDir}/01-gsq-standalone.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`GSQ mount check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`GSQ mount check passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
