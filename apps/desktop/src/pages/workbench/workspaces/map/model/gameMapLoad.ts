import { loadMapAsset } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import type { LocaleCode } from '@locales/api'

/**
 * Loads a Content Patcher map target (for example "Maps/Town") from the
 * installed game directory, probing the .xnb, .tbin, and .tmx extensions in
 * that order. Throws the last load error when no extension resolves, or a
 * plain target error when every attempt produced none.
 */
export async function loadGameMapDocument(gameRootPath: string, target: string, locale: LocaleCode): Promise<MapDocument> {
  const mapName = target.replace(/^Maps\//iu, '').trim()
  let lastError: Error | null = null
  for (const extension of ['.xnb', '.tbin', '.tmx']) {
    try {
      const asset = await loadMapAsset(gameRootPath, `${gameRootPath}/Content/Maps/${mapName}${extension}`, locale)
      return JSON.parse(asset.content) as MapDocument
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error(target)
}
