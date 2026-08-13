import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Translation bootstrap check: a fresh draft has no i18n files, so the
 * project-translation page must offer the bootstrap card; generating creates
 * default.json and hands over to the normal workflow.
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_I18N_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-i18n-bootstrap')
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

    // The NPC template seeds text-free singleton patches; adding one dialogue
    // line gives the extractor something to find.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('I18n Verify')
    await projectFields.nth(1).fill('Arbor.I18nVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    // 1. Bootstrap card appears instead of the broken empty workflow.
    await page.locator('.workbench-side-nav-item', { hasText: '项目翻译' }).first().click()
    await page.waitForTimeout(1500)
    await skipGuides()
    const bootstrapText = await page.locator('body').innerText()
    if (!bootstrapText.includes('还没有翻译文件')) failures.push('bootstrap card did not appear for a fresh draft')
    if (bootstrapText.includes('准备这次翻译')) failures.push('the broken empty workflow rendered instead of the bootstrap card')
    await page.screenshot({ path: `${screenshotDir}/01-bootstrap-card.png` })

    // 2. Generate: default.json is created and the normal workflow takes over.
    await page.getByRole('button', { name: '从项目内容生成默认语言条目' }).first().click()
    await page.waitForTimeout(2000)
    const workflowText = await page.locator('body').innerText()
    if (!workflowText.includes('准备这次翻译')) failures.push('the workflow did not appear after bootstrap')
    if (!workflowText.includes('默认语言 (default.json)')) failures.push('the source dropdown lacks the friendly default-locale label')
    await page.screenshot({ path: `${screenshotDir}/02-workflow-after-bootstrap.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`i18n bootstrap check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`i18n bootstrap check passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
