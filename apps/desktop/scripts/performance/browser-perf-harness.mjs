import { chromium } from 'playwright'

const DEFAULT_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

export function summarizeDurations(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  const totalMs = clean.reduce((sum, value) => sum + value, 0)
  return {
    count: clean.length,
    averageMs: clean.length ? Number((totalMs / clean.length).toFixed(2)) : 0,
    p95Ms: Number(percentile(clean, 0.95).toFixed(2)),
    maxMs: clean.length ? Number(Math.max(...clean).toFixed(2)) : 0,
  }
}

export function summarizeFrameDurations(values) {
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

export async function launchPerfBrowser() {
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || DEFAULT_EXECUTABLE,
    headless: true,
  })
}

export async function installPerformanceProbe(page, scenario) {
  await page.addInitScript((scenarioName) => {
    window.__modforgePerfScenario = scenarioName
    window.__modforgePerf = {
      phase: 'startup',
      framesByPhase: {},
      longTasks: [],
      measures: [],
    }

    const state = window.__modforgePerf
    state.setPhase = (phase) => {
      state.phase = phase
      state.framesByPhase[phase] = []
    }
    state.measure = (name, duration) => {
      state.measures.push({
        name,
        phase: state.phase,
        duration,
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
  }, scenario)
}

export async function setPerfPhase(page, phase) {
  await page.evaluate((nextPhase) => window.__modforgePerf?.setPhase?.(nextPhase), phase)
}

export async function measureInteraction(page, name, action) {
  await setPerfPhase(page, name)
  await page.waitForTimeout(50)
  const startedAt = await page.evaluate(() => performance.now())
  await action()
  await page.waitForTimeout(180)
  const duration = await page.evaluate((start) => performance.now() - start, startedAt)
  await page.evaluate(({ measureName, measureDuration }) => window.__modforgePerf?.measure?.(measureName, measureDuration), {
    measureName: name,
    measureDuration: duration,
  })
}

export async function readPerformanceSummary(page, consoleErrors) {
  const raw = await page.evaluate((errors) => {
    window.__modforgePerf?.stop?.()
    window.__modforgePerf?.longTaskObserver?.disconnect?.()
    const state = window.__modforgePerf
    return {
      framesByPhase: state?.framesByPhase ?? {},
      longTasks: state?.longTasks ?? [],
      measures: state?.measures ?? [],
      consoleErrors: errors,
      hasReactDevtoolsStandaloneScript: Boolean(document.querySelector('script[src="http://localhost:8097"]')),
    }
  }, consoleErrors)
  const frames = Object.fromEntries(Object.entries(raw.framesByPhase).map(([phase, values]) => [phase, summarizeFrameDurations(values)]))
  const frameCounts = Object.fromEntries(Object.entries(frames).map(([phase, metrics]) => [phase, metrics.count]))
  const totalFrames = Object.values(frameCounts).reduce((total, count) => total + count, 0)

  return {
    frames,
    frameCounts,
    totalFrames,
    renderFrames: totalFrames,
    measures: Object.fromEntries(
      Object.entries(
        raw.measures.reduce((groups, measure) => {
          groups[measure.name] ??= []
          groups[measure.name].push(measure.duration)
          return groups
        }, {}),
      ).map(([name, values]) => [name, summarizeDurations(values)]),
    ),
    longTasks: raw.longTasks
      .filter((entry) => entry.duration >= 50)
      .map((entry) => ({
        phase: entry.phase,
        durationMs: Number(entry.duration.toFixed(2)),
        startMs: Number(entry.startTime.toFixed(2)),
      })),
    consoleErrors: raw.consoleErrors,
    hasReactDevtoolsStandaloneScript: raw.hasReactDevtoolsStandaloneScript,
  }
}

export function assertPerformanceSummary(summary, thresholds = {}) {
  const maxFrameP95Ms = thresholds.maxFrameP95Ms ?? 70
  const maxInteractionP95Ms = thresholds.maxInteractionP95Ms ?? 800
  const maxInitialRenderMs = thresholds.maxInitialRenderMs ?? 5_000
  const maxLongTaskMs = thresholds.maxLongTaskMs ?? 250
  const frameFailures = Object.entries(summary.frames).filter(([, metrics]) => metrics.count > 5 && metrics.p95Ms > maxFrameP95Ms)
  const interactionFailures = Object.entries(summary.measures).filter(([name, metrics]) => {
    if (metrics.count <= 0) {
      return false
    }

    return name === 'initial-render' ? metrics.p95Ms > maxInitialRenderMs : metrics.p95Ms > maxInteractionP95Ms
  })
  const severeLongTasks = summary.longTasks.filter((entry) => entry.durationMs > maxLongTaskMs)

  if (summary.hasReactDevtoolsStandaloneScript) {
    throw new Error('Standalone React DevTools script was injected during a default performance run.')
  }

  if (summary.consoleErrors.length) {
    throw new Error(`Console errors during performance run:\n${summary.consoleErrors.join('\n')}`)
  }

  if (frameFailures.length || interactionFailures.length || severeLongTasks.length) {
    throw new Error(
      `Performance thresholds exceeded: ${JSON.stringify(
        {
          frameFailures,
          interactionFailures,
          severeLongTasks,
        },
        null,
        2,
      )}`,
    )
  }
}
