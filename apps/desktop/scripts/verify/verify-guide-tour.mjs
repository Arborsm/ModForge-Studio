import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the guide tour layer.
 *
 * Starts from the launcher mock scenario, expects the library guide to
 * auto-start, walks one step forward, then skips. Also captures the settings
 * replay entry. Screenshots land in the system temp dir unless overridden via
 * MODFORGE_GUIDE_TOUR_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175/?mfLauncherMock=1', 'http://127.0.0.1:5176/?mfLauncherMock=1']
const screenshotDir = process.env.MODFORGE_GUIDE_TOUR_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-guide-tour')
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)
const executablePath = executableCandidates.find((candidate) => existsSync(candidate))

async function gotoLauncherMock(page, extraParams = '') {
  const urls = process.env.MODFORGE_GUIDE_TOUR_URL ? [process.env.MODFORGE_GUIDE_TOUR_URL] : fallbackUrls
  let lastError = null
  for (const url of urls) {
    try {
      await page.goto(`${url}${extraParams}`, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForSelector('.launcher-shell', { state: 'visible', timeout: 45_000 })
      return url
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`No launcher mock URL responded. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function main() {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const failures = []

  try {
    await gotoLauncherMock(page)

    // 1. The library guide auto-starts on first visit: backdrop + card visible.
    await page.waitForSelector('.guide-tour-backdrop', { state: 'visible', timeout: 10_000 })
    const card = page.locator('.guide-tour-card')
    await card.waitFor({ state: 'visible', timeout: 5_000 })
    const firstTitle = await page.locator('.guide-tour-card-title').textContent()
    if (!firstTitle?.trim()) failures.push('guide card title is empty on step 1')
    await page.screenshot({ path: `${screenshotDir}/01-guide-step1.png` })

    // 2. Next advances to the anchored step and shows the highlight ring.
    await page.locator('.guide-tour-btn-primary').click()
    await page.waitForSelector('.guide-tour-highlight', { state: 'visible', timeout: 5_000 })
    const counter = await page.locator('.guide-tour-card-eyebrow span').last().textContent()
    if (!counter?.includes('2')) failures.push(`expected step counter to reach 2, got "${counter}"`)
    await page.screenshot({ path: `${screenshotDir}/02-guide-step2-highlight.png` })

    // 3. The toolbar step is interactive: the Next button is hidden and clicking
    // the highlighted anchor itself advances to the pack-sidebar step. The card
    // points back at the anchor with an arrow and shows progress dots.
    await page.locator('.guide-tour-btn-primary').click() // step 2 → 3
    await page.waitForTimeout(300)
    if ((await page.locator('.guide-tour-btn-primary').count()) !== 0) {
      failures.push('interactive toolbar step should hide the Next button')
    }
    try {
      await page.waitForSelector('.guide-tour-arrow', { state: 'visible', timeout: 3_000 })
    } catch {
      failures.push('anchored step did not render the card arrow')
    }
    if ((await page.locator('.guide-tour-dot').count()) !== 6) failures.push('expected 6 progress dots on the library guide')
    await page.locator('[data-guide="launcher-library-toolbar"]').click() // step 3 → 4
    await page.waitForTimeout(300)
    const counterInteractive = await page.locator('.guide-tour-card-eyebrow span').last().textContent()
    if (!counterInteractive?.includes('4')) {
      failures.push(`expected anchor click to advance to step 4, got "${counterInteractive}"`)
    }
    try {
      await page.waitForSelector('.launcher-library-sidebar-open', { state: 'visible', timeout: 5_000 })
    } catch {
      failures.push('pack sidebar did not expand on the pack-sidebar guide step')
    }
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${screenshotDir}/03-guide-step4-sidebar.png` })

    // 4. The mod-detail step opens the detail drawer on the first visible mod.
    await page.locator('.guide-tour-btn-primary').click() // step 5: mod grid
    await page.locator('.guide-tour-btn-primary').click() // step 6: mod detail
    try {
      await page.waitForSelector('.launcher-library-drawer-open', { state: 'visible', timeout: 5_000 })
    } catch {
      failures.push('mod detail drawer did not open on the mod-detail guide step')
    }
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${screenshotDir}/04-guide-step6-mod-detail.png` })

    // 5. Previous returns to step 5, then skip dismisses the overlay.
    await page.locator('.guide-tour-btn-ghost', { hasText: /上一步|Previous/ }).click()
    await page.waitForTimeout(300)
    const counterBack = await page.locator('.guide-tour-card-eyebrow span').last().textContent()
    if (!counterBack?.includes('5')) failures.push(`expected step counter to return to 5, got "${counterBack}"`)
    await page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ }).click()
    await page.waitForSelector('.guide-tour-backdrop', { state: 'detached', timeout: 5_000 })

    // 6. Settings exposes the replay entry (per-guide rows + replay-all).
    await gotoLauncherMock(page, '&mfOpenSettings=interaction')
    await page.waitForSelector('.settings-window-panel', { state: 'visible', timeout: 10_000 })
    const replayButtons = await page.locator('.settings-window-row .settings-window-pill').count()
    if (replayButtons < 2) failures.push(`expected guide replay rows in settings, found ${replayButtons} pill buttons`)
    await page.screenshot({ path: `${screenshotDir}/05-settings-guide-replay.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`guide tour verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`guide tour verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
