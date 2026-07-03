import {
  assertPerformanceSummary,
  installPerformanceProbe,
  launchPerfBrowser,
  measureInteraction,
  readPerformanceSummary,
} from './performance/browser-perf-harness.mjs'

const baseUrl = process.env.MODFORGE_COMPILER_CLEANUP_PERF_URL ?? 'http://127.0.0.1:5175/'
const scenarios = [
  'cp-maker-patch-menu',
  'cp-maker-world-bible',
  'cp-maker-storyboard',
  'cp-maker-project-gallery',
  'mod-i18n',
  'event-condition-builder',
  'event-game-state-query-builder',
  'launcher-mod-detail',
]

function scenarioUrl(id) {
  const url = new URL(baseUrl)
  url.searchParams.set('mfPerfScenario', id)
  return url.toString()
}

async function typeIntoFirstSearch(page, text) {
  const search = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first()
  await search.waitFor({ state: 'visible', timeout: 10_000 })
  await search.fill(text)
}

async function runScenarioInteraction(page, scenario) {
  if (scenario === 'cp-maker-patch-menu') {
    await measureInteraction(page, 'open-menu', async () => {
      await page.getByRole('button', { name: /patch/i }).click()
    })
    await measureInteraction(page, 'filter-menu', async () => {
      await typeIntoFirstSearch(page, 'festival 12')
    })
    return
  }

  if (scenario === 'cp-maker-world-bible') {
    await measureInteraction(page, 'switch-tabs', async () => {
      const tabs = page.locator('.studio-bible-edge-tools button')
      for (const index of [0, 1, 2, 3, 4]) {
        await tabs.nth(index).click()
      }
    })
    await measureInteraction(page, 'filter-world-bible', async () => {
      await typeIntoFirstSearch(page, 'actor 12')
    })
    return
  }

  if (scenario === 'cp-maker-storyboard') {
    await measureInteraction(page, 'filter-storyboard', async () => {
      await typeIntoFirstSearch(page, 'beat 42')
    })
    return
  }

  if (scenario === 'cp-maker-project-gallery') {
    await measureInteraction(page, 'filter-projects', async () => {
      await typeIntoFirstSearch(page, 'pack 12')
    })
    await measureInteraction(page, 'open-context-menu', async () => {
      await page.locator('.studio-project-row').first().click({ button: 'right' })
    })
    return
  }

  if (scenario === 'mod-i18n') {
    await measureInteraction(page, 'filter-i18n', async () => {
      await typeIntoFirstSearch(page, 'perf.key.18')
    })
    await measureInteraction(page, 'change-status', async () => {
      await page.locator('select').last().selectOption('empty')
    })
    return
  }

  if (scenario === 'event-condition-builder') {
    await measureInteraction(page, 'switch-condition-category', async () => {
      await page.getByRole('button', { name: /story/i }).click()
      await page.getByRole('button', { name: /player/i }).click()
      await page.getByRole('button', { name: /query/i }).click()
    })
    await measureInteraction(page, 'filter-condition-catalog', async () => {
      await typeIntoFirstSearch(page, 'mail')
    })
    return
  }

  if (scenario === 'event-game-state-query-builder') {
    await measureInteraction(page, 'switch-query-category', async () => {
      await page.getByRole('button', { name: /player/i }).click()
      await page.getByRole('button', { name: /world/i }).click()
    })
    await measureInteraction(page, 'add-query-chip', async () => {
      await page.getByRole('button', { name: /add condition/i }).first().click()
    })
    return
  }

  if (scenario === 'launcher-mod-detail') {
    await measureInteraction(page, 'switch-detail-tabs', async () => {
      for (const name of [/details/i, /dependencies/i, /files/i, /description/i]) {
        await page.getByRole('tab', { name }).click()
      }
    })
    await measureInteraction(page, 'open-description-reader', async () => {
      await page.getByRole('button', { name: /full description|read/i }).click()
    })
  }
}

const browser = await launchPerfBrowser()
const summaries = []

try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await installPerformanceProbe(page, scenario)

    try {
      const startedAt = Date.now()
      await page.goto(scenarioUrl(scenario), { waitUntil: 'commit', timeout: 45_000 })
      await page.waitForSelector(`[data-mf-perf-scenario="${scenario}"]`, { state: 'visible', timeout: 45_000 })
      const initialRenderMs = Date.now() - startedAt
      await page.waitForTimeout(400)
      await page.evaluate((duration) => window.__modforgePerf?.measure?.('initial-render', duration), initialRenderMs)
      await runScenarioInteraction(page, scenario)

      const summary = {
        scenario,
        url: scenarioUrl(scenario),
        ...(await readPerformanceSummary(page, consoleErrors)),
      }
      summaries.push(summary)
      assertPerformanceSummary(summary)
    } finally {
      await page.close()
    }
  }

  console.log(JSON.stringify({ scenarios: summaries }, null, 2))
} finally {
  await browser.close()
}
