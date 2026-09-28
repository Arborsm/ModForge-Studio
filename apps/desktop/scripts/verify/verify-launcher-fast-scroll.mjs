import { chromium } from 'playwright'

const targetUrl = process.env.MODFORGE_LAUNCHER_PERF_URL ?? 'http://127.0.0.1:5175/?mfLauncherMock=1&mfLauncherMockMods=360'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

function summarizeFrameDurations(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  const totalMs = clean.reduce((sum, value) => sum + value, 0)
  const over60FpsBudget = clean.filter((value) => value > 16.7)
  const over30FpsBudget = clean.filter((value) => value > 33.3)
  const overJankBudget = clean.filter((value) => value > 50)
  return {
    count: clean.length,
    averageMs: clean.length ? Number((totalMs / clean.length).toFixed(2)) : 0,
    p95Ms: Number(percentile(clean, 0.95).toFixed(2)),
    maxMs: clean.length ? Number(Math.max(...clean).toFixed(2)) : 0,
    effectiveFps: totalMs > 0 ? Number(((clean.length * 1000) / totalMs).toFixed(1)) : 0,
    below60FpsFrameRate: clean.length ? Number((over60FpsBudget.length / clean.length).toFixed(3)) : 0,
    below30FpsFrameRate: clean.length ? Number((over30FpsBudget.length / clean.length).toFixed(3)) : 0,
    jankFrameRate: clean.length ? Number((overJankBudget.length / clean.length).toFixed(3)) : 0,
  }
}

async function installFastScrollProbe(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('launcher-performance-test')
    window.__launcherFastScrollPerf = {
      phase: 'idle',
      framesByPhase: {},
      longTasks: [],
      samplesByPhase: {},
      consoleErrors: [],
    }

    const state = window.__launcherFastScrollPerf
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
    state.setPhase = (phase) => {
      state.phase = phase
      state.framesByPhase[phase] = []
      state.samplesByPhase[phase] = []
      lastFrame = performance.now()
    }
    state.sample = () => {
      const viewport = document.querySelector('.launcher-library-grid-viewport')
      const visibleCards = document.querySelectorAll('.launcher-mod-card').length
      const samples = state.samplesByPhase[state.phase] ?? []
      samples.push({
        scrollTop: viewport?.scrollTop ?? 0,
        scrollHeight: viewport?.scrollHeight ?? 0,
        clientHeight: viewport?.clientHeight ?? 0,
        visibleCards,
        virtualRows: document.querySelectorAll('.launcher-library-virtual-row').length,
      })
      state.samplesByPhase[state.phase] = samples
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
  await page.evaluate((nextPhase) => window.__launcherFastScrollPerf?.setPhase(nextPhase), phase)
}

async function sample(page) {
  await page.evaluate(() => window.__launcherFastScrollPerf?.sample())
}

async function wheelBurst(page, deltaY, count) {
  for (let index = 0; index < count; index += 1) {
    await page.mouse.wheel(0, deltaY)
    await sample(page)
  }
}

async function runPhase(page, phase, fn) {
  await setPhase(page, phase)
  await page.waitForTimeout(40)
  await fn()
  await page.waitForTimeout(180)
}

function summarizeSamples(samples) {
  const scrollTops = samples.map((sample) => sample.scrollTop)
  const visibleCards = samples.map((sample) => sample.visibleCards)
  const virtualRows = samples.map((sample) => sample.virtualRows)
  return {
    count: samples.length,
    firstScrollTop: scrollTops[0] ?? 0,
    lastScrollTop: scrollTops.at(-1) ?? 0,
    minScrollTop: scrollTops.length ? Math.min(...scrollTops) : 0,
    maxScrollTop: scrollTops.length ? Math.max(...scrollTops) : 0,
    averageVisibleCards: visibleCards.length
      ? Number((visibleCards.reduce((sum, value) => sum + value, 0) / visibleCards.length).toFixed(1))
      : 0,
    averageVirtualRows: virtualRows.length
      ? Number((virtualRows.reduce((sum, value) => sum + value, 0) / virtualRows.length).toFixed(1))
      : 0,
    maxVirtualRows: virtualRows.length ? Math.max(...virtualRows) : 0,
  }
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
  const samples = Object.fromEntries(Object.entries(raw.samplesByPhase).map(([phase, values]) => [phase, summarizeSamples(values)]))
  return { frames, longTasks, samples, consoleErrors: raw.consoleErrors ?? [] }
}

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })
const consoleErrors = []
await page.addInitScript(() => {
  const markPerformanceTest = () => document.documentElement?.classList.add('launcher-performance-test')
  markPerformanceTest()
  document.addEventListener('DOMContentLoaded', markPerformanceTest, { once: true })
})

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1200)
  await installFastScrollProbe(page)

  const viewport = page.locator('.launcher-library-grid-viewport').first()
  const viewportBox = await viewport.boundingBox()
  if (!viewportBox) {
    throw new Error('Missing launcher library viewport for fast scroll scenario.')
  }
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2)

  await runPhase(page, 'fast-down', async () => {
    await viewport.evaluate((node) => {
      node.scrollTop = 0
    })
    await page.waitForTimeout(40)
    await wheelBurst(page, 1800, 18)
  })

  await runPhase(page, 'fast-up', async () => {
    await viewport.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await page.waitForTimeout(40)
    await wheelBurst(page, -1800, 18)
  })

  await runPhase(page, 'pingpong', async () => {
    await viewport.evaluate((node) => {
      node.scrollTop = Math.floor(node.scrollHeight / 2)
    })
    await page.waitForTimeout(40)
    for (let index = 0; index < 24; index += 1) {
      await page.mouse.wheel(0, index % 2 === 0 ? 1400 : -1400)
      await sample(page)
    }
  })

  await page.screenshot({ path: 'E:/Arbor/ModForge Studio/.devDocs/launcher-fast-scroll-after.png', fullPage: false })
  const raw = await page.evaluate((errors) => {
    window.__launcherFastScrollPerf?.stop()
    window.__launcherFastScrollPerf?.longTaskObserver?.disconnect?.()
    window.__launcherFastScrollPerf.consoleErrors = errors
    return window.__launcherFastScrollPerf
  }, consoleErrors)
  const summary = {
    url: targetUrl,
    ...buildSummary(raw),
  }
  console.log(JSON.stringify(summary, null, 2))

  const phases = ['fast-down', 'fast-up', 'pingpong']
  const severeLongTasks = summary.longTasks.filter((entry) => entry.durationMs > 180)
  const poorFramePhases = phases.filter((phase) => (summary.frames[phase]?.p95Ms ?? Infinity) > 45)
  if (consoleErrors.length) {
    throw new Error(`Console errors during launcher fast scroll run: ${consoleErrors.join('\n')}`)
  }
  if (severeLongTasks.length || poorFramePhases.length) {
    throw new Error(`Launcher fast scroll thresholds exceeded: ${JSON.stringify(summary)}`)
  }
} finally {
  await browser.close()
}
