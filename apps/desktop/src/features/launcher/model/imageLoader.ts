import { useEffect, useState } from 'react'
import { createResourceCache } from '@shared/lib/resources'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherPort } from './launcherPort'

const launcherImageCache = createResourceCache<string>({
  maxEntries: 96,
})

export async function loadLauncherImageUrl(url: string, launcherPort: LauncherPort, refresh = false, modKey: string | null = null) {
  if (refresh) {
    launcherImageCache.invalidate(url)
  }

  return launcherImageCache.load(url, async () => {
    if (!refresh) {
      const cached = await launcherPort.resolveCachedImage({ url, refresh, modKey })
      if (cached) {
        return {
          value: launcherPort.toDesktopAssetUrl(cached.localPath),
        }
      }
    }

    const result = await launcherPort.resolveImage({ url, refresh, modKey })

    return {
      value: launcherPort.toDesktopAssetUrl(result.localPath),
    }
  })
}

function getCachedLauncherImageUrl(url: string | null) {
  if (!url) {
    return null
  }

  return launcherImageCache.get(url)
}

export function useLauncherImage(url: string | null, modKey: string | null = null) {
  const launcherPort = useLauncherPort()
  const cachedImageUrl = getCachedLauncherImageUrl(url)
  const [loadedImage, setLoadedImage] = useState<{ url: string; imageUrl: string } | null>(null)
  const [loadError, setLoadError] = useState<{ url: string; error: string } | null>(null)

  useEffect(() => {
    let active = true
    const normalizedModKey = modKey?.trim() ?? ''

    if (!url || cachedImageUrl) {
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        const result = await loadLauncherImageUrl(url, launcherPort, false, normalizedModKey || null)
        if (active) {
          setLoadedImage({ url, imageUrl: result })
        }
      } catch (error: unknown) {
        if (active) {
          const message = error instanceof Error ? error.message : 'Image load failed'
          setLoadError({ url, error: message })
        }
      }
    })()

    return () => {
      active = false
    }
  }, [url, cachedImageUrl, launcherPort, modKey])

  const imageUrl = cachedImageUrl ?? (loadedImage?.url === url ? loadedImage.imageUrl : null)
  const error = loadError?.url === url ? loadError : null

  return {
    imageUrl,
    loading: url !== null && !cachedImageUrl && !imageUrl && !error,
    error,
  }
}
