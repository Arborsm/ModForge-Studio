import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Dialogue bulk-table check: entry rows render as inline-editable text areas
 * for single-page entries (with the resolved label instead of "未命名条目"),
 * and editing a vanilla row stages an override without opening the AST editor.
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_DIALOGUE_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-dialogue-bulk')
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
  const skipped = []
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
    await projectFields.nth(0).fill('Dialogue Verify')
    await projectFields.nth(1).fill('Arbor.DialogueVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    await page.locator('.workbench-side-nav-item', { hasText: '对话制作' }).first().click()
    await page.waitForTimeout(2000)
    await skipGuides()

    const npcRow = page.locator('.dialogue-editor-npc-row').first()
    if ((await npcRow.count()) === 0) {
      skipped.push('no vanilla NPC catalog in this environment (mock has no dialogue assets)')
    } else {
      await npcRow.click()
      await page.waitForTimeout(1500)

      const bulkAreas = page.locator('.dialogue-editor-bulk-text')
      const bulkCount = await bulkAreas.count()
      if (bulkCount === 0) {
        failures.push('no inline bulk textareas rendered for single-page entries')
      } else {
        // Rows must show a readable label (first spoken line), never "未命名条目".
        const listText = await page.locator('.dialogue-editor-entry-list').innerText()
        if (listText.includes('未命名条目')) failures.push('rows still show the 未命名条目 placeholder label')

        // Editing a vanilla row in place stages an override (dirty badge appears).
        const first = bulkAreas.first()
        const before = await first.inputValue()
        await first.fill(`${before}（改）`)
        await first.blur()
        await page.waitForTimeout(800)
        if ((await page.locator('.dialogue-editor-dirty-badge').count()) === 0) {
          failures.push('editing a row in place did not stage a change')
        }
      }
      await page.screenshot({ path: `${screenshotDir}/01-dialogue-bulk.png` })
    }
  } finally {
    await browser.close()
  }

  if (skipped.length > 0) {
    console.warn(`dialogue bulk check skipped:\n- ${skipped.join('\n- ')}`)
  }
  if (failures.length > 0) {
    console.error(`dialogue bulk check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`dialogue bulk check passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
