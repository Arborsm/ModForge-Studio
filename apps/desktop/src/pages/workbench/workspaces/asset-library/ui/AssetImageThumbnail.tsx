import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'

/**
 * Content-addressed (path + sha256) data-URL cache shared by all image
 * thumbnails in the asset library grid. Entries are LRU-evicted; a typical
 * tilesheet weighs ~1 MB as base64, so the cap keeps worst-case memory bounded.
 */
const thumbnailCache = new Map<string, string>()
const THUMBNAIL_CACHE_LIMIT = 60

function readCachedThumbnail(key: string) {
  const hit = thumbnailCache.get(key)
  if (hit) {
    thumbnailCache.delete(key)
    thumbnailCache.set(key, hit)
  }
  return hit
}

function writeCachedThumbnail(key: string, dataUrl: string) {
  thumbnailCache.set(key, dataUrl)
  if (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldest = thumbnailCache.keys().next().value
    if (oldest) thumbnailCache.delete(oldest)
  }
}

/**
 * Lazily renders a project image asset inside grid/list cards. Bytes load only
 * when the host enters the viewport (mirrors `AssetMapThumbnail`); results are
 * cached per content hash so scrolling and re-selection never re-read the
 * disk. Failures and pending loads render the provided fallback glyph.
 */
export function AssetImageThumbnail({
  assetPath,
  sha256,
  mediaType,
  fallback,
}: {
  assetPath: string
  sha256: string
  mediaType: string
  fallback: ReactNode
}) {
  const project = useWorkbenchProject()
  const hostRef = useRef<HTMLSpanElement>(null)
  const cacheKey = `${assetPath}:${sha256}`
  const [visible, setVisible] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(() => readCachedThumbnail(cacheKey) ?? null)
  const readProjectAsset = project.readProjectAsset

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
    setDataUrl(readCachedThumbnail(cacheKey) ?? null)
  }, [cacheKey])

  useEffect(() => {
    if (!visible || dataUrl) return
    let cancelled = false
    void readProjectAsset(assetPath)
      .then((payload) => {
        if (cancelled) return
        const url = `data:${payload.asset.mediaType};base64,${payload.bytesBase64}`
        writeCachedThumbnail(cacheKey, url)
        setDataUrl(url)
      })
      .catch(() => {
        // Keep the fallback glyph: a broken thumbnail must not break the grid.
      })
    return () => {
      cancelled = true
    }
  }, [assetPath, cacheKey, dataUrl, readProjectAsset, visible])

  return (
    <span ref={hostRef} className="asset-image-thumbnail" aria-hidden="true" data-media-type={mediaType}>
      {dataUrl ? <img src={dataUrl} alt="" /> : fallback}
    </span>
  )
}
