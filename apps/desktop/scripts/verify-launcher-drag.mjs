import { chromium } from 'playwright'

const targetUrl = process.env.MODFORGE_LAUNCHER_DRAG_URL ?? 'http://127.0.0.1:5175/?mfLauncherMock=1'

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))]
}

function summarizeFrames(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0)
  const totalMs = clean.reduce((sum, value) => sum + value, 0)
  return {
    count: clean.length,
    averageMs: clean.length ? Number((totalMs / clean.length).toFixed(2)) : 0,
    p95Ms: Number(percentile(clean, 0.95).toFixed(2)),
    maxMs: clean.length ? Number(Math.max(...clean).toFixed(2)) : 0,
    effectiveFps: totalMs > 0 ? Number(((clean.length * 1000) / totalMs).toFixed(1)) : 0,
    below60FpsFrameRate: clean.length ? Number((clean.filter((value) => value > 16.7).length / clean.length).toFixed(3)) : 0,
    below30FpsFrameRate: clean.length ? Number((clean.filter((value) => value > 33.3).length / clean.length).toFixed(3)) : 0,
    jankFrameRate: clean.length ? Number((clean.filter((value) => value > 50).length / clean.length).toFixed(3)) : 0,
  }
}

async function getVisibleBox(page, selector, index = 0) {
  return page.evaluate(
    ({ selector, index }) => {
      const boxes = Array.from(document.querySelectorAll(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        })
        .filter((rect) => rect.width > 0 && rect.height > 0)
      return boxes.at(index) ?? null
    },
    { selector, index },
  )
}

async function verifyExpandedFolderPriority(page) {
  const folderCard = await getVisibleBox(page, '.launcher-library-folder-card')
  if (!folderCard) {
    throw new Error('Missing visible folder card for expanded folder priority check.')
  }

  await page.mouse.click(folderCard.x + folderCard.width / 2, folderCard.y + folderCard.height / 2)
  await page.waitForSelector('.launcher-library-folder-panel', { state: 'visible', timeout: 3_000 })
  await page.waitForTimeout(200)

  const points = await page.evaluate(() => {
    const source = Array.from(document.querySelectorAll('.launcher-library-draggable-card .launcher-mod-card'))
      .map((card) => ({ panel: card.closest('.launcher-library-folder-panel'), rect: card.getBoundingClientRect() }))
      .filter((item) => !item.panel && item.rect.width > 0 && item.rect.height > 0)
      .at(2)
    const target = Array.from(
      document.querySelectorAll('.launcher-library-folder-panel .launcher-library-draggable-card .launcher-mod-card'),
    )
      .map((card) => ({ rect: card.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .at(0)
    if (!source || !target) {
      return null
    }
    return {
      source: {
        x: source.rect.left + source.rect.width / 2,
        y: source.rect.top + Math.min(90, source.rect.height / 2),
      },
      target: {
        x: target.rect.left + target.rect.width / 2,
        y: target.rect.top + target.rect.height / 2,
      },
    }
  })
  if (!points) {
    throw new Error('Missing source or expanded folder target mod for priority check.')
  }

  await page.mouse.move(points.source.x, points.source.y)
  await page.mouse.down()
  await page.mouse.move(points.source.x + 8, points.source.y + 1)
  await page.waitForSelector('.launcher-library-card-grab-pending', { state: 'attached', timeout: 1_000 })
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24
    await page.mouse.move(
      points.source.x + (points.target.x - points.source.x) * t,
      points.source.y + (points.target.y - points.source.y) * t,
    )
  }
  await page.waitForTimeout(80)
  await page.screenshot({ path: 'C:/Users/26537/AppData/Local/Temp/modforge-launcher-expanded-folder-drag.png', fullPage: false })
  const evidence = await page.evaluate(({ x, y }) => {
    const activeTargets = Array.from(document.querySelectorAll('.launcher-library-dnd-target-box-active')).map((element) =>
      element.getAttribute('data-launcher-dnd-target-id'),
    )
    const underTargets = Array.from(document.querySelectorAll('[data-launcher-dnd-target-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
          ? element.getAttribute('data-launcher-dnd-target-id')
          : null
      })
      .filter(Boolean)
    return {
      activeTargets,
      underTargets,
      hoveredCards: document.querySelectorAll('.launcher-mod-card:hover, .launcher-library-folder-card:hover').length,
      bodyDragging: document.body.classList.contains('launcher-library-dragging-active'),
    }
  }, points.target)
  await page.mouse.up()
  await page.waitForTimeout(120)

  const activeTarget = evidence.activeTargets.at(0) ?? ''
  if (!activeTarget.startsWith('launcher-folder-blank:')) {
    throw new Error(`Expanded folder drag targeted the wrong element: ${JSON.stringify(evidence)}`)
  }
  if (!evidence.underTargets.some((target) => target?.startsWith('launcher-parent:'))) {
    throw new Error(`Expanded folder priority check did not cover an internal parent target: ${JSON.stringify(evidence)}`)
  }
  if (evidence.hoveredCards > 0) {
    throw new Error(`Drag hover leaked to underlying cards: ${JSON.stringify(evidence)}`)
  }

  return evidence
}

async function verifyChildReleasePriority(page) {
  const childToggle = await getVisibleBox(page, '.launcher-mod-card-child-toggle')
  if (!childToggle) {
    throw new Error('Missing child mod toggle for release priority check.')
  }

  await page.mouse.click(childToggle.x + childToggle.width / 2, childToggle.y + childToggle.height / 2)
  await page.waitForSelector('.launcher-library-grid-reveal-child', { state: 'visible', timeout: 3_000 })
  await page.waitForTimeout(160)

  const points = await page.evaluate(() => {
    const child = Array.from(
      document.querySelectorAll('.launcher-library-grid-reveal-child .launcher-library-draggable-card .launcher-mod-card'),
    )
      .map((card) => ({ rect: card.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      .at(0)
    const topLevelParent = Array.from(document.querySelectorAll('.launcher-library-draggable-card .launcher-mod-card'))
      .map((card) => ({
        child: card.closest('.launcher-library-grid-reveal-child'),
        panel: card.closest('.launcher-library-folder-panel'),
        rect: card.getBoundingClientRect(),
      }))
      .filter((item) => !item.child && !item.panel && item.rect.width > 0 && item.rect.height > 0)
      .at(3)
    if (!child || !topLevelParent) {
      return null
    }
    return {
      source: {
        x: child.rect.left + child.rect.width / 2,
        y: child.rect.top + child.rect.height / 2,
      },
      target: {
        x: topLevelParent.rect.left + topLevelParent.rect.width / 2,
        y: topLevelParent.rect.top + topLevelParent.rect.height / 2,
      },
    }
  })
  if (!points) {
    throw new Error('Missing child mod or top-level parent target for release priority check.')
  }

  await page.mouse.move(points.source.x, points.source.y)
  await page.mouse.down()
  await page.mouse.move(points.source.x + 8, points.source.y + 1)
  await page.waitForSelector('.launcher-library-card-grab-pending', { state: 'attached', timeout: 1_000 })
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24
    await page.mouse.move(
      points.source.x + (points.target.x - points.source.x) * t,
      points.source.y + (points.target.y - points.source.y) * t,
    )
  }
  await page.waitForTimeout(80)
  await page.screenshot({ path: 'C:/Users/26537/AppData/Local/Temp/modforge-launcher-child-release-drag.png', fullPage: false })
  const evidence = await page.evaluate(({ x, y }) => {
    const activeTargets = Array.from(document.querySelectorAll('.launcher-library-dnd-target-box-active')).map((element) =>
      element.getAttribute('data-launcher-dnd-target-id'),
    )
    const underTargets = Array.from(document.querySelectorAll('[data-launcher-dnd-target-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
          ? element.getAttribute('data-launcher-dnd-target-id')
          : null
      })
      .filter(Boolean)
    return {
      activeTargets,
      underTargets,
      hoveredCards: document.querySelectorAll('.launcher-mod-card:hover, .launcher-library-folder-card:hover').length,
      bodyDragging: document.body.classList.contains('launcher-library-dragging-active'),
    }
  }, points.target)
  await page.mouse.up()
  await page.waitForTimeout(120)

  if (!evidence.activeTargets.includes('launcher-library-blank')) {
    throw new Error(`Child release targeted the wrong element: ${JSON.stringify(evidence)}`)
  }
  if (!evidence.underTargets.some((target) => target?.startsWith('launcher-parent:'))) {
    throw new Error(`Child release priority check did not cover an underlying parent target: ${JSON.stringify(evidence)}`)
  }
  if (evidence.hoveredCards > 0) {
    throw new Error(`Child release hover leaked to underlying cards: ${JSON.stringify(evidence)}`)
  }

  return evidence
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
  const expandedFolderPriority = await verifyExpandedFolderPriority(page)
  const childReleasePriority = await verifyChildReleasePriority(page)

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
  const target = await getVisibleBox(page, '[data-launcher-folder-drop-id]')

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
  await page.evaluate(() => {
    window.__launcherDragFeedbackLatencyMs = null
    window.__launcherDragFeedbackProbeStartedAt = performance.now()
    const listener = (event) => {
      if (event.buttons !== 1) return
      const startedAt = performance.now()
      queueMicrotask(() => {
        if (window.__launcherDragFeedbackLatencyMs == null) {
          const hasFeedback = Boolean(document.querySelector('.launcher-library-draggable-card.launcher-library-card-grab-pending'))
          if (hasFeedback) {
            window.__launcherDragFeedbackLatencyMs = performance.now() - startedAt
          }
        }
      })
    }
    window.__launcherDragFeedbackListener = listener
    window.addEventListener('pointermove', listener, { passive: true })
  })
  const dragFeedbackStartedAt = await page.evaluate(() => performance.now())
  await page.mouse.move(start.x + 8, start.y + 1)
  await page.waitForFunction(() => Boolean(document.querySelector('.launcher-library-draggable-card.launcher-library-card-grab-pending')), {
    timeout: 200,
  })
  const dragFeedbackLatencyMs = await page.evaluate((fallbackStartedAt) => {
    window.removeEventListener('pointermove', window.__launcherDragFeedbackListener)
    return window.__launcherDragFeedbackLatencyMs ?? performance.now() - fallbackStartedAt
  }, dragFeedbackStartedAt)
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
      folderText: document.querySelector('[data-launcher-folder-drop-id]')?.textContent ?? '',
      consoleErrors: window.__launcherDragConsoleErrors ?? [],
      events: window.__launcherDragEvents ?? [],
    }
  })

  const frames = result.frames.filter((value) => Number.isFinite(value) && value > 0)
  const dragOnlyFrames = dragOnlyMetrics.frames.filter((value) => Number.isFinite(value) && value > 0)
  const dropFrames = result.dropFrames.filter((value) => Number.isFinite(value) && value > 0)
  const allFrameSummary = summarizeFrames(frames)
  const dragFrameSummary = summarizeFrames(dragOnlyFrames)
  const dropFrameSummary = summarizeFrames(dropFrames)
  const longTasksDuringDrag = dragOnlyMetrics.longTasks.filter((entry) => entry.duration >= 50)
  const allLongTasks = result.longTasks.filter((entry) => entry.duration >= 50)
  const longTaskCount = longTasksDuringDrag.length
  const postDropLongTaskCount = allLongTasks.length - longTaskCount

  const summary = {
    url: targetUrl,
    initial,
    frames: {
      all: allFrameSummary,
      drag: dragFrameSummary,
      drop: dropFrameSummary,
    },
    latencyMs: {
      dragFeedback: Number(dragFeedbackLatencyMs.toFixed(2)),
    },
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
    expandedFolderPriority,
    childReleasePriority,
    immediateFeedback,
    previewVisibleAfterDrop: result.previewVisible,
    folderText: result.folderText,
  }

  console.log(JSON.stringify(summary, null, 2))

  if (initial.folders < 2 || initial.cards < 10) {
    throw new Error(`Launcher mock did not render enough test items: ${JSON.stringify(initial)}`)
  }
  if (result.previewVisible) {
    throw new Error('Drag preview remained visible after drop.')
  }
  if (!immediateFeedback) {
    throw new Error('Drag did not show grab feedback after movement crossed the drag threshold.')
  }
  if (
    longTaskCount > 0 ||
    dragFrameSummary.p95Ms > 34 ||
    dragFrameSummary.below30FpsFrameRate > 0.02 ||
    dragFrameSummary.jankFrameRate > 0.02 ||
    dragFeedbackLatencyMs > 40
  ) {
    throw new Error(`Drag was not smooth enough: ${JSON.stringify(summary)}`)
  }
} finally {
  await browser.close()
}
