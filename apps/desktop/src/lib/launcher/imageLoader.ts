import { convertFileSrc } from '@tauri-apps/api/core'
import { useEffect, useMemo, useState } from 'react'
import { resolveLauncherImage } from '../desktop'
import { createResourceCache } from '../resources/resourceCache'

const launcherImageCache = createResourceCache<string>({
  maxEntries: 96,
})

export async function loadLauncherImageUrl(url: string, refresh = false) {
  if (refresh) {
    launcherImageCache.invalidate(url)
  }

  return launcherImageCache.load(url, async () => {
    const result = await resolveLauncherImage({ url, refresh })

    return {
      value: convertFileSrc(result.localPath),
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

    void loadLauncherImageUrl(url)
      .then((value) => {
        if (!active) {
          return
        }
        setLoadedImage({ url, imageUrl: value })
        setLoadError(null)
      })
      .catch((nextError) => {
        if (!active) {
          return
        }
        setLoadError({
          url,
          error: nextError instanceof Error ? nextError.message : 'Failed to load image.',
        })
      })

    return () => {
      active = false
    }
  }, [cachedImageUrl, url])

  const imageUrl = cachedImageUrl ?? (url && loadedImage?.url === url ? loadedImage.imageUrl : null)
  const error = url && !cachedImageUrl && loadError?.url === url ? loadError.error : null
  const loading = Boolean(url && !cachedImageUrl && !imageUrl && !error)

  return {
    imageUrl: url ? imageUrl : null,
    error: url ? error : null,
    loading: url ? loading : false,
  }
}
