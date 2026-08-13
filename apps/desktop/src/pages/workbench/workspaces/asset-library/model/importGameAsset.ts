import { loadAudioDataUrl, loadImageDataUrl, loadTextAsset } from '@entities/game/api'
import type { AudioAssetSummary, GameDataAssetSummary, GameImageAssetSummary } from '@entities/game/api'
import type { EditorResources } from '@features/cp-maker'
import { allocateProjectAssetPath } from './projectAssets'

/** Game asset kinds the "copy from game" pickers can import into the project. */
export type GameAssetImportKind = 'map' | 'image' | 'audio' | 'data'

/** Scanned game asset sources handled by the shared import pipeline (maps use their own flow). */
export type GameAssetImportSource =
  | { kind: 'image'; asset: GameImageAssetSummary }
  | { kind: 'audio'; asset: AudioAssetSummary }
  | { kind: 'data'; asset: GameDataAssetSummary }

export type PreparedProjectAsset = {
  relativePath: string
  mediaType: string
  bytesBase64: string
}

/** Decodes a data URL into the media type and base64 payload a project asset stores. */
export function dataUrlToProjectAsset(dataUrl: string, relativePath: string, invalidDataError: string): PreparedProjectAsset {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl)
  if (!match) throw new Error(invalidDataError)
  return { relativePath, mediaType: match[1]!, bytesBase64: match[2]! }
}

/** Returns the last path segment of a Content Patcher asset key or filesystem path. */
export function assetNameSegment(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  return normalized.split('/').at(-1) ?? normalized
}

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/oga': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/aac': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
}

function sourceExtension(absolutePath: string): string {
  return (absolutePath.split('.').at(-1) ?? '').toLowerCase()
}

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Loads one scanned game asset and maps it onto a collision-free project path
 * under `assets/`, ready for `writeProjectAssets(..., 'generated')`.
 *
 * Images and audio stream through data URLs (XNB textures are decoded to PNG by
 * the host); data assets are loaded as text and persisted as JSON.
 */
export async function prepareGameAssetImport(
  source: GameAssetImportSource,
  options: {
    resources: EditorResources
    existingPaths: Iterable<string>
    invalidDataError: string
  },
): Promise<PreparedProjectAsset> {
  const usedPaths = new Set(Array.from(options.existingPaths, (path) => path.replaceAll('\\', '/').toLowerCase()))

  if (source.kind === 'image') {
    const dataUrl = await loadImageDataUrl(source.asset.absolutePath, options.resources.locale)
    const mime = /^data:([^;,]+);/u.exec(dataUrl)?.[1] ?? ''
    const extension = IMAGE_MIME_EXTENSIONS[mime.toLowerCase()] ?? 'png'
    const relativePath = allocateProjectAssetPath(usedPaths, `assets/${assetNameSegment(source.asset.name)}.${extension}`)
    return dataUrlToProjectAsset(dataUrl, relativePath, options.invalidDataError)
  }

  if (source.kind === 'audio') {
    const dataUrl = await loadAudioDataUrl(source.asset.absolutePath)
    const mime = /^data:([^;,]+);/u.exec(dataUrl)?.[1] ?? ''
    const extension = (AUDIO_MIME_EXTENSIONS[mime.toLowerCase()] ?? sourceExtension(source.asset.absolutePath)) || 'wav'
    const relativePath = allocateProjectAssetPath(usedPaths, `assets/${assetNameSegment(source.asset.cue)}.${extension}`)
    return dataUrlToProjectAsset(dataUrl, relativePath, options.invalidDataError)
  }

  const gameRootPath = options.resources.gameRootPath
  if (!gameRootPath) throw new Error(options.invalidDataError)
  const loaded = await loadTextAsset(gameRootPath, source.asset.relativePath, options.resources.locale)
  const relativePath = allocateProjectAssetPath(usedPaths, `assets/${assetNameSegment(source.asset.name)}.json`)
  return { relativePath, mediaType: 'application/json', bytesBase64: textToBase64(loaded.content) }
}
