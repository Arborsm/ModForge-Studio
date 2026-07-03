import type { GameDirectoryInfo, MapAssetContent } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import type { EventStagePreviewAssetLoader } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview'

export function createEventStagePreviewTestAssetLoader(): EventStagePreviewAssetLoader {
  return {
    loadMapAsset: async (_gameRootPath, mapPath): Promise<MapAssetContent> => ({
      name: 'Town',
      absolutePath: mapPath,
      relativePath: 'Maps/Town.xnb',
      format: 'xnb',
      content: JSON.stringify(createFallbackMapDocument('Town')),
    }),
    loadOptionalImageDataUrl: async (path) => createFallbackActorSpriteUrl(path),
    loadOptionalImageResource: async (path) => ({
      image: {} as HTMLImageElement,
      url: createFallbackActorSpriteUrl(path),
      width: path.includes('Portraits') ? 128 : 64,
      height: path.includes('Portraits') ? 128 : 128,
    }),
    validateGameDirectory: async (): Promise<GameDirectoryInfo> => ({
      rootPath: 'E:\\Games\\Stardew Valley',
      executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
      mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
      mapCount: 1,
    }),
  }
}

function createFallbackActorSpriteUrl(assetPath: string) {
  const actorName =
    assetPath
      .split(/[\\/]/u)
      .pop()
      ?.replace(/\.xnb$/iu, '') || 'Actor'
  const hue = Math.abs(
    Array.from(actorName).reduce((hash, char) => {
      return (hash * 31 + char.charCodeAt(0)) % 360
    }, 17),
  )
  const body = `hsl(${hue} 62% 54%)`
  const shirt = `hsl(${(hue + 42) % 360} 70% 42%)`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="128" viewBox="0 0 64 128"><rect width="64" height="128" fill="none"/><g transform="translate(16 8)"><circle cx="16" cy="16" r="12" fill="#f4c7a1"/><rect x="8" y="30" width="16" height="34" rx="6" fill="${body}"/><rect x="4" y="60" width="10" height="34" rx="4" fill="${shirt}"/><rect x="18" y="60" width="10" height="34" rx="4" fill="${shirt}"/><circle cx="12" cy="14" r="2" fill="#2d221b"/><circle cx="20" cy="14" r="2" fill="#2d221b"/></g></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function createFallbackEventStageActorSpriteUrl(assetPath: string) {
  return createFallbackActorSpriteUrl(assetPath)
}

function createFallbackMapDocument(mapName: string): MapDocument {
  const width = 48
  const height = 32
  const gids = new Uint32Array(width * height)
  for (let index = 0; index < gids.length; index += 1) {
    const x = index % width
    const y = Math.floor(index / width)
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1
    const road = Math.abs(x - y - 4) < 2 || Math.abs(x - 24) < 2 || Math.abs(y - 16) < 2
    gids[index] = border ? 3 : road ? 2 : 1
  }

  return {
    name: mapName,
    sourcePath: `test-fixture://${mapName}`,
    relativePath: `Maps/${mapName}.xnb`,
    format: 'xnb',
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width,
        height,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids,
        nonEmptyTiles: gids.length,
      },
    ],
    objectGroups: [],
    tilesets: [
      {
        firstGid: 1,
        name: 'test-stage',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 3,
        columns: 3,
        imageSource: null,
        imagePath: null,
        imageWidth: 48,
        imageHeight: 16,
        properties: {},
        tileProperties: {},
        animations: {},
      },
    ],
    properties: { DisplayName: `${mapName} test stage` },
  }
}
