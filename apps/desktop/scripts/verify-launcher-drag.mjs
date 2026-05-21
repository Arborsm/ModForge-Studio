import { chromium } from 'playwright'

const targetUrl = process.env.MODFORGE_LAUNCHER_DRAG_URL ?? 'http://127.0.0.1:5175/?mfLauncherMock=1'

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.launcher-library-folder-card', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.launcher-mod-card', { state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(600)

  const initial = await page.evaluate(() => ({
    folders: document.querySelectorAll('.launcher-library-folder-card').length,
    cards: document.querySelectorAll('.launcher-mod-card').length,
    title: document.title,
  }))

  const source = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('.launcher-library-draggable-card .launcher-mod-card'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + Math.min(rect.height - 18, 84)
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          hitX: x,
          hitY: y,
          hit: Boolean(document.elementFromPoint(x, y)?.closest('.launcher-library-draggable-card')),
        }
      })
      .filter((item) => item.width > 0 && item.height > 0 && item.hit)

    return candidates.at(2) ?? candidates.at(0) ?? null
  })
  const target = await page.locator('[data-launcher-folder-drop-id="visuals"]').boundingBox()

  if (!source || !target) {
    throw new Error(`Missing drag endpoints: source=${Boolean(source)} target=${Boolean(target)}`)
  }

  await page.evaluate(() => {
    window.__launcherDragEvents = []
    for (const eventName of ['pointerdown', 'pointermove', 'pointerup']) {
      document.addEventListener(
        eventName,
        (event) => {
          window.__launcherDragEvents.push({
            eventName,
            time: performance.now() - window.__launcherDragStartedAt,
            x: event.clientX,
            y: event.clientY,
          })
        },
        { capture: true },
      )
    }
    window.__launcherDragFrames = []
    window.__launcherDropFrames = []
    window.__launcherDragLongTasks = []
    window.__launcherPhase = 'drag'
    window.__launcherDragStartedAt = performance.now()
    let last = performance.now()
    let running = true
    const tick = (time) => {
      if (window.__launcherPhase === 'drop') {
        window.__launcherDropFrames.push(time - last)
      } else {
        window.__launcherDragFrames.push(time - last)
      }
      last = time
      if (running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__stopLauncherDragFrames = () => {
      running = false
    }
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          window.__launcherDragLongTasks.push(
            ...list.getEntries().map((entry) => ({
              duration: entry.duration,
              startTime: entry.startTime - window.__launcherDragStartedAt,
              phase: window.__launcherPhase,
              name: entry.name,
            })),
          )
        })
        observer.observe({ entryTypes: ['longtask'] })
        window.__launcherDragLongTaskObserver = observer
      } catch {
        window.__launcherDragLongTaskObserver = null
      }
    }
  })

  const start = {
    x: source.hitX,
    y: source.hitY,
  }
  const end = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.waitForTimeout(40)
  const immediateFeedback = await page.evaluate(() =>
    Boolean(document.querySelector('.launcher-library-draggable-card.launcher-library-card-grab-pending')),
  )
  await page.evaluate(() => {
    window.__launcherDragFrames = []
    window.__launcherDropFrames = []
    window.__launcherDragLongTasks = []
    window.__launcherDragEvents = []
    window.__launcherPhase = 'drag'
    window.__launcherDragStartedAt = performance.now()
  })
  const steps = 42
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
  }
  const dragOnlyMetrics = await page.evaluate(() => {
    window.__launcherPhase = 'drop'
    return {
      frames: window.__launcherDragFrames ?? [],
      longTasks: window.__launcherDragLongTasks ?? [],
    }
  })
  await page.mouse.up()
  await page.waitForTimeout(250)

  const result = await page.evaluate(() => {
    window.__stopLauncherDragFrames?.()
    window.__launcherDragLongTaskObserver?.disconnect?.()
    return {
      frames: window.__launcherDragFrames ?? [],
      dropFrames: window.__launcherDropFrames ?? [],
      longTasks: window.__launcherDragLongTasks ?? [],
      previewVisible: Boolean(document.querySelector('[data-testid="launcher-library-drag-preview"]')),
      visualsText: document.querySelector('[data-launcher-folder-drop-id="visuals"]')?.textContent ?? '',
      consoleErrors: window.__launcherDragConsoleErrors ?? [],
      events: window.__launcherDragEvents ?? [],
    }
  })

  const frames = result.frames.filter((value) => Number.isFinite(value) && value > 0)
  const dragOnlyFrames = dragOnlyMetrics.frames.filter((value) => Number.isFinite(value) && value > 0)
  const dropFrames = result.dropFrames.filter((value) => Number.isFinite(value) && value > 0)
  const maxFrame = Math.max(...frames)
  const p95Frame = percentile(frames, 0.95)
  const averageFrame = frames.reduce((sum, value) => sum + value, 0) / frames.length
  const dragOnlyMaxFrame = Math.max(...dragOnlyFrames)
  const dragOnlyP95Frame = percentile(dragOnlyFrames, 0.95)
  const dropMaxFrame = dropFrames.length ? Math.max(...dropFrames) : 0
  const longTasksDuringDrag = dragOnlyMetrics.longTasks.filter((entry) => entry.duration >= 50)
  const allLongTasks = result.longTasks.filter((entry) => entry.duration >= 50)
  const longTaskCount = longTasksDuringDrag.length
  const postDropLongTaskCount = allLongTasks.length - longTaskCount

  const summary = {
    url: targetUrl,
    initial,
    frameCount: frames.length,
    averageFrameMs: Number(averageFrame.toFixed(2)),
    p95FrameMs: Number(p95Frame.toFixed(2)),
    maxFrameMs: Number(maxFrame.toFixed(2)),
    dragOnlyP95FrameMs: Number(dragOnlyP95Frame.toFixed(2)),
    dragOnlyMaxFrameMs: Number(dragOnlyMaxFrame.toFixed(2)),
    dropMaxFrameMs: Number(dropMaxFrame.toFixed(2)),
    longTaskCount,
    postDropLongTaskCount,
    longTasksDuringDrag: longTasksDuringDrag.map((entry) => ({
      durationMs: Number(entry.duration.toFixed(2)),
      startMs: Number(entry.startTime.toFixed(2)),
      phase: entry.phase,
      name: entry.name,
    })),
    eventsAroundLongTasks: longTasksDuringDrag.map((entry) => ({
      taskStartMs: Number(entry.startTime.toFixed(2)),
      nearbyEvents: result.events
        .filter((event) => Math.abs(event.time - entry.startTime) <= 36)
        .map((event) => ({ ...event, time: Number(event.time.toFixed(2)) })),
    })),
    immediateFeedback,
    previewVisibleAfterDrop: result.previewVisible,
    visualsText: result.visualsText,
  }

  console.log(JSON.stringify(summary, null, 2))

  if (initial.folders < 2 || initial.cards < 10) {
    throw new Error(`Launcher mock did not render enough test items: ${JSON.stringify(initial)}`)
  }
  if (result.previewVisible) {
    throw new Error('Drag preview remained visible after drop.')
  }
  if (!immediateFeedback) {
    throw new Error('Drag did not show immediate grab feedback before activation.')
  }
  if (longTaskCount > 0 || dragOnlyP95Frame > 34 || dragOnlyMaxFrame > 80) {
    throw new Error(`Drag was not smooth enough: ${JSON.stringify(summary)}`)
  }
} finally {
  await browser.close()
}
