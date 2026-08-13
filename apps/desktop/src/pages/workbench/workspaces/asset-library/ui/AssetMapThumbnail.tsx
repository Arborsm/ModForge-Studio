import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { loadMapThumbnail } from '@entities/map'
import { useLocale } from '@locales/provider'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { parseProjectMapDocument } from '../model/projectMapPreview'

/**
 * Deduplicates in-flight project map asset loads per draft + path.
 *
 * `loadCpMakerProjectMapAsset` is dispatched with a `keyedLatest` host command
 * policy, so concurrent calls for the same asset path supersede each other and
 * the earlier caller receives a `TaskCancelledError`. Multiple thumbnail
 * instances (card grid + inspector, or repeated cards) can request the same
 * map within the same tick; this cache ensures only one host command is
 * in-flight at a time and every caller awaits the same promise. The entry is
 * cleared on settle so subsequent loads (e.g. after asset edits) re-fetch.
 */
const projectMapAssetLoadCache = new Map<string, Promise<unknown>>()

function dedupedLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = projectMapAssetLoadCache.get(key)
  if (existing) return existing as Promise<T>
  const promise = loader().finally(() => {
    projectMapAssetLoadCache.delete(key)
  })
  projectMapAssetLoadCache.set(key, promise)
  return promise
}

/**
 * Lazily renders a cached thumbnail for a project TMX/TBIN asset through the
 * shared map thumbnail pipeline (`loadCpMakerProjectMapAsset` → MapDocument →
 * `loadMapThumbnail`). Loading starts when the host enters the viewport;
 * failures fall back to the provided fallback node. Unmount and asset
 * switches cancel the in-flight pipeline with a local effect guard.
 */
export function AssetMapThumbnail({
  assetPath,
  sha256,
  width,
  height,
  fallback,
}: {
  assetPath: string
  sha256: string
  width: number
  height: number
  fallback: ReactNode
}) {
  const project = useWorkbenchProject()
  const locale = useLocale()
  const hostRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const loadProjectMapAsset = project.loadProjectMapAsset
  const draftStorageKey = project.activeDraft?.draftStorageKey ?? ''

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
    if (!visible) return
    let cancelled = false
    setThumbnailUrl(null)
    setFailed(false)
    void dedupedLoad(`${draftStorageKey}::${assetPath}`, () => loadProjectMapAsset(assetPath))
      .then((loaded) => parseProjectMapDocument(loaded.content))
      .then((document) => {
        if (cancelled) return undefined
        if (!document) {
          setFailed(true)
          return undefined
        }
        const cacheKey = `project:${assetPath}:${sha256}:${document.sourcePath}:${document.width}x${document.height}`
        return loadMapThumbnail(document, { cacheKey, locale, width, height })
      })
      .then((url) => {
        if (!cancelled && typeof url === 'string') setThumbnailUrl(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [assetPath, draftStorageKey, height, locale, loadProjectMapAsset, sha256, visible, width])

  return (
    <span ref={hostRef} className="asset-map-thumbnail" aria-hidden="true">
      {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : visible && !failed ? <Loader2 className="h-5 w-5 animate-spin" /> : fallback}
    </span>
  )
}
