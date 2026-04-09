import { convertFileSrc } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
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

export function useLauncherImage(url: string | null) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(() => {
      if (!active) {
        return
      }

      if (!url) {
        setImageUrl(null)
        setError(null)
        setLoading(false)
        return
      }

      setImageUrl(null)
      setError(null)
      setLoading(true)

      void loadLauncherImageUrl(url)
        .then((value) => {
          if (!active) {
            return
          }
          setImageUrl(value)
          setLoading(false)
        })
        .catch((nextError) => {
          if (!active) {
            return
          }
          setError(nextError instanceof Error ? nextError.message : 'Failed to load image.')
          setLoading(false)
        })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [url])

  return {
    imageUrl: url ? imageUrl : null,
    error: url ? error : null,
    loading: url ? loading : false,
  }
}
