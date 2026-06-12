import {
  assertPerformanceSummary,
  installPerformanceProbe,
  launchPerfBrowser,
  measureInteraction,
  readPerformanceSummary,
} from './performance/browser-perf-harness.mjs'

const baseUrl = process.env.MODFORGE_PAGE_PERF_URL ?? 'http://127.0.0.1:5175/'
const scenarios = [
  'workbench-home',
  'event-stage-editor',
  'item-workspace',
  'building-workspace',
  'map-patch-editor',
  'content-patcher-workspace',
  'launcher-shell',
]

function scenarioUrl(id) {
  const url = new URL(baseUrl)
  url.searchParams.set('mfPagePerfScenario', id)
  url.searchParams.set('mfLauncherMock', '1')
  return url.toString()
}

async function fillFirstSearch(page, text) {
  const search = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], input[aria-label*="Search"]').first()
  await search.waitFor({ state: 'visible', timeout: 10_000 })
  await search.fill(text)
}

async function runScenarioInteraction(page, scenario) {
  if (scenario === 'workbench-home') {
    await measureInteraction(page, 'open-world-bible', async () => {
      await page.getByRole('button', { name: /world bible/i }).first().click()
    })
    await measureInteraction(page, 'close-world-bible', async () => {
      await page.getByRole('button', { name: /world bible/i }).first().click()
    })
    return
  }

  if (scenario === 'event-stage-editor') {
    await measureInteraction(page, 'switch-event-tabs', async () => {
      await page.getByRole('button', { name: /town market introduction/i }).click()
      await page.getByRole('button', { name: /beach lost item/i }).click()
      await page.getByRole('button', { name: /mine rescue branch/i }).click()
    })
    await measureInteraction(page, 'open-condition-builder', async () => {
      await page.getByRole('button', { name: /add actor/i }).click({ force: true })
      await page.getByRole('button', { name: /^play$/i }).click()
      await page.getByRole('button', { name: /^reset$/i }).click()
    })
    return
  }

  if (scenario === 'item-workspace') {
    await measureInteraction(page, 'filter-items', async () => {
      await page.locator('input[placeholder="Filter by item, ID, type, source, recipe, crop, or fish data"]').fill('performance item 17')
    })
    await measureInteraction(page, 'clear-items', async () => {
      await page.locator('input[placeholder="Filter by item, ID, type, source, recipe, crop, or fish data"]').fill('')
      await page.getByRole('button', { name: /relations \/ recipes/i }).click()
    })
    return
  }

  if (scenario === 'building-workspace') {
    await measureInteraction(page, 'toggle-building-grid', async () => {
      await page.getByTitle(/hide grid|show grid/i).click()
    })
    return
  }

  if (scenario === 'map-patch-editor') {
    await measureInteraction(page, 'switch-map-tabs', async () => {
      for (const name of [/warps/i, /tiles/i, /fromfile/i, /properties/i]) {
        await page.getByRole('button', { name }).click()
      }
    })
    return
  }

  if (scenario === 'content-patcher-workspace') {
    await measureInteraction(page, 'edit-patch-logname', async () => {
      await page.getByLabel(/patch logname/i).fill('Performance patch updated')
    })
    await measureInteraction(page, 'save-export-project', async () => {
      await page.getByRole('button', { name: /^save$/i }).click()
      await page.getByRole('button', { name: /^export$/i }).click()
    })
    return
  }

  if (scenario === 'launcher-shell') {
    await measureInteraction(page, 'navigate-launcher-pages', async () => {
      for (const name of ['Discover', 'Updates', 'Configuration', 'Library']) {
        await page.getByText(name, { exact: true }).first().click()
      }
    })
    await measureInteraction(page, 'filter-launcher-discover', async () => {
      await page.getByText('Discover', { exact: true }).first().click()
      await page.locator('.launcher-discover-searchbar-input').waitFor({ state: 'visible', timeout: 20_000 })
    })
    await measureInteraction(page, 'search-launcher-discover', async () => {
      await fillFirstSearch(page, 'performance')
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
      await page.waitForSelector(`[data-mf-page-perf-scenario="${scenario}"]`, { state: 'visible', timeout: 45_000 })
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
