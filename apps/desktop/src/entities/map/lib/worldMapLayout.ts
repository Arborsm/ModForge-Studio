import { normalizeMapName } from './mapNames'

export type WorldMapLayoutArea = {
  x: number
  y: number
  width: number
  height: number
}

export type WorldMapLayout = Record<string, WorldMapLayoutArea>

const WORLD_MAP_SECTION_GAP = 80

function hasFiniteRect(value: unknown): value is { X: number; Y: number; Width: number; Height: number } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return ['X', 'Y', 'Width', 'Height'].every((key) => Number.isFinite(candidate[key]))
}

export function getWorldAtlasNameAliases(name: string) {
  const normalizedName = normalizeMapName(name)
  if (!normalizedName) {
    return []
  }

  const aliases = new Set<string>([normalizedName])
  const islandLongToShort: Record<string, string> = {
    islandeast: 'island_e',
    islandnorth: 'island_n',
    islandsouth: 'island_s',
    islandsoutheast: 'island_se',
    islandwest: 'island_w',
  }
  const islandShortToLong: Record<string, string> = Object.fromEntries(
    Object.entries(islandLongToShort).map(([longName, shortName]) => [shortName, longName]),
  )

  const islandShortAlias = islandLongToShort[normalizedName]
  if (islandShortAlias) {
    aliases.add(islandShortAlias)
  }

  const islandLongAlias = islandShortToLong[normalizedName]
  if (islandLongAlias) {
    aliases.add(islandLongAlias)
  }

  return Array.from(aliases)
}

function setWorldMapAreaAlias(
  layout: Map<string, { area: WorldMapLayoutArea; priority: number }>,
  alias: string,
  area: WorldMapLayoutArea,
  priority: number,
) {
  if (!alias) {
    return
  }

  const current = layout.get(alias)
  if (!current || priority >= current.priority) {
    layout.set(alias, { area, priority })
  }
}

export function parseWorldMapLayout(content: string) {
  const parsed = JSON.parse(content) as Record<string, unknown>
  const worldMapRoots: Array<{ rootName: string; mapAreas: unknown[] }> = []

  for (const [rootName, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object') {
      continue
    }

    const candidate = value as { MapAreas?: unknown }
    if (!Array.isArray(candidate.MapAreas) || candidate.MapAreas.length === 0) {
      continue
    }

    worldMapRoots.push({
      rootName,
      mapAreas: candidate.MapAreas,
    })
  }

  if (!worldMapRoots.length) {
    return {} as WorldMapLayout
  }

  const rootOffsets = new Map<string, { offsetX: number; offsetY: number }>()
  let nextRootOffsetX = 0

  for (const rootEntry of worldMapRoots) {
    let minX = 0
    let minY = 0
    let maxX = 0
    let maxY = 0
    let hasBounds = false

    for (const area of rootEntry.mapAreas) {
      if (!area || typeof area !== 'object') {
        continue
      }

      const pixelArea = (area as Record<string, unknown>).PixelArea
      if (!hasFiniteRect(pixelArea)) {
        continue
      }

      if (!hasBounds) {
        minX = pixelArea.X
        minY = pixelArea.Y
        maxX = pixelArea.X + pixelArea.Width
        maxY = pixelArea.Y + pixelArea.Height
        hasBounds = true
        continue
      }

      minX = Math.min(minX, pixelArea.X)
      minY = Math.min(minY, pixelArea.Y)
      maxX = Math.max(maxX, pixelArea.X + pixelArea.Width)
      maxY = Math.max(maxY, pixelArea.Y + pixelArea.Height)
    }

    if (!hasBounds) {
      rootOffsets.set(rootEntry.rootName, { offsetX: nextRootOffsetX, offsetY: 0 })
      continue
    }

    rootOffsets.set(rootEntry.rootName, {
      offsetX: nextRootOffsetX - minX,
      offsetY: -minY,
    })
    nextRootOffsetX += maxX - minX + WORLD_MAP_SECTION_GAP
  }

  const layout = new Map<string, { area: WorldMapLayoutArea; priority: number }>()
  for (const rootEntry of worldMapRoots) {
    const rootOffset = rootOffsets.get(rootEntry.rootName) ?? { offsetX: 0, offsetY: 0 }

    for (const area of rootEntry.mapAreas) {
      if (!area || typeof area !== 'object') {
        continue
      }

      const candidate = area as Record<string, unknown>
      const id = typeof candidate.Id === 'string' ? candidate.Id : ''
      const condition = candidate.Condition
      const pixelArea = candidate.PixelArea
      if (!id || !hasFiniteRect(pixelArea)) {
        continue
      }

      const resolvedArea = {
        x: pixelArea.X + rootOffset.offsetX,
        y: pixelArea.Y + rootOffset.offsetY,
        width: pixelArea.Width,
        height: pixelArea.Height,
      }
      const priority = condition === null ? 2 : 1

      for (const alias of getWorldAtlasNameAliases(id)) {
        setWorldMapAreaAlias(layout, alias, resolvedArea, priority)
      }

      const worldPositions = Array.isArray(candidate.WorldPositions) ? candidate.WorldPositions : []
      for (const worldPosition of worldPositions) {
        if (!worldPosition || typeof worldPosition !== 'object') {
          continue
        }

        const locationCandidate = worldPosition as Record<string, unknown>
        const locationName = typeof locationCandidate.LocationName === 'string' ? locationCandidate.LocationName : ''
        const locationNames = Array.isArray(locationCandidate.LocationNames)
          ? locationCandidate.LocationNames.filter((value): value is string => typeof value === 'string')
          : []

        for (const alias of getWorldAtlasNameAliases(locationName)) {
          setWorldMapAreaAlias(layout, alias, resolvedArea, priority)
        }

        for (const alternateName of locationNames) {
          for (const alias of getWorldAtlasNameAliases(alternateName)) {
            setWorldMapAreaAlias(layout, alias, resolvedArea, priority)
          }
        }
      }
    }
  }

  return Object.fromEntries(Array.from(layout.entries(), ([key, value]) => [key, value.area])) as WorldMapLayout
}
