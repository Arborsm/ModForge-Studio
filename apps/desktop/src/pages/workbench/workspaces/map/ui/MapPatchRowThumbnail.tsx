import { useEffect, useRef, useState } from 'react'
import { Loader2, Map as MapIcon } from 'lucide-react'
import type { DraftPatch } from '@features/cp-maker'
import { loadMapThumbnail } from '@entities/map'
import { useLocale } from '@locales/provider'
import { useWorkbenchEnvironment } from '../../../model/workbenchModuleContexts'
import { loadGameMapDocument } from '../model/gameMapLoad'
import { resolvePatchThumbnailTarget } from '../state/mapAuthoringCatalog'

const THUMBNAIL_WIDTH = 96
const THUMBNAIL_HEIGHT = 96

/**
 * Lazily renders the current game map for a patch row through the shared map
 * thumbnail pipeline (`loadGameMapDocument` → `loadMapThumbnail`). Loading
 * starts only when the row enters the viewport, and only for a single literal
 * `Maps/` target with a connected game directory; multi-target/token Load
 * patches, missing directories, and failed loads fall back to a static map
 * icon block. Unmounts cancel the in-flight pipeline with a local guard.
 */
export function MapPatchRowThumbnail({ patch }: { patch: DraftPatch }) {
  const environment = useWorkbenchEnvironment()
  const locale = useLocale()
  const hostRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const gameRootPath = environment.directoryInfo?.rootPath ?? null
  const loadableTarget = resolvePatchThumbnailTarget(patch.target)

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !gameRootPath || !loadableTarget) return
    let cancelled = false
    setThumbnailUrl(null)
    setFailed(false)
    void loadGameMapDocument(gameRootPath, loadableTarget, locale)
      .then((document) =>
        loadMapThumbnail(document, {
          cacheKey: `patch:${patch.id}:${loadableTarget}`,
          locale,
          width: THUMBNAIL_WIDTH,
          height: THUMBNAIL_HEIGHT,
          gameRootPath,
        }),
      )
      .then((url) => {
        if (!cancelled) setThumbnailUrl(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [gameRootPath, loadableTarget, locale, patch.id, visible])

  const showSpinner = visible && !failed && loadableTarget !== null && gameRootPath !== null
  return (
    <span ref={hostRef} className="map-patch-row-thumb" aria-hidden="true">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" />
      ) : showSpinner ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <MapIcon className="h-6 w-6" />
      )}
    </span>
  )
}
