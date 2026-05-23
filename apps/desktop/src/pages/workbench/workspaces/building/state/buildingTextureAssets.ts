import type { LocaleCode } from '@locales'
import { getLocalizedImagePathCandidates, loadImageResourceFromPath } from '@shared/lib/assets'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import { getBuildingTexturePath } from '../entities/building'

async function loadImageState(path: string | null, locale: LocaleCode): Promise<BuildingTextureAssetState> {
  if (!path) {
    return {
      path: null,
      url: null,
      width: null,
      height: null,
    }
  }

  let lastError: unknown = null

  for (const candidatePath of getLocalizedImagePathCandidates(path, locale)) {
    try {
      const resource = await loadImageResourceFromPath(candidatePath, locale)
      if (!resource) {
        continue
      }
      return {
        path: candidatePath,
        url: resource.url,
        width: resource.width,
        height: resource.height,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export { loadImageState }

export async function loadChainTextureStates(
  entries: BuildingWorkspaceEntry[],
  rootPath: string | null,
  locale: LocaleCode,
): Promise<Record<string, BuildingTextureAssetState>> {
  const textureEntries = await Promise.all(
    entries.map(async (entry) => {
      const texturePath = getBuildingTexturePath(rootPath, entry)
      try {
        return [entry.key, await loadImageState(texturePath, locale)] as const
      } catch {
        return [
          entry.key,
          {
            path: texturePath,
            url: null,
            width: null,
            height: null,
          } satisfies BuildingTextureAssetState,
        ] as const
      }
    }),
  )

  return Object.fromEntries(textureEntries)
}
