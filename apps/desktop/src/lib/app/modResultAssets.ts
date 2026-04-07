import { loadContentPatcherResultAsset } from '../desktop'
import { loadImageResource } from '../imageMetrics'
import type { MapDocument } from '../maps/types'
import type { ModBrowserEntry } from './modAssetIndex'

type LoadModResultRequest<T> = {
  rootPath: string
  entry: ModBrowserEntry<T>
  preferredTargets: string[]
}

export type ModResultImageState = {
  path: string
  url: string
  width: number
  height: number
  target: string
}

type LoadModResultImageStateRequest<T> = LoadModResultRequest<T> & {
  fallbackPathLabel: string
}

type LoadModResultMapDocumentRequest<T> = LoadModResultRequest<T> & {
  fallbackName: string
  fallbackRelativePath: string
  fallbackSourcePath: string
}

type LoadModResultJsonValueRequest<T> = LoadModResultRequest<T>

function normalizeTargetPath(value: string) {
  return value.trim().replaceAll('\\', '/').replace(/^Content\//iu, '').toLowerCase()
}

export function findPreferredModTarget<T>(entry: ModBrowserEntry<T>, preferredTargets: string[]) {
  const normalizedPreferred = preferredTargets.map(normalizeTargetPath)
  for (const target of entry.targets) {
    const normalizedTarget = normalizeTargetPath(target)
    if (normalizedPreferred.includes(normalizedTarget)) {
      return target
    }
  }

  return null
}

export async function loadModResultImageState<T>({
  rootPath,
  entry,
  preferredTargets,
  fallbackPathLabel,
}: LoadModResultImageStateRequest<T>): Promise<ModResultImageState | null> {
  const target = findPreferredModTarget(entry, preferredTargets)
  if (!target) {
    return null
  }

  const result = await loadContentPatcherResultAsset({
    path: entry.modPath,
    gameRootPath: rootPath,
    target,
  })

  if (result.result.kind !== 'image' || !result.result.imageDataUrl) {
    return null
  }

  const resource = await loadImageResource(result.result.imageDataUrl)
  return {
    path: fallbackPathLabel,
    url: resource.url,
    width: resource.width,
    height: resource.height,
    target,
  }
}

export async function loadModResultMapDocument<T>({
  rootPath,
  entry,
  preferredTargets,
  fallbackName,
  fallbackRelativePath,
  fallbackSourcePath,
}: LoadModResultMapDocumentRequest<T>): Promise<MapDocument | null> {
  const target = findPreferredModTarget(entry, preferredTargets)
  if (!target) {
    return null
  }

  const result = await loadContentPatcherResultAsset({
    path: entry.modPath,
    gameRootPath: rootPath,
    target,
  })

  if (result.result.kind !== 'map' || !result.result.json || typeof result.result.json !== 'object' || Array.isArray(result.result.json)) {
    return null
  }

  const document = result.result.json as MapDocument
  return {
    ...document,
    name: document.name?.trim() || fallbackName,
    relativePath: document.relativePath?.trim().replaceAll('/', '\\') || fallbackRelativePath,
    sourcePath: document.sourcePath?.trim() || fallbackSourcePath,
  }
}

export async function loadModResultJsonValue<T>({
  rootPath,
  entry,
  preferredTargets,
}: LoadModResultJsonValueRequest<T>) {
  const target = findPreferredModTarget(entry, preferredTargets)
  if (!target) {
    return null
  }

  const result = await loadContentPatcherResultAsset({
    path: entry.modPath,
    gameRootPath: rootPath,
    target,
  })

  return result.result.kind === 'json' ? result.result.json : null
}
