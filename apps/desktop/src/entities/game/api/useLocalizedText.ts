import { useEffect, useState } from 'react'
import type { LocaleCode } from '@locales/api'
import { resolveLocalizedTextDetailed, type LocalizedTextResolution } from './localizedText'

/**
 * Resolves one `[LocalizedText ...]` value for display. Returns null while the
 * string table is loading so callers can show the raw value or a placeholder
 * instead of flashing unresolved text.
 */
export function useLocalizedTextResolution(
  rootPath: string | null,
  locale: LocaleCode,
  value: string | null | undefined,
): LocalizedTextResolution | null {
  const [resolution, setResolution] = useState<LocalizedTextResolution | null>(null)

  useEffect(() => {
    if (rootPath === null || value === null || value === undefined || value.trim() === '') {
      setResolution(null)
      return
    }
    let cancelled = false
    void resolveLocalizedTextDetailed(rootPath, locale, value).then((result) => {
      if (!cancelled) {
        setResolution(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rootPath, locale, value])

  return resolution
}
