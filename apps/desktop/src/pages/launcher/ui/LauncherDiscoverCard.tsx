import { CalendarDays, Download, ExternalLink, HardDrive } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { openLauncherUrl } from '@features/launcher/api'
import { getLauncherCardMonogram, useLauncherImage } from '@features/launcher'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { Tooltip } from '@shared/ui/Tooltip'
import { formatCompactNumber, formatFileSize, formatRelativeDate } from './launcherDiscoverFormat'

type LauncherDiscoverCardItem = {
  modId: number
  modUrl: string
  title: string
  author: string | null
  uploader: string | null
  category: string | null
  summary: string | null
  imageUrl: string | null
  updatedAt: string | null
  createdAt: string | null
  downloads: number | null
  fileSize: number | null
  updateAvailable: boolean
}

type DiscoverTitleMarqueeStyle = CSSProperties & {
  '--launcher-discover-title-distance': string
  '--launcher-discover-title-duration': string
}

const DISCOVER_CARD_SINGLE_CLICK_DELAY_MS = 180
const DISCOVER_TITLE_SCROLL_SPEED_PX_PER_SECOND = 24
const DISCOVER_TITLE_SCROLL_MIN_DURATION_SECONDS = 7
const DISCOVER_TITLE_SCROLL_MAX_DURATION_SECONDS = 16

function DiscoverCardTitle({ title }: { title: string }) {
  const frameRef = useRef<HTMLSpanElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [scrollState, setScrollState] = useState({ enabled: false, distance: 0, duration: DISCOVER_TITLE_SCROLL_MIN_DURATION_SECONDS })

  useEffect(() => {
    const frame = frameRef.current
    const text = textRef.current
    if (!frame || !text) {
      return undefined
    }

    const updateScrollState = () => {
      const distance = Math.ceil(text.scrollWidth - frame.clientWidth)
      const enabled = distance > 2
      const duration = Math.min(
        DISCOVER_TITLE_SCROLL_MAX_DURATION_SECONDS,
        Math.max(DISCOVER_TITLE_SCROLL_MIN_DURATION_SECONDS, distance / DISCOVER_TITLE_SCROLL_SPEED_PX_PER_SECOND),
      )

      setScrollState({ enabled, distance: Math.max(0, distance), duration })
    }

    updateScrollState()

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(frame)
    resizeObserver?.observe(text)
    window.addEventListener('resize', updateScrollState)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateScrollState)
    }
  }, [title])

  const style: DiscoverTitleMarqueeStyle | undefined = scrollState.enabled
    ? {
        '--launcher-discover-title-distance': `${scrollState.distance}px`,
        '--launcher-discover-title-duration': `${scrollState.duration}s`,
      }
    : undefined

  return (
    <Tooltip label={title} disabled={!scrollState.enabled} className="launcher-discover-title-tooltip-anchor" placement="bottom">
      <span
        ref={frameRef}
        className={cx('launcher-discover-wall-title', scrollState.enabled && 'launcher-discover-wall-title-marquee')}
        style={style}
      >
        <span ref={textRef} className="launcher-discover-wall-title-text">
          {title}
        </span>
      </span>
    </Tooltip>
  )
}

type LauncherDiscoverCardProps = {
  item: LauncherDiscoverCardItem
  onOpenDetails: () => void
  onQueueDownload: () => void
}

/** Renders one Nexus discover result card with cover fallback, delayed details click, and quick download action. */
export function LauncherDiscoverCard({ item, onOpenDetails, onQueueDownload }: LauncherDiscoverCardProps) {
  const copy = useEditorCopy().launcher
  const image = useLauncherImage(item.imageUrl)
  const coverMonogram = getLauncherCardMonogram(item.title)
  const singleClickTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (singleClickTimeoutRef.current !== null) {
        window.clearTimeout(singleClickTimeoutRef.current)
      }
    }
  }, [])

  const scheduleOpenDetails = () => {
    if (singleClickTimeoutRef.current !== null) {
      window.clearTimeout(singleClickTimeoutRef.current)
    }

    singleClickTimeoutRef.current = window.setTimeout(() => {
      singleClickTimeoutRef.current = null
      onOpenDetails()
    }, DISCOVER_CARD_SINGLE_CLICK_DELAY_MS)
  }

  const openModPage = () => {
    if (singleClickTimeoutRef.current !== null) {
      window.clearTimeout(singleClickTimeoutRef.current)
      singleClickTimeoutRef.current = null
    }

    void openLauncherUrl({ url: item.modUrl })
  }

  return (
    <article className="launcher-discover-wall-card panel-section">
      <div className="launcher-discover-wall-media">
        <button
          type="button"
          className="launcher-discover-wall-cover"
          aria-label={`${copy.library.detailsTitle}: ${item.title}`}
          aria-busy={image.loading ? 'true' : undefined}
          onClick={scheduleOpenDetails}
          onDoubleClick={openModPage}
        >
          {image.loading ? <ImageSkeleton overlay rounded={false} className="launcher-discover-wall-cover-skeleton" /> : null}
          {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-discover-card-image" /> : null}
          {!image.imageUrl && !image.loading ? (
            <span className="launcher-discover-wall-cover-fallback">
              <span className="launcher-discover-wall-cover-monogram" aria-hidden="true">
                {coverMonogram}
              </span>
            </span>
          ) : null}
          {item.updateAvailable ? <span className="launcher-discover-wall-badge">{copy.discover.updateAvailable}</span> : null}
        </button>
        <button
          type="button"
          className="launcher-discover-wall-cover-overlay"
          aria-label={copy.actions.openModPage}
          title={copy.actions.openModPage}
          onClick={openModPage}
        >
          <ExternalLink className="h-4 w-4" />
          <span>{copy.actions.openModPage}</span>
        </button>
      </div>
      <div className="launcher-discover-wall-body">
        <button type="button" className="launcher-discover-wall-copy" onClick={scheduleOpenDetails} onDoubleClick={openModPage}>
          <div className="launcher-discover-wall-title-slot">
            <DiscoverCardTitle title={item.title} />
          </div>
          <p className="launcher-discover-wall-author">{item.author ?? item.uploader ?? `Nexus #${item.modId}`}</p>
          <p className="launcher-discover-wall-category">{item.category ?? copy.discover.fallbackCategory}</p>
          <div className="launcher-discover-wall-summary-slot">
            <p className="launcher-discover-wall-summary">{item.summary ?? copy.states.noSummary}</p>
          </div>
        </button>
        <div className="launcher-discover-card-footer">
          <div className="launcher-discover-wall-meta">
            <span className="launcher-discover-wall-meta-chip">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{formatRelativeDate(item.updatedAt ?? item.createdAt)}</span>
            </span>
            <span className="launcher-discover-wall-meta-chip">
              <Download className="h-3.5 w-3.5" />
              <span>{formatCompactNumber(item.downloads)}</span>
            </span>
            <span className="launcher-discover-wall-meta-chip">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{formatFileSize(item.fileSize)}</span>
            </span>
          </div>
          <button
            type="button"
            className="launcher-discover-card-quick-action"
            onClick={onQueueDownload}
            aria-label={copy.actions.queueDownload}
            title={copy.actions.queueDownload}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  )
}
