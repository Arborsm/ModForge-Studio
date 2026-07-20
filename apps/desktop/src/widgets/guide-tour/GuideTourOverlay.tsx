import { useEffect, useState } from 'react'
import { useGuidesCopy } from '@locales/provider'
import type { GuideDefinition, GuideStepPlacement } from '@shared/contracts'
import { notifyGuideStepActivated } from '@shared/lib/guide-tour-events'
import { useGuideEngineStore } from '@features/guide'

const ANCHOR_PADDING = 8
const CARD_GAP = 12
const CARD_WIDTH = 340
const CARD_ESTIMATED_HEIGHT = 180
const SETTLE_AFTER_CHANGE_MS = 500

type AnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

function rectsEqual(a: AnchorRect | null, b: AnchorRect | null): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function findAnchorElement(anchor: string): Element | null {
  for (const element of document.querySelectorAll(`[data-guide="${anchor}"]`)) {
    if (element.getClientRects().length > 0) {
      return element
    }
  }
  return null
}

function readAnchorRect(anchor: string): AnchorRect | null {
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
function useAnchorRect(anchor: string | null, enabled: boolean): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null)

  useEffect(() => {
    if (!anchor || !enabled) {
      setRect(null)
      return
    }

    let frameId: number | null = null
    let lastRect: AnchorRect | null = null
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

function resolveCardPosition(rect: AnchorRect | null, placement: GuideStepPlacement): { top: number; left: number } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (!rect || placement === 'center') {
    return {
      top: Math.max(CARD_GAP, (viewportHeight - CARD_ESTIMATED_HEIGHT) / 2),
      left: Math.max(CARD_GAP, (viewportWidth - CARD_WIDTH) / 2),
    }
  }

  const clampLeft = (left: number) => Math.min(Math.max(CARD_GAP, left), viewportWidth - CARD_WIDTH - CARD_GAP)
  const centeredLeft = clampLeft(rect.left + rect.width / 2 - CARD_WIDTH / 2)
  const centeredTop = rect.top + rect.height / 2 - CARD_ESTIMATED_HEIGHT / 2
  const clampTop = (top: number) => Math.min(Math.max(CARD_GAP, top), viewportHeight - CARD_ESTIMATED_HEIGHT - CARD_GAP)

  switch (placement) {
    case 'top':
      return { top: clampTop(rect.top - CARD_ESTIMATED_HEIGHT - CARD_GAP), left: centeredLeft }
    case 'left':
      return { top: clampTop(centeredTop), left: clampLeft(rect.left - CARD_WIDTH - CARD_GAP) }
    case 'right':
      return { top: clampTop(centeredTop), left: clampLeft(rect.left + rect.width + CARD_GAP) }
    case 'bottom':
    default:
      return { top: clampTop(rect.top + rect.height + CARD_GAP), left: centeredLeft }
  }
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
  const position = resolveCardPosition(rect, step.placement ?? (step.anchor ? 'bottom' : 'center'))
  const isLastStep = stepIndex === definition.steps.length - 1

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

  return (
    <>
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
        className="guide-tour-card"
        role="dialog"
        aria-label={stepCopy?.title ?? step.id}
        style={{ top: position.top, left: position.left }}
      >
        <div className="guide-tour-card-eyebrow">
          <span>{guideCopy?.title ?? definition.id}</span>
          <span>{copy.controls.stepCounter(stepIndex + 1, definition.steps.length)}</span>
        </div>
        <div className="guide-tour-card-title">{stepCopy?.title ?? step.id}</div>
        <div className="guide-tour-card-description">{stepCopy?.description ?? ''}</div>
        <div className="guide-tour-card-actions">
          <button type="button" className="guide-tour-btn guide-tour-btn-ghost" onClick={skipActiveGuide}>
            {copy.controls.skip}
          </button>
          <div className="guide-tour-card-actions-primary">
            {stepIndex > 0 ? (
              <button type="button" className="guide-tour-btn guide-tour-btn-ghost" onClick={previousGuideStep}>
                {copy.controls.previous}
              </button>
            ) : null}
            <button type="button" className="guide-tour-btn guide-tour-btn-primary" onClick={nextGuideStep}>
              {isLastStep ? copy.controls.finish : copy.controls.next}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Global guide layer, mounted once by the app shell next to the dialog and
 * notification layers. Renders inside the app window frame (no portal) so the
 * `--z-guide` layer stacks below dialogs and floating windows such as settings,
 * which share the frame's isolated stacking context. Renders nothing unless a
 * guide run is active.
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

  const step = definition.steps[activeRun.stepIndex]

  return (
    <div className={step?.anchor ? 'guide-tour-backdrop' : 'guide-tour-backdrop guide-tour-backdrop--dimmed'}>
      <GuideTourCard definition={definition} stepIndex={activeRun.stepIndex} />
    </div>
  )
}
