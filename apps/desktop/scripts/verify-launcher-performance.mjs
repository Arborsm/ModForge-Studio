import { chromium } from 'playwright'

const targetUrl = process.env.MODFORGE_LAUNCHER_PERF_URL ?? 'http://127.0.0.1:5175/?mfLauncherMock=1&mfLauncherMockMods=360'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

function summarizeDurations(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  const total = clean.reduce((sum, value) => sum + value, 0)
  return {
    count: clean.length,
    averageMs: clean.length ? Number((total / clean.length).toFixed(2)) : 0,
    p95Ms: Number(percentile(clean, 0.95).toFixed(2)),
    maxMs: clean.length ? Number(Math.max(...clean).toFixed(2)) : 0,
  }
}

function summarizeFrameDurations(values) {
  const base = summarizeDurations(values)
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  const totalMs = clean.reduce((sum, value) => sum + value, 0)
  const over60FpsBudget = clean.filter((value) => value > 16.7)
  const over30FpsBudget = clean.filter((value) => value > 33.3)
  const overJankBudget = clean.filter((value) => value > 50)
  return {
    ...base,
    effectiveFps: totalMs > 0 ? Number(((clean.length * 1000) / totalMs).toFixed(1)) : 0,
    below60FpsFrameRate: clean.length ? Number((over60FpsBudget.length / clean.length).toFixed(3)) : 0,
    below30FpsFrameRate: clean.length ? Number((over30FpsBudget.length / clean.length).toFixed(3)) : 0,
    jankFrameRate: clean.length ? Number((overJankBudget.length / clean.length).toFixed(3)) : 0,
  }
}

async function installPerfProbe(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('launcher-performance-test')
    window.__launcherPerf = {
      phase: 'idle',
      phaseStartedAt: performance.now(),
      framesByPhase: {},
      longTasks: [],
      measures: [],
      consoleErrors: [],
    }

    const state = window.__launcherPerf
    state.setPhase = (phase) => {
      state.phase = phase
      state.phaseStartedAt = performance.now()
      state.framesByPhase[phase] = []
    }
    state.measure = (name, startedAt) => {
      state.measures.push({
        name,
        phase: state.phase,
        duration: performance.now() - startedAt,
      })
    }

    let lastFrame = performance.now()
    let running = true
    const tick = (time) => {
      const frames = state.framesByPhase[state.phase] ?? []
      frames.push(time - lastFrame)
      state.framesByPhase[state.phase] = frames
      lastFrame = time
      if (running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    state.stop = () => {
      running = false
    }

    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          state.longTasks.push(
            ...list.getEntries().map((entry) => ({
              phase: state.phase,
              duration: entry.duration,
              startTime: entry.startTime,
            })),
          )
        })
        observer.observe({ entryTypes: ['longtask'] })
        state.longTaskObserver = observer
      } catch {
        state.longTaskObserver = null
      }
    }
  })
}

async function setPhase(page, phase) {
  await page.evaluate((nextPhase) => window.__launcherPerf?.setPhase?.(nextPhase), phase)
}

async function readPerfSummary(page) {
  return page.evaluate(() => {
    window.__launcherPerf?.stop?.()
    window.__launcherPerf?.longTaskObserver?.disconnect?.()
    const state = window.__launcherPerf
    return {
      framesByPhase: state?.framesByPhase ?? {},
      longTasks: state?.longTasks ?? [],
      measures: state?.measures ?? [],
      consoleErrors: state?.consoleErrors ?? [],
    }
  })
}

async function resetLibraryScenario(page) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1200)
}

async function measureInPage(page, name, fn) {
  const startedAt = await page.evaluate(() => performance.now())
  await fn()
  await page.evaluate(({ measureName, measureStartedAt }) => window.__launcherPerf?.measure?.(measureName, measureStartedAt), {
    measureName: name,
    measureStartedAt: startedAt,
  })
}

async function waitForFolderPanelClosed(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.launcher-library-folder-panel')
    if (!panel) {
      return true
    }
    const rect = panel.getBoundingClientRect()
    return rect.width <= 0 || rect.height <= 0
  })
  await page.waitForSelector('[data-launcher-folder-drop-id="visuals"]', { state: 'visible', timeout: 5_000 })
}

async function prepareAppearanceMeasure(page, selector) {
  await page.evaluate((targetSelector) => {
    window.__launcherAppearanceMeasure = new Promise((resolve) => {
      const startedAt = performance.now()
      if (document.querySelector(targetSelector)) {
        resolve(0)
        return
      }
      const observer = new MutationObserver(() => {
        if (!document.querySelector(targetSelector)) {
          return
        }
        observer.disconnect()
        resolve(performance.now() - startedAt)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      window.setTimeout(() => {
        observer.disconnect()
        resolve(performance.now() - startedAt)
      }, 5_000)
    })
  }, selector)
}

async function prepareDisappearanceMeasure(page, selector) {
  await page.evaluate((targetSelector) => {
    const hasVisibleTarget = () =>
      Array.from(document.querySelectorAll(targetSelector)).some((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })

    window.__launcherAppearanceMeasure = new Promise((resolve) => {
      const startedAt = performance.now()
      if (!hasVisibleTarget()) {
        resolve(0)
        return
      }

      let rafId = 0
      let timeoutId = 0
      const observer = new MutationObserver(check)

      function finish() {
        observer.disconnect()
        window.cancelAnimationFrame(rafId)
        window.clearTimeout(timeoutId)
        resolve(performance.now() - startedAt)
      }

      function check() {
        window.cancelAnimationFrame(rafId)
        rafId = window.requestAnimationFrame(() => {
          if (!hasVisibleTarget()) {
            finish()
          }
        })
      }

      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
      timeoutId = window.setTimeout(finish, 5_000)
      check()
    })
  }, selector)
}

async function finishAppearanceMeasure(page, name) {
  const duration = await page.evaluate(() => window.__launcherAppearanceMeasure)
  await page.evaluate(
    ({ measureName, measureDuration }) =>
      window.__launcherPerf?.measures.push({
        name: measureName,
        phase: window.__launcherPerf.phase,
        duration: measureDuration,
      }),
    { measureName: name, measureDuration: duration },
  )
}

async function findVisibleModCard(page, index = 0) {
  return page.evaluate((wantedIndex) => {
    const candidates = Array.from(document.querySelectorAll('.launcher-library-draggable-card .launcher-mod-card-main'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + Math.min(84, rect.height / 2),
          width: rect.width,
          height: rect.height,
          text: element.textContent ?? '',
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth,
        }
      })
      .filter((item) => item.visible)
    return candidates[wantedIndex] ?? candidates[0] ?? null
  }, index)
}

async function runScrollScenario(page) {
  await setPhase(page, 'scroll')
  const viewport = page.locator('.launcher-library-grid-viewport').first()
  const box = await viewport.boundingBox()
  if (!box) throw new Error('Missing launcher library viewport for scroll scenario.')

  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 760)
    await page.waitForTimeout(18)
  }
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -760)
    await page.waitForTimeout(18)
  }
}

async function runFolderScenario(page) {
  await page
    .locator('.launcher-library-grid-viewport')
    .first()
    .evaluate((element) => {
      element.scrollTop = 0
    })
  await page.waitForTimeout(80)
  await setPhase(page, 'folder')
  const folder = page.locator('[data-launcher-folder-drop-id="visuals"]').first()
  await folder.waitFor({ state: 'visible', timeout: 10_000 })
  const folderBox = await folder.boundingBox()
  if (!folderBox) throw new Error('Missing visible folder card for folder scenario.')
  await prepareAppearanceMeasure(page, '.launcher-library-folder-panel')
  await page.mouse.click(folderBox.x + folderBox.width / 2, folderBox.y + folderBox.height / 2)
  await finishAppearanceMeasure(page, 'folder-open')
  await page.waitForSelector('.launcher-library-folder-panel', { state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(80)
  const closeButton = page
    .locator(
      '.launcher-library-folder-panel .launcher-library-folder-panel-close, .launcher-library-folder-panel .launcher-library-icon-button',
    )
    .first()
  const closeButtonBox = await closeButton.boundingBox()
  if (!closeButtonBox) throw new Error('Missing visible folder close button for folder scenario.')
  await prepareDisappearanceMeasure(page, '.launcher-library-folder-panel')
  await page.mouse.click(closeButtonBox.x + closeButtonBox.width / 2, closeButtonBox.y + closeButtonBox.height / 2)
  await finishAppearanceMeasure(page, 'folder-close')
  await waitForFolderPanelClosed(page)
}

async function runDetailScenario(page) {
  await setPhase(page, 'detail')
  const card = await findVisibleModCard(page, 4)
  if (!card) throw new Error('Missing visible mod card for detail scenario.')
  await prepareAppearanceMeasure(page, '.launcher-mod-detail-panel')
  await page.mouse.click(card.x, card.y)
  await finishAppearanceMeasure(page, 'detail-open')
  await page.waitForSelector('.launcher-mod-detail-panel', { state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(120)
  const closeButton = page.locator('.launcher-mod-detail-close-button').first()
  const closeButtonBox = await closeButton.boundingBox()
  if (!closeButtonBox) throw new Error('Missing visible detail close button for detail scenario.')
  await measureInPage(page, 'detail-close', async () => {
    await page.mouse.click(closeButtonBox.x + closeButtonBox.width / 2, closeButtonBox.y + closeButtonBox.height / 2)
    await page.waitForSelector('.launcher-mod-detail-panel', { state: 'detached', timeout: 5_000 })
  })
}

async function runDragScenario(page) {
  await page
    .locator('.launcher-library-grid-viewport')
    .first()
    .evaluate((element) => {
      element.scrollTop = 0
    })
  await page.waitForTimeout(80)
  await setPhase(page, 'drag')
  const source = await findVisibleModCard(page, 3)
  const target = await page.locator('[data-launcher-folder-drop-id="visuals"]').boundingBox()
  if (!source || !target) throw new Error('Missing drag scenario endpoints.')

  const start = { x: source.x, y: source.y }
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await measureInPage(page, 'drag-feedback', async () => {
    await page.mouse.move(start.x + 12, start.y + 12)
    await page.waitForSelector('[data-testid="launcher-library-drag-preview"]', { state: 'visible', timeout: 1_000 })
  })

  for (let i = 1; i <= 48; i += 1) {
    const t = i / 48
    await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
  }
  await page.mouse.up()
  await page.waitForTimeout(160)
}

function buildSummary(raw) {
  const frames = Object.fromEntries(Object.entries(raw.framesByPhase).map(([phase, values]) => [phase, summarizeFrameDurations(values)]))
  const longTasks = raw.longTasks
    .filter((entry) => entry.duration >= 50)
    .map((entry) => ({
      phase: entry.phase,
      durationMs: Number(entry.duration.toFixed(2)),
      startMs: Number(entry.startTime.toFixed(2)),
    }))
  const measures = raw.measures.map((entry) => ({
    name: entry.name,
    phase: entry.phase,
    durationMs: Number(entry.duration.toFixed(2)),
  }))
  const latencyMs = Object.fromEntries(measures.map((entry) => [entry.name, entry.durationMs]))
  return { frames, latencyMs, longTasks, measures, consoleErrors: raw.consoleErrors }
}

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(800)
  await installPerfProbe(page)
  await page.evaluate((errors) => {
    window.__launcherPerf.consoleErrors = errors
  }, consoleErrors)

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('.launcher-mod-card').length,
    folders: document.querySelectorAll('.launcher-library-folder-card').length,
    scrollHeight: document.querySelector('.launcher-library-grid-viewport')?.scrollHeight ?? 0,
    viewportHeight: document.querySelector('.launcher-library-grid-viewport')?.clientHeight ?? 0,
  }))

  await runScrollScenario(page)
  await runFolderScenario(page)
  await runDetailScenario(page)
  const beforeDragRaw = await readPerfSummary(page)

  await resetLibraryScenario(page)
  await installPerfProbe(page)
  await page.evaluate((errors) => {
    window.__launcherPerf.consoleErrors = errors
  }, consoleErrors)
  await runDragScenario(page)

  const dragRaw = await readPerfSummary(page)
  const raw = {
    framesByPhase: {
      ...beforeDragRaw.framesByPhase,
      ...dragRaw.framesByPhase,
    },
    longTasks: [...beforeDragRaw.longTasks, ...dragRaw.longTasks],
    measures: [...beforeDragRaw.measures, ...dragRaw.measures],
    consoleErrors: [...beforeDragRaw.consoleErrors, ...dragRaw.consoleErrors],
  }
  raw.consoleErrors = consoleErrors
  const summary = {
    url: targetUrl,
    initial,
    ...buildSummary(raw),
  }
  console.log(JSON.stringify(summary, null, 2))

  const dragFeedback = summary.measures.find((measure) => measure.name === 'drag-feedback')?.durationMs ?? Infinity
  const detailOpen = summary.measures.find((measure) => measure.name === 'detail-open')?.durationMs ?? Infinity
  const folderOpen = summary.measures.find((measure) => measure.name === 'folder-open')?.durationMs ?? Infinity
  const scrollP95 = summary.frames.scroll?.p95Ms ?? Infinity
  const dragP95 = summary.frames.drag?.p95Ms ?? Infinity
  const phaseLongTasks = summary.longTasks.filter((entry) => ['scroll', 'folder', 'detail', 'drag'].includes(entry.phase))

  if (initial.scrollHeight < initial.viewportHeight * 10) {
    throw new Error(`Launcher performance mock did not render a large scrollable library: ${JSON.stringify(initial)}`)
  }
  if (consoleErrors.length) {
    throw new Error(`Console errors during launcher performance run: ${consoleErrors.join('\\n')}`)
  }
  const severeLongTasks = phaseLongTasks.filter((entry) => entry.durationMs > 120)
  if (dragFeedback > 80 || detailOpen > 180 || folderOpen > 220 || scrollP95 > 40 || dragP95 > 40 || severeLongTasks.length > 0) {
    throw new Error(`Launcher performance thresholds exceeded: ${JSON.stringify(summary)}`)
  }
} finally {
  await browser.close()
}
