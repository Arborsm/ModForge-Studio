import type { LocaleCode } from '@locales/editor-shell'
import type { FarmerHairMetadataEntry } from './farmerAppearanceRenderer'

export type HatMetadataEntry = {
  hairDrawMode: 'normal' | 'hide' | 'cover'
  ignoreHairstyleOffset: boolean
  isMask: boolean
}

export const hatMetadataCache = new Map<string, Promise<Record<string, HatMetadataEntry>>>()
export const hairMetadataCache = new Map<string, Promise<Record<string, FarmerHairMetadataEntry>>>()

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
