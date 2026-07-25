import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGuidesCopy } from '@locales/provider'
import type { GuideDefinition } from '@shared/contracts'
import { notifyGuideStepActivated } from '@shared/lib/guide-tour-events'
import { resolveGuideCardLayout, useGuideEngineStore, type GuideAnchorRect, type GuideCardSize } from '@features/guide'

const ANCHOR_PADDING = 8
const CARD_GAP = 12
/** Fallback size used for the single frame before the card is measured. */
const CARD_FALLBACK_SIZE: GuideCardSize = { width: 340, height: 220 }
const SETTLE_AFTER_CHANGE_MS = 500

function rectsEqual(a: GuideAnchorRect | null, b: GuideAnchorRect | null): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** Reads the app titlebar height (px) so the card never covers window controls. */
function readTitlebarHeight(): number {
  const rootStyle = getComputedStyle(document.documentElement)
  const raw = rootStyle.getPropertyValue('--app-titlebar-height').trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) {
    return 0
  }
  if (raw.endsWith('rem')) {
    const rootFontSize = Number.parseFloat(rootStyle.fontSize)
    return value * (Number.isFinite(rootFontSize) ? rootFontSize : 16)
  }
  return value
}

function findAnchorElement(anchor: string): Element | null {
  for (const element of document.querySelectorAll(`[data-guide="${anchor}"]`)) {
    if (element.getClientRects().length > 0) {
      return element
    }
  }
  return null
}

function readAnchorRect(anchor: string): GuideAnchorRect | null {
  const element = findAnchorElement(anchor)
  if (!element) {
    return null
  }

  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return null
  }

  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

/** Returns the `data-guide-surface` value of the first surface element currently visible. */
function resolveVisibleGuideSurface(): string | null {
  for (const element of document.querySelectorAll('[data-guide-surface]')) {
    if (element.getClientRects().length > 0) {
      return element.getAttribute('data-guide-surface')
    }
  }
  return null
}

/**
 * Watches the DOM for visible guide surfaces and reports changes to the engine.
 * Pages expose surfaces purely through `data-guide-surface` attributes, which
 * keeps guide triggering decoupled from page code.
 */
function useGuideSurfaceWatcher() {
  const notifyGuideSurface = useGuideEngineStore((state) => state.notifyGuideSurface)

  useEffect(() => {
    let frameId: number | null = null

    const report = () => {
      if (frameId !== null) {
        return
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        notifyGuideSurface(resolveVisibleGuideSurface())
      })
    }

    const observer = new MutationObserver(report)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style', 'data-guide-surface'],
    })
    window.addEventListener('resize', report)
    report()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [notifyGuideSurface])
}

/** Tracks the bounding rect of the active step anchor, updating on layout shifts. */
function useAnchorRect(anchor: string | null, enabled: boolean): GuideAnchorRect | null {
  const [rect, setRect] = useState<GuideAnchorRect | null>(null)

  useEffect(() => {
    if (!anchor || !enabled) {
      setRect(null)
      return
    }

    let frameId: number | null = null
    let lastRect: GuideAnchorRect | null = null
    let settleUntil = 0
    let scrolledToAnchor = false

    const update = () => {
      frameId = null
      const element = findAnchorElement(anchor)
      if (element && !scrolledToAnchor) {
        scrolledToAnchor = true
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
      const next = readAnchorRect(anchor)
      if (!rectsEqual(lastRect, next)) {
        lastRect = next
        setRect(next)
        // Layout keeps shifting for a while (reveal transitions, smooth scroll),
        // so keep measuring until the rect stays stable.
        settleUntil = performance.now() + SETTLE_AFTER_CHANGE_MS
      }
      if (performance.now() < settleUntil) {
        frameId = window.requestAnimationFrame(update)
      }
    }
    const schedule = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(update)
      }
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    update()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [anchor, enabled])

  return rect
}

/** Re-renders on viewport resize so card layout is re-resolved. */
function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}

/** Measures the rendered card so layout never relies on an estimated height. */
function useCardSize(ref: React.RefObject<HTMLDivElement | null>, stepId: string): GuideCardSize | null {
  const [size, setSize] = useState<GuideCardSize | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()

    return () => observer.disconnect()
  }, [ref, stepId])

  return size
}

/** Scrim rectangles surrounding the anchor hole; the hole itself is clickable. */
function GuideTourScrims({ rect }: { rect: GuideAnchorRect | null }) {
  const titlebarHeight = readTitlebarHeight()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (!rect) {
    return (
      <div
        className="guide-tour-scrim"
        style={{ top: titlebarHeight, left: 0, width: viewportWidth, height: viewportHeight - titlebarHeight }}
        aria-hidden="true"
      />
    )
  }

  const hole = {
    top: Math.max(titlebarHeight, rect.top - ANCHOR_PADDING),
    left: Math.max(0, rect.left - ANCHOR_PADDING),
    right: Math.min(viewportWidth, rect.left + rect.width + ANCHOR_PADDING),
    bottom: Math.min(viewportHeight, rect.top + rect.height + ANCHOR_PADDING),
  }

  const segments: GuideAnchorRect[] = [
    { top: titlebarHeight, left: 0, width: viewportWidth, height: Math.max(0, hole.top - titlebarHeight) },
    { top: hole.bottom, left: 0, width: viewportWidth, height: Math.max(0, viewportHeight - hole.bottom) },
    { top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top },
    { top: hole.top, left: hole.right, width: Math.max(0, viewportWidth - hole.right), height: hole.bottom - hole.top },
  ]

  return (
    <>
      {segments.map((segment, index) => (
        <div
          key={index}
          className="guide-tour-scrim"
          style={{ top: segment.top, left: segment.left, width: segment.width, height: segment.height }}
          aria-hidden="true"
        />
      ))}
    </>
  )
}

function GuideTourCard({ definition, stepIndex }: { definition: GuideDefinition; stepIndex: number }) {
  const copy = useGuidesCopy()
  const nextGuideStep = useGuideEngineStore((state) => state.nextGuideStep)
  const previousGuideStep = useGuideEngineStore((state) => state.previousGuideStep)
  const skipActiveGuide = useGuideEngineStore((state) => state.skipActiveGuide)

  const step = definition.steps[stepIndex]
  const guideCopy = copy.definitions[definition.id as keyof typeof copy.definitions]
  const stepCopy = guideCopy?.steps[step.id]
  const rect = useAnchorRect(step.anchor ?? null, true)
  const viewport = useViewportSize()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const cardSize = useCardSize(cardRef, step.id)
  const layout = resolveGuideCardLayout({
    anchorRect: rect,
    cardSize: cardSize ?? CARD_FALLBACK_SIZE,
    placement: step.placement ?? (step.anchor ? 'bottom' : 'center'),
    viewport,
    titlebarHeight: readTitlebarHeight(),
    gap: CARD_GAP,
  })
  const isLastStep = stepIndex === definition.steps.length - 1
  const advanceOnClick = step.advanceOn === 'anchor-click' && Boolean(step.anchor)

  // Interactive steps advance when the user clicks the highlighted anchor. The
  // anchor may appear after the step activates (pages reveal it on demand), so
  // the listener waits until the anchor rect resolves.
  useEffect(() => {
    if (!advanceOnClick || !step.anchor || !rect) {
      return
    }
    const element = findAnchorElement(step.anchor)
    if (!element) {
      return
    }
    const onAnchorClick = () => nextGuideStep()
    element.addEventListener('click', onAnchorClick, true)
    return () => element.removeEventListener('click', onAnchorClick, true)
  }, [advanceOnClick, step.anchor, rect, nextGuideStep])

  // Move focus onto the card for each step and restore it when the tour ends.
  useEffect(() => {
    const active = document.activeElement
    const previous = active instanceof HTMLElement && !active.closest('.guide-tour-card') ? active : null
    cardRef.current?.focus()
    return () => {
      if (document.activeElement?.closest('.guide-tour-card')) {
        previous?.focus()
      }
    }
  }, [step.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        skipActiveGuide()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextGuideStep()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previousGuideStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextGuideStep, previousGuideStep, skipActiveGuide])

  const descriptionId = `guide-tour-step-${step.id}-description`

  return (
    <>
      <GuideTourScrims rect={rect} />
      {rect ? (
        <div
          className="guide-tour-highlight"
          style={{
            top: rect.top - ANCHOR_PADDING,
            left: rect.left - ANCHOR_PADDING,
            width: rect.width + ANCHOR_PADDING * 2,
            height: rect.height + ANCHOR_PADDING * 2,
          }}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={cardRef}
        className="guide-tour-card"
        role="dialog"
        aria-modal="true"
        aria-label={stepCopy?.title ?? step.id}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={{ top: layout.top, left: layout.left, visibility: cardSize ? 'visible' : 'hidden' }}
      >
        {layout.arrow ? (
          <div
            className={`guide-tour-arrow guide-tour-arrow--${layout.arrow.side}`}
            style={
              layout.arrow.side === 'top' || layout.arrow.side === 'bottom' ? { left: layout.arrow.offset } : { top: layout.arrow.offset }
            }
            aria-hidden="true"
          />
        ) : null}
        <div className="guide-tour-card-content" key={step.id}>
          <div className="guide-tour-card-eyebrow">
            <span>{guideCopy?.title ?? definition.id}</span>
            <span>{copy.controls.stepCounter(stepIndex + 1, definition.steps.length)}</span>
          </div>
          <div className="guide-tour-card-title">{stepCopy?.title ?? step.id}</div>
          <div className="guide-tour-card-description" id={descriptionId}>
            {stepCopy?.description ?? ''}
          </div>
          {advanceOnClick ? <div className="guide-tour-card-hint">{copy.controls.anchorClickHint}</div> : null}
          <div className="guide-tour-card-actions">
            <button type="button" className="guide-tour-btn guide-tour-btn-ghost" onClick={skipActiveGuide}>
              {copy.controls.skip}
            </button>
            <div className="guide-tour-dots" aria-hidden="true">
              {definition.steps.map((candidate, index) => (
                <span key={candidate.id} className={index === stepIndex ? 'guide-tour-dot guide-tour-dot--active' : 'guide-tour-dot'} />
              ))}
            </div>
            <div className="guide-tour-card-actions-primary">
              {stepIndex > 0 ? (
                <button type="button" className="guide-tour-btn guide-tour-btn-ghost" onClick={previousGuideStep}>
                  {copy.controls.previous}
                </button>
              ) : null}
              {advanceOnClick ? null : (
                <button type="button" className="guide-tour-btn guide-tour-btn-primary" onClick={nextGuideStep}>
                  {isLastStep ? copy.controls.finish : copy.controls.next}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Global guide layer, mounted once by the app shell next to the dialog and
 * notification layers. Portals to `document.body` like the dialog and drawer
 * layers so `--z-guide` stacks above page-level drawers (`--z-drawer`) and
 * below true dialogs (`--z-dialog`). The app shell unmounts the overlay while
 * the settings window is open (settings renders inside the window frame); the
 * engine keeps the run state, so the guide resumes when settings closes.
 * Renders nothing unless a guide run is active.
 */
export function GuideTourOverlay() {
  const activeRun = useGuideEngineStore((state) => state.activeRun)
  const definition = useGuideEngineStore((state) => (state.activeRun ? state.definitions[state.activeRun.guideId] : null))

  useGuideSurfaceWatcher()

  const activeStep = activeRun && definition ? definition.steps[activeRun.stepIndex] : null
  const activeGuideId = activeRun?.guideId ?? null
  const activeStepId = activeStep?.id ?? null
  const activeStepAnchor = activeStep?.anchor ?? null

  // Announce the active step so pages can reveal the anchored UI (drawers,
  // detail panels) without coupling to the guide engine.
  useEffect(() => {
    if (!activeGuideId || !activeStepId) {
      return
    }
    notifyGuideStepActivated({ guideId: activeGuideId, stepId: activeStepId, anchor: activeStepAnchor })
  }, [activeGuideId, activeStepId, activeStepAnchor])

  if (!activeRun || !definition) {
    return null
  }

  return createPortal(
    <div className="guide-tour-backdrop">
      <GuideTourCard definition={definition} stepIndex={activeRun.stepIndex} />
    </div>,
    document.body,
  )
}
