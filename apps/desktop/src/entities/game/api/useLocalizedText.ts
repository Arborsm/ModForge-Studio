/**
 * @file React hook for resolving `[LocalizedText ...]` values with loading-state awareness.
 */

import { useEffect, useState } from 'react'
import { TaskCancelledError, useKeyedResourceTask } from '@shared/lib/task-runtime'
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
  const scopeKey = `${rootPath ?? 'none'}:${value ?? 'none'}`
  const runResolutionTask = useKeyedResourceTask(scopeKey)

  useEffect(() => {
    void runResolutionTask(async (scope) => {
      if (rootPath === null || value === null || value === undefined || value.trim() === '') {
        setResolution(null)
        return
      }
      const result = await resolveLocalizedTextDetailed(rootPath, locale, value)
      if (scope.isCurrent()) {
        setResolution(result)
      }
    }).catch((error) => {
      if (error instanceof TaskCancelledError) {
        return
      }
      throw error
    })
  }, [locale, rootPath, runResolutionTask, value])

  return resolution
}
