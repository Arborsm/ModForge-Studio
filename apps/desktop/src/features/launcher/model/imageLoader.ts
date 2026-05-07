import { useEffect, useMemo, useState } from 'react'
import { createResourceCache } from '@shared/lib/resources'
import { useLauncherPort } from '@features/launcher'
import type { LauncherPort } from './launcherPort'

const launcherImageCache = createResourceCache<string>({
  maxEntries: 96,
})

export async function loadLauncherImageUrl(url: string, launcherPort: LauncherPort, refresh = false) {
  if (refresh) {
    launcherImageCache.invalidate(url)
  }

  return launcherImageCache.load(url, async () => {
    const result = await launcherPort.resolveImage({ url, refresh })

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

export function useLauncherImage(url: string | null) {
  const launcherPort = useLauncherPort()
  const cachedImageUrl = useMemo(() => getCachedLauncherImageUrl(url), [url])
  const [loadedImage, setLoadedImage] = useState<{ url: string; imageUrl: string } | null>(null)
  const [loadError, setLoadError] = useState<{ url: string; error: string } | null>(null)

  useEffect(() => {
    let active = true

    if (!url || cachedImageUrl) {
      return () => {
        active = false
      }
    }

    void loadLauncherImageUrl(url, launcherPort).then((result) => {
      if (active) {
        setLoadedImage({ url, imageUrl: result })
      }
    }).catch((error: unknown) => {
      if (active) {
        setLoadError({ url, error: error instanceof Error ? error.message : 'Image load failed' })
      }
    })

    return () => {
      active = false
    }
  }, [url, cachedImageUrl, launcherPort])

  const imageUrl = cachedImageUrl ?? (loadedImage?.url === url ? loadedImage.imageUrl : null)
  const error = loadError?.url === url ? loadError : null

  return {
    imageUrl,
    loading: url !== null && !cachedImageUrl && !imageUrl && !error,
    error,
  }
}
