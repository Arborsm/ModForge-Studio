import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const fallbackUrls = [
  'http://127.0.0.1:5175/?mfPagePerfScenario=launcher-shell&mfLauncherMock=1',
  'http://127.0.0.1:5176/?mfPagePerfScenario=launcher-shell&mfLauncherMock=1',
]
const screenshotPath = process.env.MODFORGE_LAUNCHER_CUSTOM_SORT_SCREENSHOT ?? '/tmp/modforge-launcher-custom-sort.png'
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)
const executablePath = executableCandidates.find((candidate) => existsSync(candidate))
const devServerHint =
  'Start the launcher mock/perf scenario first, for example: vp run web:dev -- --host 127.0.0.1 --port 5175, then open it with ?mfPagePerfScenario=launcher-shell&mfLauncherMock=1.'

async function gotoLauncherCustomSortTarget(page) {
  const urls = process.env.MODFORGE_LAUNCHER_CUSTOM_SORT_URL ? [process.env.MODFORGE_LAUNCHER_CUSTOM_SORT_URL] : fallbackUrls
  let lastError = null
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 12_000 })
      return url
    } catch (error) {
      lastError = error
    }
  }
  const detail = lastError instanceof Error ? lastError.message : lastError == null ? 'No target URL responded.' : JSON.stringify(lastError)
  throw new Error(`No launcher custom sort target URL was available. ${devServerHint}\nLast error: ${detail}`)
}

async function selectCustomSort(page) {
  // Step 1: pick "Custom" from the sort menu — this only switches the view to
  // the persisted custom order (no banner yet).
  await page.locator('.launcher-library-sort-trigger').click()
  const customSortItem = page.locator('.launcher-library-sort-menu [role="menuitemradio"]').last()
  await customSortItem.click()
  await page.waitForTimeout(150)
  // Step 2: open the reorder banner via the dedicated "Reorder" button.
  await page.locator('.launcher-library-sort-start-action').click()
  await page.waitForSelector('.launcher-library-edit-bar--sorting', { state: 'visible', timeout: 5_000 })
  await page.waitForSelector('.launcher-library-grid-viewport-sorting', { state: 'visible', timeout: 5_000 })
}

async function visibleCenter(page, selector, index = 0) {
  const box = await page.evaluate(
    ({ selector, index }) => {
      const entries = Array.from(document.querySelectorAll(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          }
        })
        .filter((rect) => rect.width > 0 && rect.height > 0)
      const rect = entries.at(index)
      return rect
        ? {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            top: rect.y,
          }
        : null
    },
    { selector, index },
  )
  if (!box) {
    throw new Error(`Missing visible element for selector ${selector} at index ${index}`)
  }
  return box
}

async function dragCardBefore(page, sourceSelector, targetSelector, sourceIndex = 0, targetIndex = 0) {
  // Drags the source card and releases just inside the TOP edge of the target
  // card so the midpoint resolver inserts the source before the target.
  const source = await visibleCenter(page, sourceSelector, sourceIndex)
  const target = await visibleCenter(page, targetSelector, targetIndex)
  const releaseX = target.x
  const releaseY = target.top + 6
  await page.mouse.move(source.x, source.y)
  await page.mouse.down()
  for (const offset of [4, 8, 16, 24]) {
    await page.mouse.move(source.x + offset, source.y + Math.min(4, Math.ceil(offset / 6)), { steps: 2 })
    await page.waitForTimeout(70)
  }
  await page.waitForFunction(
    () =>
      document.body.classList.contains('launcher-library-dragging-active') ||
      Boolean(document.querySelector('[data-launcher-dnd-target-id]')),
    null,
    { timeout: 3_000 },
  )
  const steps = 28
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps
    await page.mouse.move(source.x + (releaseX - source.x) * t, source.y + (releaseY - source.y) * t)
    await page.waitForTimeout(8)
  }
  await page.waitForTimeout(160)
  await page.mouse.up()
  await page.waitForTimeout(250)
}

async function clickVisibleCenter(page, selector, index = 0) {
  const point = await visibleCenter(page, selector, index)
  await page.mouse.click(point.x, point.y)
}

async function scrollIntoView(page, selector, index = 0) {
  await page.evaluate(
    ({ selector, index }) => {
      const element = document.querySelectorAll(selector).item(index)
      element?.scrollIntoView({ block: 'center', inline: 'center' })
    },
    { selector, index },
  )
  await page.waitForTimeout(250)
}

async function readEvidence(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.launcher-library-grid-viewport > .launcher-library-grid .launcher-mod-card'))
      .filter((element) => !element.closest('.launcher-library-folder-panel'))
      .slice(0, 8)
      .map((element) => element.textContent?.trim() ?? '')
    const folders = Array.from(document.querySelectorAll('.launcher-library-folder-card'))
      .filter((element) => !element.closest('.launcher-library-folder-panel'))
      .map((element) => element.textContent?.trim() ?? '')
    const folderItems = Array.from(document.querySelectorAll('.launcher-library-folder-panel .launcher-library-draggable-card'))
      .slice(0, 6)
      .map((element) => element.textContent?.trim() ?? '')
    const childItems = Array.from(document.querySelectorAll('.launcher-library-modules-floating-panel .launcher-library-module-tile'))
      .slice(0, 6)
      .map((element) => element.textContent?.trim() ?? '')
    return {
      cards,
      folders,
      folderItems,
      childItems,
      sortingBannerVisible: Boolean(document.querySelector('.launcher-library-edit-bar')),
      sortingViewportActive: Boolean(document.querySelector('.launcher-library-grid-viewport-sorting')),
      customSortTriggerIconVisible: Boolean(document.querySelector('.launcher-library-sort-trigger svg')),
      wobbleAnimation: getComputedStyle(document.querySelector('.launcher-library-draggable-card')).animationName,
      customOrders: window.__modforgeLauncherCustomSortState?.customOrders ?? null,
      childModGroups: window.__modforgeLauncherCustomSortState?.childModGroups ?? null,
    }
  })
}

async function assertState(page, predicateSource, message) {
  const ok = await page.evaluate(predicateSource)
  if (!ok) {
    const evidence = await readEvidence(page).catch(() => null)
    throw new Error(`${message}\n${JSON.stringify(evidence, null, 2)}`)
  }
}

const browser = await chromium.launch({ ...(executablePath ? { executablePath } : null), headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
console.log(
  JSON.stringify({
    candidateUrls: process.env.MODFORGE_LAUNCHER_CUSTOM_SORT_URL ? [process.env.MODFORGE_LAUNCHER_CUSTOM_SORT_URL] : fallbackUrls,
    executablePath: executablePath ?? 'playwright-default',
  }),
)
await page.addInitScript(() => {
  if (window.sessionStorage.getItem('modforge.customSortSmokeStarted') !== '1') {
    window.sessionStorage.removeItem('modforge.performanceLauncherLibraryState')
    window.sessionStorage.setItem('modforge.customSortSmokeStarted', '1')
  }
})
const consoleErrors = []
let collectConsoleErrors = false
page.on('console', (msg) => {
  if (collectConsoleErrors && msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => {
  if (collectConsoleErrors) consoleErrors.push(error.message)
})

try {
  const targetUrl = await gotoLauncherCustomSortTarget(page)
  collectConsoleErrors = true
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.launcher-library-folder-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(700)

  await selectCustomSort(page)
  await assertState(
    page,
    () =>
      getComputedStyle(document.querySelector('.launcher-library-draggable-card')).animationName.includes('launcher-library-card-wobble'),
    'Custom sort mode did not enable the card wobble animation.',
  )

  // Slice 1 — root: drag folder-9 (index 1) before folder-0 (index 0).
  await dragCardBefore(page, '.launcher-library-folder-card', '.launcher-library-folder-card', 1, 0)
  await assertState(
    page,
    () => {
      const order = window.__modforgeLauncherCustomSortState?.customOrders?.['view:all'] ?? []
      return order.length > 1 && order[0] === 'f:launcher-perf-folder-9' && order.includes('f:launcher-perf-folder-0')
    },
    'Root custom order did not persist after dragging a top-level folder.',
  )

  await clickVisibleCenter(page, '[data-launcher-folder-drop-id="launcher-perf-folder-0"]')
  await page.waitForSelector('.launcher-library-folder-panel', { state: 'visible', timeout: 3_000 })
  // Slice 2 — folder interior: drag the second item before the first.
  await dragCardBefore(
    page,
    '.launcher-library-folder-panel .launcher-library-draggable-card:has(.launcher-mod-card)',
    '.launcher-library-folder-panel .launcher-library-draggable-card:has(.launcher-mod-card)',
    1,
    0,
  )
  await assertState(
    page,
    () => {
      const order = window.__modforgeLauncherCustomSortState?.customOrders?.['folder:launcher-perf-folder-0'] ?? []
      return order.length > 1 && order[0]?.startsWith('m:') && order.some((value) => value === 'f:launcher-perf-folder-nested')
    },
    'Folder custom order did not persist after dragging inside an expanded folder.',
  )

  await scrollIntoView(page, '.launcher-mod-card-child-count')
  await clickVisibleCenter(page, '.launcher-mod-card-child-count')
  await page.waitForSelector('.launcher-library-modules-floating-panel', { state: 'visible', timeout: 3_000 })
  // Slice 3 — child mods: drag the second tile before the first.
  await dragCardBefore(
    page,
    '.launcher-library-modules-floating-panel .launcher-library-module-tile',
    '.launcher-library-modules-floating-panel .launcher-library-module-tile',
    1,
    0,
  )
  await assertState(
    page,
    () => {
      const group = window.__modforgeLauncherCustomSortState?.childModGroups?.find(
        (entry) => entry.parentModKey === 'ModForge.Performance.112',
      )
      return Array.isArray(group?.childModKeys) && group.childModKeys[0] === 'ModForge.Performance.114'
    },
    'Child mod order did not persist after dragging inside the module panel.',
  )

  await page.screenshot({ path: screenshotPath, fullPage: false })

  await page.locator('.launcher-library-edit-bar--sorting .launcher-library-primary-action').click()
  await page.waitForSelector('.launcher-library-edit-bar', { state: 'detached', timeout: 3_000 })
  await assertState(
    page,
    () =>
      !document.querySelector('.launcher-library-grid-viewport-sorting') &&
      Boolean(document.querySelector('.launcher-library-sort-trigger svg')),
    'Done should close the sorting banner and wobble while leaving Custom sort selected.',
  )

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(500)
  await selectCustomSort(page)
  await assertState(
    page,
    () => {
      const order = window.__modforgeLauncherCustomSortState?.customOrders?.['view:all'] ?? []
      const group = window.__modforgeLauncherCustomSortState?.childModGroups?.find(
        (entry) => entry.parentModKey === 'ModForge.Performance.112',
      )
      return order.length > 1 && group?.childModKeys?.[0] === 'ModForge.Performance.114'
    },
    'Custom sort order did not survive page reload.',
  )

  const evidence = await readEvidence(page)
  const summary = {
    url: targetUrl,
    screenshotPath,
    evidence,
    consoleErrors,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (consoleErrors.length) {
    throw new Error(`Console errors during custom sort smoke: ${consoleErrors.join('\n')}`)
  }
} finally {
  await browser.close()
}
