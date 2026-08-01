import { loadImageDataUrl, loadMapAsset, type MapAssetSummary } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import type { EditorResources, VirtualPreviewAsset } from '@features/cp-maker'
import { buildCpMakerMapAsset } from '@features/cp-maker/api'
import { relativeMapAssetReference } from '../../map/model/mapAssetReducer'

export function parseMapDocument(content: string): MapDocument | null {
  try {
    const parsed = JSON.parse(content) as Partial<MapDocument>
    return typeof parsed.width === 'number' && typeof parsed.height === 'number' && Array.isArray(parsed.layers)
      ? (parsed as MapDocument)
      : null
  } catch {
    return null
  }
}

function dataUrlAsset(dataUrl: string, relativePath: string, invalidDataError: string) {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl)
  if (!match) throw new Error(invalidDataError)
  return { relativePath, mediaType: match[1]!, bytesBase64: match[2]! }
}

export function serializableMapDocument(document: MapDocument) {
  return {
    ...document,
    layers: document.layers.map((layer) => ({ ...layer, gids: Array.from(layer.gids) })),
  }
}

export function availableAssetPath(wantedPath: string, usedPaths: Set<string>): string {
  const normalized = wantedPath.replaceAll('\\', '/')
  const dot = normalized.lastIndexOf('.')
  const base = dot > normalized.lastIndexOf('/') ? normalized.slice(0, dot) : normalized
  const extension = dot > normalized.lastIndexOf('/') ? normalized.slice(dot) : ''
  let candidate = normalized
  for (let suffix = 2; usedPaths.has(candidate.toLowerCase()); suffix += 1) candidate = `${base} (${suffix})${extension}`
  usedPaths.add(candidate.toLowerCase())
  return candidate
}

export async function prepareProjectMapCopy({
  target,
  asset,
  resources,
  usedPaths,
  invalidMapError,
  tilesheetLoadError,
  onStage,
}: {
  target: string
  asset: MapAssetSummary
  resources: EditorResources
  usedPaths: Set<string>
  invalidMapError: string
  tilesheetLoadError: (name: string) => string
  onStage?: (stage: string) => void
}): Promise<{ document: MapDocument; assets: VirtualPreviewAsset[] }> {
  if (!resources.gameRootPath) throw new Error(invalidMapError)
  onStage?.('reading game map asset')
  const loaded = await loadMapAsset(resources.gameRootPath, asset.absolutePath, resources.locale)
  const parsed = parseMapDocument(loaded.content)
  if (!parsed) throw new Error(invalidMapError)

  const mapFileName = target.replace(/^Maps\//iu, '').replaceAll('/', '_')
  const mapPath = availableAssetPath(`assets/maps/${mapFileName}.tmx`, usedPaths)
  const imageAssets: VirtualPreviewAsset[] = []
  const copiedImages = new Map<string, string>()
  const tilesets = [] as MapDocument['tilesets']
  for (const tileset of parsed.tilesets) {
    if (!tileset.imagePath) throw new Error(tilesheetLoadError(tileset.name))
    const sourceKey = tileset.imagePath.replaceAll('\\', '/').toLowerCase()
    let imagePath = copiedImages.get(sourceKey)
    if (!imagePath) {
      const safeName = tileset.name.replaceAll(/[^A-Za-z0-9._-]+/gu, '_') || 'tilesheet'
      imagePath = availableAssetPath(`assets/maps/tilesheets/${mapFileName}_${safeName}.png`, usedPaths)
      onStage?.(`copying tilesheet image ${tileset.name}`)
      const dataUrl = await loadImageDataUrl(tileset.imagePath, resources.locale)
      imageAssets.push(dataUrlAsset(dataUrl, imagePath, tilesheetLoadError(tileset.name)))
      copiedImages.set(sourceKey, imagePath)
    }
    tilesets.push({
      ...tileset,
      source: null,
      imageSource: relativeMapAssetReference(mapPath, imagePath),
      imagePath,
    })
  }

  const document: MapDocument = {
    ...parsed,
    name: target.replace(/^Maps\//iu, ''),
    format: 'tmx',
    sourcePath: mapPath,
    relativePath: mapPath,
    tilesets,
  }
  onStage?.('building project map asset')
  const built = await buildCpMakerMapAsset({ relativePath: mapPath, mapDocument: serializableMapDocument(document) })
  return { document, assets: [...imageAssets, ...built.companionAssets, built.asset] }
}
