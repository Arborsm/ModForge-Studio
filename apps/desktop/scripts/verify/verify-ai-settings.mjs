import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the AI settings panel refactor.
 *
 * Opens the settings window with the dev mock, switches to the generative AI
 * tab and verifies the reworked profile editor:
 *   - identity row (name / provider preset / protocol) on one line
 *   - fill-in order: base URL -> credentials -> model -> context window
 *   - model rendered as the app CompactSelect with icon actions (refresh,
 *     models.dev import); no native <select> anywhere in the editor
 *   - API key row keeps only the field label + clear-key icon (no source tag)
 *   - field hints live on the label row (top right), including max batch bytes
 *   - advanced section owns the insecure-HTTP switch and keeps its warning
 *   - machine-translation provider also uses CompactSelect
 * Screenshots land in the system temp dir unless overridden via
 * MODFORGE_AI_SETTINGS_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfSettingsMock=1&mfOpenSettings=ai'
const screenshotDir = process.env.MODFORGE_AI_SETTINGS_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-ai-settings')
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

  try {
    let opened = null
    for (const url of process.env.MODFORGE_AI_SETTINGS_URL ? [process.env.MODFORGE_AI_SETTINGS_URL] : fallbackUrls) {
      try {
        await page.goto(`${url}${mockQuery}`, { waitUntil: 'domcontentloaded', timeout: 12_000 })
        await page.waitForSelector('.settings-window-panel', { state: 'visible', timeout: 45_000 })
        opened = url
        break
      } catch {
        opened = null
      }
    }
    if (!opened) throw new Error('No dev server responded on the candidate ports')

    // The mock opens the AI category on the engine tab; move to generative.
    await page.click('#ai-settings-tab-generative')
    await page.waitForSelector('.settings-ai-profile-detail', { state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(800)

    // 1. Field order: identity row first, then base URL, credentials, model, context window.
    const fieldOrder = await page.evaluate(() => {
      const grid = document.querySelector('.settings-ai-grid-generative')
      if (!grid) return []
      const out = []
      for (const label of grid.querySelectorAll(':scope > div label, :scope > label')) {
        const head = label.querySelector(':scope > span.settings-ai-field-head > span')
        const plain = label.querySelector(':scope > span')
        const text = (head ?? plain)?.textContent?.trim()
        if (text) out.push(text)
      }
      return out
    })
    const expectedOrder = ['档案名称', '供应商预设', '协议', 'Base URL', 'API Key', '环境变量', '模型', '上下文窗口（Tokens）']
    if (fieldOrder.join('|') !== expectedOrder.join('|')) {
      failures.push(`generative field order mismatch:\n  actual:   ${fieldOrder.join(' | ')}\n  expected: ${expectedOrder.join(' | ')}`)
    }

    // 2. Identity row groups the three identity fields on one line.
    const identityLabels = await page.locator('.settings-ai-grid-identity label').count()
    if (identityLabels !== 3) failures.push(`expected 3 identity-row labels, found ${identityLabels}`)

    // 3. Model field is a CompactSelect with two icon actions; no native select remains.
    const nativeSelects = await page.locator('.settings-ai-profile-detail select').count()
    if (nativeSelects !== 0) failures.push(`expected no native <select> in the profile editor, found ${nativeSelects}`)
    const modelLabel = page.locator('.settings-ai-grid-generative label').filter({ hasText: '模型' }).first()
    const modelCompactSelect = await modelLabel.locator('.compact-select').count()
    const modelIconButtons = await modelLabel.locator('.settings-ai-inline-field .settings-ai-icon-btn').count()
    if (modelCompactSelect !== 1) failures.push(`model field is missing the app select (found ${modelCompactSelect})`)
    if (modelIconButtons !== 2) failures.push(`model field should have 2 icon buttons, found ${modelIconButtons}`)

    // 4. API key row: label + clear-key icon only, no credential-source tag.
    const apiKeyTagCount = await page
      .locator('.settings-ai-grid-generative label')
      .filter({ hasText: 'API Key' })
      .first()
      .locator('.settings-ai-tag')
      .count()
    if (apiKeyTagCount !== 0) failures.push(`API key row still renders a credential tag (${apiKeyTagCount})`)

    // 5. Field hints sit on the label row (top right) for context window.
    const contextHintInHead = await page.evaluate(() => {
      const grid = document.querySelector('.settings-ai-grid-generative')
      const labels = [...grid.querySelectorAll('label')]
      const contextLabel = labels.find((label) => label.textContent?.includes('上下文窗口'))
      return Boolean(contextLabel?.querySelector(':scope > .settings-ai-field-head .settings-ai-field-hint'))
    })
    if (!contextHintInHead) failures.push('context window hint is not on the label row')

    await page.screenshot({ path: `${screenshotDir}/01-generative-editor-light.png` })

    // 6. Refresh the model list, then open the dropdown to prove it is the app
    //    select with a real option list.
    await modelLabel.locator('.settings-ai-inline-field .settings-ai-icon-btn').first().click()
    await page.waitForTimeout(1200)
    await modelLabel.locator('.compact-select__trigger').click()
    await page.waitForSelector('.settings-ai-grid-select-menu', { state: 'visible', timeout: 5_000 })
    await page.waitForTimeout(300)
    const modelOptionCount = await page.locator('.settings-ai-grid-select-menu .compact-select__option').count()
    if (modelOptionCount < 2) failures.push(`model select menu should list loaded models, found ${modelOptionCount}`)
    await page.screenshot({ path: `${screenshotDir}/02-model-select-open.png` })
    // Close the dropdown by clicking outside: Escape would close the whole
    // settings window (SettingsWindow owns the Escape key).
    await page.locator('.settings-ai-profile-detail-head h3').first().click()
    await page.waitForTimeout(300)

    // 7. Expand advanced parameters: hint on label row + insecure-HTTP switch inside.
    await page.locator('.settings-ai-advanced-toggle').click()
    await page.waitForSelector('.settings-ai-advanced-grid', { state: 'visible', timeout: 5_000 })
    await page.waitForTimeout(300)
    const maxBatchHintInHead = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.settings-ai-advanced-grid label')]
      const batchLabel = labels.find((label) => label.textContent?.includes('最大字节数') || label.textContent?.includes('batch bytes'))
      if (!batchLabel) return false
      const head = batchLabel.querySelector(':scope > .settings-ai-field-head')
      return Boolean(head && head.querySelector('.settings-ai-field-hint'))
    })
    if (!maxBatchHintInHead) failures.push('max batch bytes hint is not on its label row inside advanced params')
    const insecureRow = await page.locator('.settings-ai-advanced-grid .settings-ai-insecure-row').count()
    if (insecureRow !== 1) failures.push(`expected insecure-HTTP switch inside advanced params, found ${insecureRow}`)
    await page.locator('.settings-ai-insecure-row').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${screenshotDir}/03-advanced-expanded-light.png` })

    // 8. Turn on insecure HTTP and confirm the warning copy stays.
    await page.locator('.settings-ai-insecure-row button[role="switch"]').click()
    await page.waitForTimeout(300)
    const warningText = await page
      .locator('.settings-ai-insecure-warning')
      .innerText()
      .catch(() => '')
    if (!warningText.includes('警告')) failures.push('insecure-HTTP warning copy is missing after enabling the switch')
    await page.locator('.settings-ai-insecure-warning').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${screenshotDir}/04-insecure-http-warning.png` })
    // Restore the clean state so later tab switches are not blocked by the
    // unsaved-changes confirmation dialog.
    await page.locator('.settings-ai-insecure-row button[role="switch"]').click()
    await page.waitForTimeout(200)

    // 9. Dark theme keeps the reworked editor readable.
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      document.documentElement.dataset.theme = 'twilight'
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${screenshotDir}/05-generative-editor-dark.png` })

    // 10. Machine-translation profile editor uses CompactSelect for the provider.
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await page.click('#ai-settings-tab-machine-translation')
    await page.waitForSelector('.settings-mt-workspace .settings-ai-profile-detail', { state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(500)
    const mtDetail = page.locator('.settings-mt-workspace .settings-ai-profile-detail')
    const mtNativeSelects = await mtDetail.locator('select').count()
    const mtCompactSelects = await mtDetail.locator('.compact-select').count()
    if (mtNativeSelects !== 0) failures.push(`MT provider still uses a native <select> (${mtNativeSelects})`)
    if (mtCompactSelects !== 1) failures.push(`MT provider is missing the app select (found ${mtCompactSelects})`)
    await page.screenshot({ path: `${screenshotDir}/06-mt-provider-select.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`AI settings verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`AI settings verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
