import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the launcher mod detail AI translation loading motion:
 * the per-field fade-in animation (throttled stream commits) and the
 * determinate progress ring around the translate icon.
 *
 * Prereq: a dev server on one of the candidate ports (`vp run dev`) and a
 * Chromium/Chrome binary. The launcher mock streams translation content when
 * `mfLauncherAiStream=1` is set, regardless of the profile's stream flag.
 *
 * Screenshots land in the system temp dir unless overridden via
 * MODFORGE_LAUNCHER_AI_SCREENSHOT_DIR.
 */

const fallbackUrls = [
  'http://127.0.0.1:5173/?mfLauncherMock=1&mfLauncherAiStream=1',
  'http://127.0.0.1:5174/?mfLauncherMock=1&mfLauncherAiStream=1',
  'http://127.0.0.1:5175/?mfLauncherMock=1&mfLauncherAiStream=1',
  'http://127.0.0.1:5176/?mfLauncherMock=1&mfLauncherAiStream=1',
]
const screenshotDir = process.env.MODFORGE_LAUNCHER_AI_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-launcher-ai-translation')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

async function main() {
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const failures = []
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`))

  /** Repeats a live check until it returns truthy or the timeout elapses. */
  async function waitFor(check, label, timeout = 20_000) {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
      last = await check()
      if (last) return last
      await page.waitForTimeout(120)
    }
    throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`)
  }

  async function skipGuides() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) return
      await skip.first().click()
      await page.waitForTimeout(400)
    }
  }

  /** Reads live ring/streaming facts from the open mod detail panel. */
  async function readStreamingState() {
    return page.evaluate(() => {
      const ring = document.querySelector('.launcher-mod-detail-ai-ring')
      const arc = document.querySelector('.launcher-mod-detail-ai-ring-arc')
      const hero = document.querySelector('.launcher-mod-detail-hero-summary')
      const description = document.querySelector('.launcher-mod-detail-description')
      const changelog = document.querySelector('.launcher-mod-detail-changelog-list')
      const heroBbcode = hero?.querySelector('.nexusmods-bbcode')
      const heroText = heroBbcode?.textContent ?? ''
      return {
        ringVisible: Boolean(ring),
        ringLeaving: ring?.classList.contains('is-leaving') ?? false,
        indeterminate: arc?.classList.contains('is-indeterminate') ?? false,
        // Indeterminate arcs have no stroke-dashoffset attribute; keep null
        // instead of falling back to 0 so determinate progress reads correctly.
        dashoffset: arc?.hasAttribute('stroke-dashoffset') ? Number.parseFloat(arc.getAttribute('stroke-dashoffset')) : null,
        streamingHero: hero?.classList.contains('is-ai-streaming') ?? false,
        streamingDescription: description?.classList.contains('is-ai-streaming') ?? false,
        streamingChangelog: changelog?.classList.contains('is-ai-streaming') ?? false,
        heroAnimation: heroBbcode ? getComputedStyle(heroBbcode).animationName : null,
        heroText: heroText.slice(0, 60),
        modeButtons: document.querySelectorAll('.launcher-mod-detail-ai-mode button').length,
      }
    })
  }

  try {
    let opened = null
    for (const url of process.env.MODFORGE_LAUNCHER_AI_URL ? [process.env.MODFORGE_LAUNCHER_AI_URL] : fallbackUrls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 })
        await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 30_000 })
        opened = url
        break
      } catch {
        opened = null
      }
    }
    if (!opened) throw new Error('No dev server responded on the candidate ports')

    await skipGuides()

    // 1. Open the first Nexus mock mod (modId 20001 → rich bbcode + changelog).
    const firstCard = page.locator('.launcher-mod-card').first()
    await firstCard.waitFor({ state: 'visible', timeout: 10_000 })
    await firstCard.locator('.launcher-mod-card-main').click()
    await page.waitForSelector('.launcher-mod-detail-panel', { state: 'visible', timeout: 10_000 })
    await skipGuides()
    await waitFor(
      () =>
        page
          .locator('.launcher-mod-detail-tabs [role="tab"]')
          .filter({ hasText: /Changelog|更新日志/ })
          .count()
          .then((count) => count > 0),
      'changelog tab (remote detail loaded)',
      20_000,
    )

    // 2. Wait for the corpus warmup to finish so the translate button is enabled.
    const translateButton = page.locator('.launcher-mod-detail-ai-tools button[aria-label="AI Translate"]').first()
    await waitFor(() => translateButton.count().then((count) => count > 0), 'AI translate button', 20_000)

    // 3. Start the translation and sample the loading motion as items stream in.
    await translateButton.click()
    const started = await waitFor(() => readStreamingState().then((state) => (state.ringVisible ? state : null)), 'progress ring', 10_000)
    const samples = []
    for (let index = 0; index < 6; index += 1) {
      const state = await readStreamingState()
      samples.push(state)
      await page.screenshot({ path: path.join(screenshotDir, `stream-${index}.png`), fullPage: false })
      await page.waitForTimeout(350)
    }
    console.log(
      'samples:',
      JSON.stringify(
        samples.map((s) => ({ ring: s.ringVisible, indet: s.indeterminate, offset: s.dashoffset, hero: s.heroText.slice(0, 24) })),
      ),
    )
    const dashoffsets = samples.filter((sample) => sample.dashoffset !== null).map((sample) => sample.dashoffset)
    if (dashoffsets.length < 2) {
      failures.push(`expected determinate ring samples, got: ${JSON.stringify(samples.map((s) => s.indeterminate))}`)
    } else if (dashoffsets[dashoffsets.length - 1] >= dashoffsets[0]) {
      failures.push(`ring progress did not advance (dashoffset ${dashoffsets[0]} → ${dashoffsets[dashoffsets.length - 1]})`)
    }
    if (!samples.some((sample) => sample.streamingHero)) {
      failures.push('hero summary never entered the streaming gate (.is-ai-streaming)')
    }
    if (started.indeterminate && samples.every((sample) => sample.indeterminate)) {
      failures.push('ring stayed indeterminate for the whole sample window (expected a determinate arc mid-stream)')
    }

    // 4. Completion: ring fades out and the mode toggle takes over.
    await waitFor(
      () => readStreamingState().then((state) => state.modeButtons >= 2 && !state.ringVisible),
      'translation completion (mode toggle visible, ring gone)',
      25_000,
    )
    await page.screenshot({ path: path.join(screenshotDir, 'settled.png'), fullPage: false })
    const settled = await readStreamingState()
    if (!settled.heroText.includes('AI/en · ')) {
      failures.push('expected the finished translation text to be applied in the hero summary')
    }

    // 5. Changelog tab: switching tabs triggers the deferred remote files
    //    fetch, which extends the changelog and therefore changes the
    //    translation source — the finished translation is reset (cache miss)
    //    and the panel returns to the translate button. Click it to re-stream;
    //    newly completed changelog lines animate in.
    await page
      .locator('.launcher-mod-detail-tabs [role="tab"]')
      .filter({ hasText: /Changelog|更新日志/ })
      .click()
    await page.waitForSelector('.launcher-mod-detail-changelog-list', { state: 'visible', timeout: 10_000 })
    console.log('step5: changelog tab ready, waiting for translate button')
    const translateAfterTab = page.locator('.launcher-mod-detail-ai-tools button[aria-label="AI Translate"]')
    await waitFor(() => translateAfterTab.count().then((count) => count > 0), 'AI translate button (changelog tab)', 10_000)
    await translateAfterTab.first().click({ timeout: 8_000 })
    console.log('step5: translate clicked')
    await waitFor(() => readStreamingState().then((state) => state.streamingChangelog), 'changelog streaming gate', 10_000)
    // The changelog lines complete last in the stream; wait until a line
    // actually remounted with the enter animation before reading it.
    const changelogLineAnimation = await waitFor(
      () =>
        page
          .evaluate(() => {
            const line = document.querySelector('.launcher-mod-detail-changelog-entry li')
            return line ? getComputedStyle(line).animationName : null
          })
          .then((name) => (name === 'modforge-field-enter' ? name : null)),
      'changelog line enter animation',
      15_000,
    )
    if (changelogLineAnimation !== 'modforge-field-enter') {
      failures.push(`expected changelog lines to animate with modforge-field-enter, got ${changelogLineAnimation}`)
    }
    await page.screenshot({ path: path.join(screenshotDir, 'changelog-streaming.png'), fullPage: false })
    await waitFor(() => readStreamingState().then((state) => !state.ringVisible), 'refresh settle (ring gone)', 25_000)
    await page.screenshot({ path: path.join(screenshotDir, 'changelog-settled.png'), fullPage: false })

    // 6. Reduced motion: re-open the detail. The files-aware remote detail is
    //    already resolved (no re-fetch), so the translation from step 5
    //    persists and the refresh button is available; stream once more and
    //    confirm the enter/ring animations are disabled via CSS.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.launcher-mod-detail-close-button').last().click({ timeout: 8_000 })
    console.log('step6: closed')
    await page.waitForTimeout(300)
    await firstCard.locator('.launcher-mod-card-main').click()
    console.log('step6: reopened card, waiting for refresh button')
    const refreshReopen = page.locator('.launcher-mod-detail-ai-tools button[aria-label="Refresh translation"]')
    await waitFor(() => refreshReopen.count().then((count) => count > 0), 'AI refresh button (reduced motion)', 20_000)
    await refreshReopen.first().click({ timeout: 8_000 })
    console.log('step6: refresh clicked')
    await waitFor(() => readStreamingState().then((state) => state.streamingHero), 'streaming gate (reduced motion)', 10_000)
    const reducedMotionStyles = await page.evaluate(() => {
      const hero = document.querySelector('.launcher-mod-detail-hero-summary .nexusmods-bbcode')
      const ring = document.querySelector('.launcher-mod-detail-ai-ring-arc')
      return {
        heroAnimation: hero ? getComputedStyle(hero).animationName : null,
        ringAnimation: ring ? getComputedStyle(ring).animationName : null,
      }
    })
    if (reducedMotionStyles.heroAnimation !== 'none') {
      failures.push(`reduced motion did not disable the field enter animation (got ${reducedMotionStyles.heroAnimation})`)
    }
    if (reducedMotionStyles.ringAnimation !== 'none') {
      failures.push(`reduced motion did not disable the ring spin (got ${reducedMotionStyles.ringAnimation})`)
    }
    await page.screenshot({ path: path.join(screenshotDir, 'reduced-motion-streaming.png'), fullPage: false })
    await waitFor(
      () => readStreamingState().then((state) => state.modeButtons >= 2 && !state.ringVisible),
      'completion (reduced motion)',
      25_000,
    )
    await page.screenshot({ path: path.join(screenshotDir, 'reduced-motion-settled.png'), fullPage: false })

    console.log(`Screenshots written to ${screenshotDir}`)
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`launcher-ai-translation verify FAILED (${failures.length}):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
  } else {
    console.log('launcher-ai-translation verify PASSED')
  }
}

main()
