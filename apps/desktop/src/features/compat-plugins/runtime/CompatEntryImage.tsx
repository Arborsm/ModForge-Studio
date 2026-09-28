/**
 * @file Lazy-loaded entry image for compat plugin pages. Renders a
 * `texture.png`-style preview as a data URL via `loadImageDataUrl`, deferring
 * the load until the element is near the viewport (IntersectionObserver) and
 * capping concurrent decodes so a long entry list does not flood the host.
 * Used both as a small list thumbnail and as a compact editor preview.
 * @module features/compat-plugins
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { loadImageDataUrl } from '@entities/game/api'
import { useCompatModuleCopy } from '@locales/provider'
import { reportRecovered } from '@platform/observability'

/** Display size of the entry image. */
type CompatEntryImageSize = 'thumbnail' | 'preview'

type CompatEntryImageProps = {
  /** Absolute path of the entry image file (e.g. `texture.png`); null renders nothing. */
  imagePath: string | null
  /** Display size: `thumbnail` for list rows, `preview` for the editor header. */
  size?: CompatEntryImageSize
  /** Alt text for the rendered image. */
  alt: string
}

// Concurrent decode pool: at most 4 entry images decode at once so a long
// aggregated list does not starve other host image loads. Each pending load
// parks on the queue until a slot frees.
const POOL_LIMIT = 4
let activeCount = 0
const poolQueue: (() => void)[] = []

function releasePoolSlot(): void {
  const next = poolQueue.shift()
  if (next) {
    next()
  } else {
    activeCount -= 1
  }
}

function acquirePoolSlot(): Promise<void> {
  if (activeCount < POOL_LIMIT) {
    activeCount += 1
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    poolQueue.push(() => {
      activeCount += 1
      resolve()
    })
  })
}

/**
 * Renders a lazy-loaded entry image. The load is deferred until the element
 * is near the viewport (IntersectionObserver), then gated by the concurrent
 * decode pool. Pixel art is rendered with `image-rendering: pixelated`. While
 * loading or when the path is null, a placeholder of the same size keeps the
 * layout stable.
 */
export const CompatEntryImage: ComponentType<CompatEntryImageProps> = function CompatEntryImage({
  imagePath,
  size = 'thumbnail',
  alt,
}: CompatEntryImageProps) {
  const copy = useCompatModuleCopy()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const visibleRef = useRef(false)

  useEffect(() => {
    if (!imagePath) return
    let cancelled = false
    const element = containerRef.current
    if (!element) return

    const startLoad = () => {
      if (cancelled || visibleRef.current) return
      visibleRef.current = true
      void (async () => {
        await acquirePoolSlot()
        if (cancelled) {
          releasePoolSlot()
          return
        }
        try {
          const url = await loadImageDataUrl(imagePath)
          if (!cancelled) setDataUrl(url)
        } catch (error) {
          reportRecovered(error, 'compat-plugins.entry-image')
          if (!cancelled) setFailed(true)
        } finally {
          releasePoolSlot()
        }
      })()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) startLoad()
        }
      },
      { rootMargin: '128px' },
    )
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [imagePath])

  if (!imagePath) return null

  const placeholderLabel = failed ? copy.entryImageFailed : copy.entryImageLoading

  return (
    <div
      ref={containerRef}
      className={size === 'preview' ? 'compat-entry-image-preview' : 'compat-entry-image-thumb'}
      role="img"
      aria-label={dataUrl ? alt : placeholderLabel}
    >
      {dataUrl ? (
        <img src={dataUrl} alt={alt} className="compat-entry-image-img" />
      ) : (
        <span className="compat-entry-image-placeholder" aria-hidden="true">
          {placeholderLabel}
        </span>
      )}
    </div>
  )
}
