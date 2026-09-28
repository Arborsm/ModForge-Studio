import {
  assertPerformanceSummary,
  installPerformanceProbe,
  launchPerfBrowser,
  measureInteraction,
  readPerformanceSummary,
  setPerfPhase,
} from './performance/browser-perf-harness.mjs'

const baseUrl = process.env.MODFORGE_PAGE_PERF_URL ?? 'http://127.0.0.1:5175/'
const defaultScenarios = [
  'workbench-home',
  'event-stage-editor',
  'item-workspace',
  'building-workspace',
  'map-patch-editor',
  'map-catalog',
  'app-cold-workbench',
  'app-cold-settings',
  'content-patcher-workspace',
  'launcher-shell',
]
const requestedScenarios = process.env.MODFORGE_PAGE_PERF_SCENARIOS?.split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const scenarios = requestedScenarios?.length ? requestedScenarios : defaultScenarios

for (const scenario of scenarios) {
  if (!defaultScenarios.includes(scenario)) throw new Error(`Unknown page performance scenario: ${scenario}`)
}

function scenarioUrl(id) {
  const url = new URL(baseUrl)
  url.searchParams.set('mfLauncherMock', '1')
  if (id === 'app-cold-settings') {
    url.searchParams.set('mfSettingsMock', '1')
  } else if (id !== 'app-cold-workbench') {
    url.searchParams.set('mfPagePerfScenario', id)
  }
  return url.toString()
}

function scenarioReadySelector(scenario) {
  if (scenario === 'app-cold-settings' || scenario === 'app-cold-workbench') return '.launcher-shell'
  return `[data-mf-page-perf-scenario="${scenario}"]`
}

async function collectHeap(page) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Performance.enable')
    await session.send('HeapProfiler.collectGarbage')
    const { metrics } = await session.send('Performance.getMetrics')
    return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? null
  } finally {
    await session.detach()
  }
}

async function fillFirstSearch(page, text) {
  const search = page
    .locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], input[aria-label*="Search"]')
    .first()
  await search.waitFor({ state: 'visible', timeout: 10_000 })
  await search.fill(text)
}

async function runScenarioInteraction(page, scenario) {
  if (scenario === 'workbench-home') {
    await measureInteraction(page, 'open-world-bible', async () => {
      await page
        .getByRole('button', { name: /world bible/i })
        .first()
        .click()
    })
    await measureInteraction(page, 'close-world-bible', async () => {
      await page
        .getByRole('button', { name: /world bible/i })
        .first()
        .click()
    })
    return
  }

  if (scenario === 'event-stage-editor') {
    await measureInteraction(page, 'switch-event-tabs', async () => {
      await page.locator('.event-picker').first().click()
      await page.getByRole('button', { name: /town fair opening/i }).click()
      await page.locator('.event-picker').first().click()
      await page.getByRole('button', { name: /beach lost item/i }).click()
      await page.locator('.event-picker').first().click()
      await page.getByRole('button', { name: /mine rescue branch/i }).click()
    })
    await measureInteraction(page, 'open-condition-builder', async () => {
      await page.getByRole('button', { name: /add actor/i }).click({ force: true })
      await page.getByRole('button', { name: /^play$/i }).click()
      await page.getByRole('button', { name: /^reset$/i }).click()
    })
    await measureInteraction(page, 'start-playback', async () => {
      await page.getByRole('button', { name: /^play$/i }).click()
    })
    await setPerfPhase(page, 'playback-sustained')
    await page.waitForTimeout(4_000)
    await measureInteraction(page, 'stop-playback', async () => {
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
      for (const label of ['Warps', 'Tiles', 'Source file', 'Map properties']) {
        await page.locator('.map-patch-operation-row').filter({ hasText: label }).click()
      }
    })
    await measureInteraction(page, 'switch-large-tileset-grid', async () => {
      await page.locator('.map-patch-operation-row').filter({ hasText: 'Tiles' }).click()
      await page.getByRole('button', { name: /grid view/i }).click()
      await page.locator('.map-tileset-palette-scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    })
    return
  }

  if (scenario === 'map-catalog') {
    await measureInteraction(page, 'scroll-map-catalog', async () => {
      await page.locator('.map-catalog-library-content').evaluate(async (element) => {
        const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
        for (let step = 1; step <= 16; step += 1) {
          element.scrollTop = (maxScroll * step) / 16
          await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
        }
      })
    })
    return
  }

  if (scenario === 'app-cold-workbench') {
    await measureInteraction(page, 'open-workbench', async () => {
      await page.getByRole('button', { name: /workbench/i }).evaluate((button) => button.click())
      await page.locator('[data-guide-surface="workbench.home"]').waitFor({ state: 'visible', timeout: 20_000 })
    })
    return
  }

  if (scenario === 'app-cold-settings') {
    await measureInteraction(page, 'open-settings', async () => {
      await page.getByRole('button', { name: /settings|设置/i }).evaluate((button) => button.click())
      await page.locator('.settings-window-panel').waitFor({ state: 'visible', timeout: 20_000 })
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
      for (const name of ['Discover', 'Updates', 'Diagnostics', 'Library']) {
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
      await page.waitForSelector(scenarioReadySelector(scenario), { state: 'visible', timeout: 45_000 })
      const initialRenderMs = Date.now() - startedAt
      await page.waitForTimeout(400)
      if (scenario === 'app-cold-settings') await page.waitForTimeout(900)
      if (scenario === 'app-cold-workbench') await page.waitForTimeout(5_000)
      const heapBeforeBytes = await collectHeap(page)
      await page.evaluate((duration) => window.__modforgePerf?.measure?.('initial-render', duration), initialRenderMs)
      await page.evaluate(() => {
        if (window.__modforgeDevHostCommands) window.__modforgeDevHostCommands.length = 0
      })
      await runScenarioInteraction(page, scenario)
      const heapAfterBytes = await collectHeap(page)

      const summary = {
        scenario,
        url: scenarioUrl(scenario),
        ...(await readPerformanceSummary(page, consoleErrors)),
        heap: {
          beforeBytes: heapBeforeBytes,
          afterBytes: heapAfterBytes,
          growthBytes: heapBeforeBytes === null || heapAfterBytes === null ? null : heapAfterBytes - heapBeforeBytes,
        },
        hostCommands: await page.evaluate(() => window.__modforgeDevHostCommands ?? []),
      }
      if (scenario === 'map-catalog') {
        summary.catalog = await page.evaluate(() => ({
          cards: document.querySelectorAll('.map-catalog-card').length,
          canvases: document.querySelectorAll('.map-catalog canvas').length,
          previews: document.querySelectorAll('.map-catalog-preview').length,
        }))
      }
      summaries.push(summary)
      const thresholds =
        scenario === 'map-catalog'
          ? { maxFrameP95Ms: 45, maxLongTaskMs: 170, maxInitialRenderMs: 2_500 }
          : scenario === 'app-cold-workbench'
            ? { maxFrameP95Ms: 70, maxLongTaskMs: 250, maxInteractionP95Ms: 800 }
            : scenario === 'app-cold-settings'
              ? { maxFrameP95Ms: 100, maxLongTaskMs: 250, maxInteractionP95Ms: 250 }
              : undefined
      assertPerformanceSummary(summary, thresholds)
      if (scenario === 'map-catalog') {
        if (summary.catalog.cards > 60 || summary.catalog.canvases !== 0 || (summary.heap.growthBytes ?? 0) > 25 * 1024 * 1024) {
          throw new Error(
            `Map catalog runtime budget exceeded: ${JSON.stringify({ catalog: summary.catalog, heap: summary.heap }, null, 2)}`,
          )
        }
      }
      if (scenario === 'app-cold-workbench' && summary.hostCommands.includes('scan_maps')) {
        throw new Error(`Workbench home issued scan_maps: ${JSON.stringify(summary.hostCommands)}`)
      }
      if (scenario === 'app-cold-workbench') {
        const frames = summary.frames['open-workbench']
        const longTasks = summary.longTasks.filter((entry) => entry.phase === 'open-workbench' && entry.durationMs > 120)
        if ((frames?.p95Ms ?? 0) > 40 || longTasks.length) {
          throw new Error(`Workbench open runtime budget exceeded: ${JSON.stringify({ frames, longTasks }, null, 2)}`)
        }
      }
      if (scenario === 'app-cold-settings') {
        const forbidden = summary.hostCommands.filter((command) => /(?:ai_settings|ai_usage|semantic|machine_translation)/u.test(command))
        if (forbidden.length) throw new Error(`Appearance settings issued AI commands: ${JSON.stringify(forbidden)}`)
        const frames = summary.frames['open-settings']
        const longTasks = summary.longTasks.filter((entry) => entry.phase === 'open-settings' && entry.durationMs > 50)
        if ((frames?.p95Ms ?? 0) > 40 || longTasks.length) {
          throw new Error(`Settings open runtime budget exceeded: ${JSON.stringify({ frames, longTasks }, null, 2)}`)
        }
      }
    } finally {
      await page.close()
    }
  }

  console.log(JSON.stringify({ scenarios: summaries }, null, 2))
} finally {
  await browser.close()
}
