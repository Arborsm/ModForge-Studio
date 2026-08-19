/**
 * @file Locale-scoped metadata caches for farmer hair and hat styles, shared
 * across stage asset resolution and playback.
 */

import type { LocaleCode } from '@locales/api'
import type { FarmerHairMetadataEntry } from './farmerAppearanceRenderer'

export type HatMetadataEntry = {
  hairDrawMode: 'normal' | 'hide' | 'cover'
  ignoreHairstyleOffset: boolean
  isMask: boolean
}

export const hatMetadataCache = new Map<string, Promise<Record<string, HatMetadataEntry>>>()
export const hairMetadataCache = new Map<string, Promise<Record<string, FarmerHairMetadataEntry>>>()

/** Builds the locale-scoped cache key used by hair and hat metadata caches. */
export function getLocalizedMetadataCacheKey(rootPath: string, locale: LocaleCode) {
  return `${rootPath}::${locale}`
}

export function clearLocalizedStageMetadataCache(locale: LocaleCode) {
  const suffix = `::${locale}`
  for (const key of hatMetadataCache.keys()) {
    if (key.endsWith(suffix)) {
      hatMetadataCache.delete(key)
    }
  }
  for (const key of hairMetadataCache.keys()) {
    if (key.endsWith(suffix)) {
      hairMetadataCache.delete(key)
    }
  }
}

export function getStageMetadataCacheStats() {
  return {
    hat: hatMetadataCache.size,
    hair: hairMetadataCache.size,
  }
}
