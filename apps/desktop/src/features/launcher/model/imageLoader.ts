import { useEffect, useState } from 'react'
import { createResourceCache } from '@shared/lib/resources'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherPort } from './launcherPort'

const launcherImageCache = createResourceCache<string>({
  maxEntries: 96,
})

function normalizeModKey(value: string | null | undefined) {
  return value?.trim() ?? ''
}

async function loadLauncherImageBlocked(modKey: string, launcherPort: LauncherPort) {
  const failures = await launcherPort.loadImageFailures()
  return failures.entries.some((entry) => entry.modKey.trim() === modKey && entry.blocked)
}

export async function loadLauncherImageUrl(url: string, launcherPort: LauncherPort, refresh = false, modKey: string | null = null) {
  if (refresh) {
    launcherImageCache.invalidate(url)
  }

  return launcherImageCache.load(url, async () => {
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
  const [blockedImage, setBlockedImage] = useState<{ modKey: string; url: string; blocked: boolean } | null>(null)

  useEffect(() => {
    let active = true
    const normalizedModKey = normalizeModKey(modKey)

    if (!url || cachedImageUrl) {
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        if (normalizedModKey) {
          const isBlocked = await loadLauncherImageBlocked(normalizedModKey, launcherPort)
          if (!active) {
            return
          }
          setBlockedImage({ modKey: normalizedModKey, url, blocked: isBlocked })
          if (isBlocked) {
            return
          }
        }

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
  const blocked = blockedImage?.url === url && blockedImage.modKey === normalizeModKey(modKey) ? blockedImage.blocked : false
  const error = loadError?.url === url ? loadError : null

  return {
    imageUrl: blocked ? null : imageUrl,
    loading: url !== null && !blocked && !cachedImageUrl && !imageUrl && !error,
    error: blocked ? { url, error: 'Launcher image loading is disabled after repeated failures.' } : error,
  }
}
