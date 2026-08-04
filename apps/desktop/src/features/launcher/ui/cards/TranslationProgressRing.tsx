import { useEffect, useState, type ReactNode } from 'react'
import { resolveTranslationProgress } from '@entities/ai'
import { cx } from '@shared/lib/helper'

const RING_CIRCUMFERENCE = 2 * Math.PI * 8.5

type TranslationProgressRingProps = {
  /** Whether the underlying translation job is loading; drives mount and exit fade. */
  visible: boolean
  /**
   * Determinate streaming progress. Null keeps the ring in its indeterminate
   * spin (non-streaming providers or before the first content commit).
   */
  progress: { completed: number; total: number } | null
  /** Accessible label for the status region. */
  label: string
  /** The icon the ring wraps. */
  children: ReactNode
}

/**
 * Circular SVG progress ring shown over the translate icon while a translation
 * job is loading. While streaming it renders a determinate arc
 * (completed/total items); without stream data it falls back to an
 * indeterminate spin. On settle (success/failure/cancel) the ring fades out
 * and hands the button back to the plain icon. The wrapped icon stays mounted
 * in every state — only the ring overlay appears/disappears — so the button
 * never renders empty.
 */
export function TranslationProgressRing({ visible, progress, label, children }: TranslationProgressRingProps) {
  const [rendered, setRendered] = useState(visible)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setLeaving(false)
      setRendered(true)
      return
    }
    // Job settled: keep the ring mounted briefly for the exit fade, then drop
    // it so the plain icon takes over without a hard pop.
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setLeaving(false)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [visible])

  const ratio = progress ? resolveTranslationProgress(progress.completed, progress.total).ratio : null

  return (
    <span className="launcher-mod-detail-ai-ring" role={rendered ? 'status' : undefined} aria-label={rendered ? label : undefined}>
      {rendered ? (
        <svg className={cx('launcher-mod-detail-ai-ring-svg', leaving && 'is-leaving')} viewBox="0 0 20 20" aria-hidden="true">
          <circle className="launcher-mod-detail-ai-ring-track" cx="10" cy="10" r="8.5" />
          <circle
            className={cx('launcher-mod-detail-ai-ring-arc', ratio === null && 'is-indeterminate')}
            cx="10"
            cy="10"
            r="8.5"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={ratio === null ? undefined : RING_CIRCUMFERENCE * (1 - ratio)}
          />
        </svg>
      ) : null}
      {children}
    </span>
  )
}
