import { loadContentPatcherResultAsset } from '@entities/mod/api'
import { loadImageResource } from '@shared/lib/assets'
import type { MapDocument } from '@entities/map'
import type { ModBrowserEntry } from './browser'

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
  originalWidth: number | null
  originalHeight: number | null
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
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^Content\//iu, '')
    .toLowerCase()
}

function stripTargetExtension(value: string) {
  return value.replace(/\.xnb$/iu, '')
}

function buildTargetFamilyPrefix(value: string) {
  const normalized = stripTargetExtension(normalizeTargetPath(value))
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex < 0) {
    return null
  }

  const folder = normalized.slice(0, slashIndex)
  const leaf = normalized.slice(slashIndex + 1)
  if (!folder || !leaf) {
    return null
  }

  const baseName = leaf.split('_')[0]?.trim()
  if (!baseName) {
    return null
  }

  return `${folder}/${baseName}`
}

export function findPreferredModTarget<T>(entry: ModBrowserEntry<T>, preferredTargets: string[]) {
  const normalizedPreferred = preferredTargets.map(normalizeTargetPath)
  for (const target of entry.targets) {
    const normalizedTarget = normalizeTargetPath(target)
    if (normalizedPreferred.includes(normalizedTarget)) {
      return target
    }
  }

  const extensionAgnosticPreferred = preferredTargets.map((target) => stripTargetExtension(normalizeTargetPath(target)))
  for (const target of entry.targets) {
    const normalizedTarget = stripTargetExtension(normalizeTargetPath(target))
    if (extensionAgnosticPreferred.includes(normalizedTarget)) {
      return target
    }
  }

  const familyPrefixes = preferredTargets.map(buildTargetFamilyPrefix).filter((value): value is string => Boolean(value))
  for (const target of entry.targets) {
    const normalizedTarget = stripTargetExtension(normalizeTargetPath(target))
    if (familyPrefixes.some((prefix) => normalizedTarget === prefix || normalizedTarget.startsWith(`${prefix}_`))) {
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
  const originalResource = result.result.originalImageDataUrl
    ? await loadImageResource(result.result.originalImageDataUrl).catch(() => null)
    : null
  return {
    path: fallbackPathLabel,
    url: resource.url,
    width: resource.width,
    height: resource.height,
    originalWidth: originalResource?.width ?? null,
    originalHeight: originalResource?.height ?? null,
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

export async function loadModResultJsonValue<T>({ rootPath, entry, preferredTargets }: LoadModResultJsonValueRequest<T>) {
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
