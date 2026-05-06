import type {
  MapAtlasPortal,
  MapAtlasPoint,
  MapAtlasPlacement,
  MapAtlasWarpRoute,
  MapDocument,
  MapLayer,
  MapObject,
  MapObjectGroup,
  MapPropertyValue,
  MapTileset,
  MapTilesetAnimationFrame,
} from './types'
import { asMapPropertyString } from './properties'
import { normalizeMapName } from './mapNames'
import { getActionTargetMap, getPortalTargetMapFromProperties } from './portalTargets'
import { extractTileFlags, stripTileGidFlags } from './tileFlags'
import { findTilesetForGid } from './tilesets'
import { isExteriorWarp, parseWarpEntries } from './warps'

type MapPlacement = {
  document: MapDocument
  offsetX: number
  offsetY: number
}

type PlacementComponent = {
  placements: MapPlacement[]
  anchorX: number
  anchorY: number
  width: number
  height: number
}

export type WorldMapLayoutArea = {
  x: number
  y: number
  width: number
  height: number
}

export type WorldMapLayout = Record<string, WorldMapLayoutArea>

type WarpEdge = {
  from: string
  to: string
  offsetX: number
  offsetY: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  samples: number
}

const RELAXATION_PASSES = 24
const MAP_LAYOUT_GAP = 14
const WORLD_MAP_SECTION_GAP = 80
const ATLAS_ROUTE_PADDING = 3
const OVERLAP_RESOLUTION_PASSES = 10

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

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

function isTruthyProperty(value: MapPropertyValue | undefined) {
  if (typeof value === 'boolean') {
    return value
  }

  return ['t', 'true', '1', 'yes'].includes(asMapPropertyString(value).trim().toLowerCase())
}

function canBePlacedInWorldAtlas(mapDocument: MapDocument) {
  return mapDocument.format !== 'atlas' && isTruthyProperty(mapDocument.properties.Outdoors)
}

function addOffsetSample(
  sampleMap: Map<
    string,
    {
      offsetX: number
      offsetY: number
      sourceX: number
      sourceY: number
      targetX: number
      targetY: number
      samples: number
    }
  >,
  key: string,
  offsetX: number,
  offsetY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const current = sampleMap.get(key)
  if (current) {
    current.offsetX += offsetX
    current.offsetY += offsetY
    current.sourceX += sourceX
    current.sourceY += sourceY
    current.targetX += targetX
    current.targetY += targetY
    current.samples += 1
    return
  }

  sampleMap.set(key, {
    offsetX,
    offsetY,
    sourceX,
    sourceY,
    targetX,
    targetY,
    samples: 1,
  })
}

function buildWarpEdges(mapDocuments: MapDocument[]) {
  const documentsByName = new Map<string, MapDocument>()
  for (const document of mapDocuments) {
    for (const alias of getWorldAtlasNameAliases(document.name)) {
      if (!documentsByName.has(alias)) {
        documentsByName.set(alias, document)
      }
    }
  }
  const samples = new Map<
    string,
    {
      offsetX: number
      offsetY: number
      sourceX: number
      sourceY: number
      targetX: number
      targetY: number
      samples: number
    }
  >()

  for (const document of mapDocuments) {
    for (const entry of parseWarpEntries(document)) {
      if (!isExteriorWarp(document, entry)) {
        continue
      }

      const targetDocument = documentsByName.get(normalizeMapName(entry.targetMap))
      if (!targetDocument) {
        continue
      }

      if (targetDocument.tileWidth !== document.tileWidth || targetDocument.tileHeight !== document.tileHeight) {
        continue
      }

      const fromName = normalizeMapName(document.name)
      const toName = normalizeMapName(targetDocument.name)
      if (fromName === toName) {
        continue
      }

      addOffsetSample(
        samples,
        `${fromName}=>${toName}`,
        entry.sourceX - entry.targetX,
        entry.sourceY - entry.targetY,
        entry.sourceX,
        entry.sourceY,
        entry.targetX,
        entry.targetY,
      )
    }
  }

  const edges: WarpEdge[] = []
  for (const [key, sample] of samples) {
    const [from, to] = key.split('=>')
    if (!from || !to) {
      continue
    }

    edges.push({
      from,
      to,
      offsetX: sample.offsetX / sample.samples,
      offsetY: sample.offsetY / sample.samples,
      sourceX: sample.sourceX / sample.samples,
      sourceY: sample.sourceY / sample.samples,
      targetX: sample.targetX / sample.samples,
      targetY: sample.targetY / sample.samples,
      samples: sample.samples,
    })
  }

  return edges
}

function buildConnectedLayout(mapDocuments: MapDocument[], rootMapName: string) {
  const documentsByName = new Map(
    mapDocuments.map((document) => [normalizeMapName(document.name), document] as const),
  )
  const rootDocument = documentsByName.get(normalizeMapName(rootMapName))
  if (!rootDocument) {
    return null
  }

  const edges = buildWarpEdges(mapDocuments)
  const adjacency = new Map<string, WarpEdge[]>()

  function addAdjacency(edge: WarpEdge) {
    const current = adjacency.get(edge.from)
    if (current) {
      current.push(edge)
      return
    }

    adjacency.set(edge.from, [edge])
  }

  for (const edge of edges) {
    addAdjacency(edge)
    addAdjacency({
      from: edge.to,
      to: edge.from,
      offsetX: -edge.offsetX,
      offsetY: -edge.offsetY,
      sourceX: edge.targetX,
      sourceY: edge.targetY,
      targetX: edge.sourceX,
      targetY: edge.sourceY,
      samples: edge.samples,
    })
  }

  function getDesiredDelta(fromDocument: MapDocument, toDocument: MapDocument, edge: WarpEdge) {
    if (Math.abs(edge.offsetX) >= Math.abs(edge.offsetY)) {
      if (edge.offsetX >= 0) {
        return {
          x: fromDocument.width + MAP_LAYOUT_GAP,
          y: edge.sourceY - edge.targetY,
        }
      }

      return {
        x: -(toDocument.width + MAP_LAYOUT_GAP),
        y: edge.sourceY - edge.targetY,
      }
    }

    if (edge.offsetY >= 0) {
      return {
        x: edge.sourceX - edge.targetX,
        y: fromDocument.height + MAP_LAYOUT_GAP,
      }
    }

    return {
      x: edge.sourceX - edge.targetX,
      y: -(toDocument.height + MAP_LAYOUT_GAP),
    }
  }

  const positions = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()
  const queue = [normalizeMapName(rootDocument.name)]
  positions.set(normalizeMapName(rootDocument.name), { x: 0, y: 0 })
  visited.add(normalizeMapName(rootDocument.name))

  while (queue.length) {
    const currentName = queue.shift()
    if (!currentName) {
      continue
    }

    const currentPosition = positions.get(currentName)
    if (!currentPosition) {
      continue
    }

    for (const edge of adjacency.get(currentName) ?? []) {
      const targetDocument = documentsByName.get(edge.to)
      const currentDocument = documentsByName.get(currentName)
      if (visited.has(edge.to) || !targetDocument || !currentDocument) {
        continue
      }

      const desiredDelta = getDesiredDelta(currentDocument, targetDocument, edge)
      positions.set(edge.to, {
        x: currentPosition.x + desiredDelta.x,
        y: currentPosition.y + desiredDelta.y,
      })
      visited.add(edge.to)
      queue.push(edge.to)
    }
  }

  for (let pass = 0; pass < RELAXATION_PASSES; pass += 1) {
    let changed = false

    for (const [mapName] of documentsByName) {
      if (mapName === normalizeMapName(rootDocument.name) || !positions.has(mapName)) {
        continue
      }

      const neighbors = adjacency.get(mapName) ?? []
      const predictions = neighbors
        .map((edge) => {
          const neighborPosition = positions.get(edge.to)
          const neighborDocument = documentsByName.get(edge.to)
          const currentDocument = documentsByName.get(mapName)
          if (!neighborPosition || !neighborDocument || !currentDocument) {
            return null
          }

          const desiredDelta = getDesiredDelta(currentDocument, neighborDocument, edge)
          if (!neighborPosition) {
            return null
          }

          return {
            x: neighborPosition.x - desiredDelta.x,
            y: neighborPosition.y - desiredDelta.y,
          }
        })
        .filter((prediction): prediction is { x: number; y: number } => prediction !== null)

      if (!predictions.length) {
        continue
      }

      const nextX = predictions.reduce((sum, prediction) => sum + prediction.x, 0) / predictions.length
      const nextY = predictions.reduce((sum, prediction) => sum + prediction.y, 0) / predictions.length
      const currentPosition = positions.get(mapName)
      if (!currentPosition) {
        continue
      }

      if (Math.abs(currentPosition.x - nextX) > 0.01 || Math.abs(currentPosition.y - nextY) > 0.01) {
        positions.set(mapName, { x: nextX, y: nextY })
        changed = true
      }
    }

    if (!changed) {
      break
    }
  }

  const placements = Array.from(positions.entries())
    .map(([mapName, position]) => {
      const document = documentsByName.get(mapName)
      if (!document) {
        return null
      }

      return {
        document,
        offsetX: Math.round(position.x),
        offsetY: Math.round(position.y),
      } satisfies MapPlacement
    })
    .filter((placement): placement is MapPlacement => placement !== null)

  for (let pass = 0; pass < OVERLAP_RESOLUTION_PASSES; pass += 1) {
    let moved = false

    for (let index = 0; index < placements.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < placements.length; compareIndex += 1) {
        const current = placements[index]
        const other = placements[compareIndex]
        const overlapX =
          Math.min(current.offsetX + current.document.width, other.offsetX + other.document.width) -
          Math.max(current.offsetX, other.offsetX)
        const overlapY =
          Math.min(current.offsetY + current.document.height, other.offsetY + other.document.height) -
          Math.max(current.offsetY, other.offsetY)

        if (overlapX >= -MAP_LAYOUT_GAP / 2 && overlapY >= -MAP_LAYOUT_GAP / 2) {
          const pushX = overlapX >= overlapY
          if (pushX) {
            const amount = Math.ceil((overlapX + MAP_LAYOUT_GAP) / 2)
            if (other.offsetX >= current.offsetX) {
              other.offsetX += amount
            } else {
              other.offsetX -= amount
            }
          } else {
            const amount = Math.ceil((overlapY + MAP_LAYOUT_GAP) / 2)
            if (other.offsetY >= current.offsetY) {
              other.offsetY += amount
            } else {
              other.offsetY -= amount
            }
          }

          moved = true
        }
      }
    }

    if (!moved) {
      break
    }
  }

  return {
    rootDocument,
    placements,
  }
}

function buildPlacementComponents(placements: MapPlacement[]) {
  const placementsByName = new Map(
    placements.map((placement) => [normalizeMapName(placement.document.name), placement] as const),
  )
  const adjacency = new Map<string, Set<string>>()

  function connect(left: string, right: string) {
    if (!adjacency.has(left)) {
      adjacency.set(left, new Set())
    }

    adjacency.get(left)?.add(right)
  }

  for (const placement of placements) {
    const name = normalizeMapName(placement.document.name)
    adjacency.set(name, adjacency.get(name) ?? new Set())
  }

  for (const edge of buildWarpEdges(placements.map((placement) => placement.document))) {
    const fromPlacement = placementsByName.get(edge.from)
    const toPlacement = placementsByName.get(edge.to)
    if (!fromPlacement || !toPlacement) {
      continue
    }

    connect(edge.from, edge.to)
    connect(edge.to, edge.from)
  }

  const visited = new Set<string>()
  const components: PlacementComponent[] = []

  for (const placement of placements) {
    const startName = normalizeMapName(placement.document.name)
    if (visited.has(startName)) {
      continue
    }

    const queue = [startName]
    const componentPlacements: MapPlacement[] = []
    visited.add(startName)

    while (queue.length) {
      const currentName = queue.shift()
      if (!currentName) {
        continue
      }

      const currentPlacement = placementsByName.get(currentName)
      if (currentPlacement) {
        componentPlacements.push(currentPlacement)
      }

      for (const neighborName of adjacency.get(currentName) ?? []) {
        if (visited.has(neighborName)) {
          continue
        }

        visited.add(neighborName)
        queue.push(neighborName)
      }
    }

    if (!componentPlacements.length) {
      continue
    }

    const minX = Math.min(...componentPlacements.map((item) => item.offsetX))
    const minY = Math.min(...componentPlacements.map((item) => item.offsetY))
    const maxX = Math.max(...componentPlacements.map((item) => item.offsetX + item.document.width))
    const maxY = Math.max(...componentPlacements.map((item) => item.offsetY + item.document.height))

    components.push({
      placements: componentPlacements,
      anchorX: minX,
      anchorY: minY,
      width: maxX - minX,
      height: maxY - minY,
    })
  }

  return components
}

function packPlacementComponents(placements: MapPlacement[]) {
  const components = buildPlacementComponents(placements)
  if (components.length <= 1) {
    return placements
  }

  const componentGap = MAP_LAYOUT_GAP * 3
  const totalArea = components.reduce((sum, component) => sum + component.width * component.height, 0)
  const targetRowWidth = Math.max(
    ...components.map((component) => component.width),
    Math.ceil(Math.sqrt(totalArea) * 1.35),
  )
  const packedPlacements: MapPlacement[] = []
  const sortedComponents = [...components].sort(
    (left, right) => left.anchorX - right.anchorX || left.anchorY - right.anchorY,
  )

  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const component of sortedComponents) {
    if (cursorX > 0 && cursorX + component.width > targetRowWidth) {
      cursorX = 0
      cursorY += rowHeight + componentGap
      rowHeight = 0
    }

    const componentMinX = Math.min(...component.placements.map((placement) => placement.offsetX))
    const componentMinY = Math.min(...component.placements.map((placement) => placement.offsetY))

    for (const placement of component.placements) {
      packedPlacements.push({
        ...placement,
        offsetX: placement.offsetX - componentMinX + cursorX,
        offsetY: placement.offsetY - componentMinY + cursorY,
      })
    }

    cursorX += component.width + componentGap
    rowHeight = Math.max(rowHeight, component.height)
  }

  return packedPlacements
}

function buildLayoutFromWorldMap(
  mapDocuments: MapDocument[],
  rootMapName: string,
  worldMapLayout: WorldMapLayout,
) {
  const documentsByName = new Map(
    mapDocuments.map((document) => [normalizeMapName(document.name), document] as const),
  )
  const rootDocument = documentsByName.get(normalizeMapName(rootMapName))
  const rootArea = worldMapLayout[normalizeMapName(rootMapName)]
  if (!rootDocument || !rootArea) {
    return null
  }

  const entries = mapDocuments
    .map((document) => {
      const area = worldMapLayout[normalizeMapName(document.name)]
      if (!area) {
        return null
      }

      return {
        document,
        area,
        centerX: area.x + area.width / 2,
        centerY: area.y + area.height / 2,
      }
    })
    .filter(
      (
        entry,
      ): entry is {
        document: MapDocument
        area: WorldMapLayoutArea
        centerX: number
        centerY: number
      } => entry !== null,
    )
  if (!entries.length) {
    return null
  }

  let scale = 1
  for (let index = 0; index < entries.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < entries.length; compareIndex += 1) {
      const left = entries[index]
      const right = entries[compareIndex]
      const centerDeltaX = Math.abs(right.centerX - left.centerX)
      const centerDeltaY = Math.abs(right.centerY - left.centerY)
      const requiredCenterDeltaX = (left.document.width + right.document.width) / 2 + MAP_LAYOUT_GAP
      const requiredCenterDeltaY = (left.document.height + right.document.height) / 2 + MAP_LAYOUT_GAP

      const xScale = centerDeltaX > 0 ? requiredCenterDeltaX / centerDeltaX : Number.POSITIVE_INFINITY
      const yScale = centerDeltaY > 0 ? requiredCenterDeltaY / centerDeltaY : Number.POSITIVE_INFINITY
      const pairScale = Math.min(xScale, yScale)

      if (Number.isFinite(pairScale)) {
        scale = Math.max(scale, pairScale)
      }
    }
  }

  const rootCenterX = rootArea.x + rootArea.width / 2
  const rootCenterY = rootArea.y + rootArea.height / 2
  const placements = entries.map((entry) => ({
    document: entry.document,
    offsetX: Math.round((entry.centerX - rootCenterX) * scale - entry.document.width / 2),
    offsetY: Math.round((entry.centerY - rootCenterY) * scale - entry.document.height / 2),
  }))

  return {
    rootDocument,
    placements: packPlacementComponents(placements),
  }
}

function toAtlasTileGid(rawGid: number, tilesets: MapTileset[], firstGidMap: Map<number, number>) {
  const baseGid = stripTileGidFlags(rawGid)
  if (baseGid === 0) {
    return 0
  }

  const tileset = findTilesetForGid(tilesets, baseGid)
  if (!tileset) {
    return 0
  }

  const atlasFirstGid = firstGidMap.get(tileset.firstGid)
  if (!atlasFirstGid) {
    return 0
  }

  const flags = extractTileFlags(rawGid)
  return (flags | (atlasFirstGid + (baseGid - tileset.firstGid))) >>> 0
}

function buildAtlasTilesets(placements: MapPlacement[]) {
  const atlasTilesets: MapTileset[] = []
  const firstGidMaps = new Map<string, Map<number, number>>()
  let nextFirstGid = 1

  for (const placement of placements) {
    const localFirstGidMap = new Map<number, number>()
    firstGidMaps.set(placement.document.name, localFirstGidMap)

    for (const tileset of placement.document.tilesets) {
      const key = [
        tileset.name,
        tileset.imagePath ?? '',
        tileset.tileWidth,
        tileset.tileHeight,
        tileset.tileCount,
        tileset.columns,
      ].join('::')

      const existing = atlasTilesets.find((candidate) => {
        return [
          candidate.name,
          candidate.imagePath ?? '',
          candidate.tileWidth,
          candidate.tileHeight,
          candidate.tileCount,
          candidate.columns,
        ].join('::') === key
      })

      if (existing) {
        localFirstGidMap.set(tileset.firstGid, existing.firstGid)
        existing.tileProperties = { ...tileset.tileProperties, ...existing.tileProperties }
        existing.animations = { ...tileset.animations, ...existing.animations }
        continue
      }

      atlasTilesets.push({
        ...tileset,
        firstGid: nextFirstGid,
        tileProperties: { ...tileset.tileProperties },
        animations: { ...tileset.animations } as Record<number, MapTilesetAnimationFrame[]>,
      })

      localFirstGidMap.set(tileset.firstGid, nextFirstGid)
      nextFirstGid += Math.max(tileset.tileCount, 1)
    }
  }

  return { atlasTilesets, firstGidMaps }
}

function buildAtlasLayers(
  placements: MapPlacement[],
  worldWidth: number,
  worldHeight: number,
  firstGidMaps: Map<string, Map<number, number>>,
) {
  const atlasLayers: MapLayer[] = []
  let nextLayerId = 1

  for (const placement of placements) {
    const firstGidMap = firstGidMaps.get(placement.document.name)
    if (!firstGidMap) {
      continue
    }

    const sortedTilesets = [...placement.document.tilesets].sort((left, right) => left.firstGid - right.firstGid)

    for (const layer of placement.document.layers) {
      const gids = new Uint32Array(worldWidth * worldHeight)

      for (let y = 0; y < layer.height; y += 1) {
        for (let x = 0; x < layer.width; x += 1) {
          const localIndex = y * layer.width + x
          const rawGid = layer.gids[localIndex] ?? 0
          if (rawGid === 0) {
            continue
          }

          const targetX = placement.offsetX + x
          const targetY = placement.offsetY + y
          const targetIndex = targetY * worldWidth + targetX
          gids[targetIndex] = toAtlasTileGid(rawGid, sortedTilesets, firstGidMap)
        }
      }

      atlasLayers.push({
        ...layer,
        id: nextLayerId,
        name: `${placement.document.name} / ${layer.name}`,
        width: worldWidth,
        height: worldHeight,
        offsetX: 0,
        offsetY: 0,
        properties: {
          ...layer.properties,
          worldMap: placement.document.name,
        },
        gids,
      })
      nextLayerId += 1
    }
  }

  return atlasLayers
}

function buildAtlasObjectGroups(placements: MapPlacement[]) {
  const atlasObjectGroups: MapObjectGroup[] = []
  let nextGroupId = 1
  let nextObjectId = 1

  for (const placement of placements) {
    for (const group of placement.document.objectGroups) {
      const objects: MapObject[] = group.objects.map((object) => ({
        ...object,
        id: nextObjectId++,
        x: object.x + placement.offsetX * placement.document.tileWidth,
        y: object.y + placement.offsetY * placement.document.tileHeight,
        properties: {
          ...object.properties,
          worldMap: placement.document.name,
        },
      }))

      atlasObjectGroups.push({
        ...group,
        id: nextGroupId,
        name: `${placement.document.name} / ${group.name}`,
        properties: {
          ...group.properties,
          worldMap: placement.document.name,
        },
        objects,
      })
      nextGroupId += 1
    }
  }

  return atlasObjectGroups
}

type WarpSide = 'left' | 'right' | 'top' | 'bottom'

function getWarpSide(mapDocument: MapDocument, sourceX: number, sourceY: number): WarpSide | null {
  if (sourceX < 0) {
    return 'left'
  }

  if (sourceX >= mapDocument.width) {
    return 'right'
  }

  if (sourceY < 0) {
    return 'top'
  }

  if (sourceY >= mapDocument.height) {
    return 'bottom'
  }

  return null
}

function getExteriorRoutePoint(placement: MapPlacement, sourceX: number, sourceY: number): MapAtlasPoint | null {
  const clampedSourceX = clamp(sourceX, 0, placement.document.width - 1)
  const clampedSourceY = clamp(sourceY, 0, placement.document.height - 1)
  const side = getWarpSide(placement.document, sourceX, sourceY)

  if (side === 'left' || side === 'right') {
    return {
      x: placement.offsetX + sourceX + 0.5,
      y: placement.offsetY + clampedSourceY + 0.5,
    }
  }

  if (side === 'top' || side === 'bottom') {
    return {
      x: placement.offsetX + clampedSourceX + 0.5,
      y: placement.offsetY + sourceY + 0.5,
    }
  }

  return null
}

function getTargetRoutePoint(placement: MapPlacement, targetX: number, targetY: number, sourceSide: WarpSide | null) {
  const clampedTargetX = clamp(targetX, 0, placement.document.width - 1)
  const clampedTargetY = clamp(targetY, 0, placement.document.height - 1)

  if (sourceSide === 'left') {
    return {
      x: placement.offsetX + placement.document.width + 0.5,
      y: placement.offsetY + clampedTargetY + 0.5,
    }
  }

  if (sourceSide === 'right') {
    return {
      x: placement.offsetX - 0.5,
      y: placement.offsetY + clampedTargetY + 0.5,
    }
  }

  if (sourceSide === 'top') {
    return {
      x: placement.offsetX + clampedTargetX + 0.5,
      y: placement.offsetY + placement.document.height + 0.5,
    }
  }

  return {
    x: placement.offsetX + clampedTargetX + 0.5,
    y: placement.offsetY - 0.5,
  }
}

function buildBlockedAtlasGrid(placements: MapPlacement[], worldWidth: number, worldHeight: number) {
  const blocked = new Uint8Array(worldWidth * worldHeight)

  for (const placement of placements) {
    for (let y = 0; y < placement.document.height; y += 1) {
      const worldY = placement.offsetY + y
      for (let x = 0; x < placement.document.width; x += 1) {
        const worldX = placement.offsetX + x
        blocked[worldY * worldWidth + worldX] = 1
      }
    }
  }

  return blocked
}

function doesStraightRouteHitPlacements(
  source: MapAtlasPoint,
  target: MapAtlasPoint,
  placements: MapPlacement[],
  ignoredMaps: Set<string>,
) {
  const deltaX = target.x - source.x
  const deltaY = target.y - source.y
  const steps = Math.max(4, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY)) * 2))

  for (let step = 1; step < steps; step += 1) {
    const progress = step / steps
    const pointX = source.x + deltaX * progress
    const pointY = source.y + deltaY * progress

    for (const placement of placements) {
      if (ignoredMaps.has(normalizeMapName(placement.document.name))) {
        continue
      }

      if (
        pointX >= placement.offsetX &&
        pointX <= placement.offsetX + placement.document.width &&
        pointY >= placement.offsetY &&
        pointY <= placement.offsetY + placement.document.height
      ) {
        return true
      }
    }
  }

  return false
}

function toGridIndex(x: number, y: number, worldWidth: number) {
  return y * worldWidth + x
}

function simplifyRoutePath(points: MapAtlasPoint[]) {
  if (points.length <= 2) {
    return points
  }

  const simplified = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1]
    const current = points[index]
    const next = points[index + 1]
    const previousDx = Math.sign(current.x - previous.x)
    const previousDy = Math.sign(current.y - previous.y)
    const nextDx = Math.sign(next.x - current.x)
    const nextDy = Math.sign(next.y - current.y)

    if (previousDx === nextDx && previousDy === nextDy) {
      continue
    }

    simplified.push(current)
  }

  simplified.push(points[points.length - 1])
  return simplified
}

function findAtlasRoutePath(
  blocked: Uint8Array,
  worldWidth: number,
  worldHeight: number,
  sourcePoint: MapAtlasPoint,
  targetPoint: MapAtlasPoint,
) {
  const startX = Math.floor(sourcePoint.x)
  const startY = Math.floor(sourcePoint.y)
  const targetX = Math.floor(targetPoint.x)
  const targetY = Math.floor(targetPoint.y)
  if (
    startX < 0 ||
    startY < 0 ||
    targetX < 0 ||
    targetY < 0 ||
    startX >= worldWidth ||
    startY >= worldHeight ||
    targetX >= worldWidth ||
    targetY >= worldHeight
  ) {
    return [sourcePoint, targetPoint]
  }

  const startIndex = toGridIndex(startX, startY, worldWidth)
  const targetIndex = toGridIndex(targetX, targetY, worldWidth)
  const scores = new Float64Array(worldWidth * worldHeight)
  scores.fill(Number.POSITIVE_INFINITY)
  scores[startIndex] = 0
  const priorities = new Float64Array(worldWidth * worldHeight)
  priorities.fill(Number.POSITIVE_INFINITY)
  priorities[startIndex] = Math.abs(targetX - startX) + Math.abs(targetY - startY)
  const previous = new Int32Array(worldWidth * worldHeight)
  previous.fill(-1)
  const openSet = [startIndex]
  const inOpenSet = new Uint8Array(worldWidth * worldHeight)
  inOpenSet[startIndex] = 1
  const closed = new Uint8Array(worldWidth * worldHeight)

  while (openSet.length) {
    let bestOpenIndex = 0
    for (let index = 1; index < openSet.length; index += 1) {
      if (priorities[openSet[index]] < priorities[openSet[bestOpenIndex]]) {
        bestOpenIndex = index
      }
    }

    const currentIndex = openSet.splice(bestOpenIndex, 1)[0]
    inOpenSet[currentIndex] = 0
    if (currentIndex === targetIndex) {
      const path: MapAtlasPoint[] = []
      let pathIndex = currentIndex

      while (pathIndex !== -1) {
        const pathX = pathIndex % worldWidth
        const pathY = Math.floor(pathIndex / worldWidth)
        path.push({ x: pathX + 0.5, y: pathY + 0.5 })
        pathIndex = previous[pathIndex]
      }

      path.reverse()
      path[0] = sourcePoint
      path[path.length - 1] = targetPoint
      return simplifyRoutePath(path)
    }

    closed[currentIndex] = 1
    const currentX = currentIndex % worldWidth
    const currentY = Math.floor(currentIndex / worldWidth)
    const neighbors = [
      [currentX + 1, currentY],
      [currentX - 1, currentY],
      [currentX, currentY + 1],
      [currentX, currentY - 1],
    ] as const

    for (const [neighborX, neighborY] of neighbors) {
      if (neighborX < 0 || neighborY < 0 || neighborX >= worldWidth || neighborY >= worldHeight) {
        continue
      }

      const neighborIndex = toGridIndex(neighborX, neighborY, worldWidth)
      if (closed[neighborIndex] || (blocked[neighborIndex] && neighborIndex !== targetIndex)) {
        continue
      }

      const tentativeScore = scores[currentIndex] + 1
      if (tentativeScore >= scores[neighborIndex]) {
        continue
      }

      previous[neighborIndex] = currentIndex
      scores[neighborIndex] = tentativeScore
      priorities[neighborIndex] = tentativeScore + Math.abs(targetX - neighborX) + Math.abs(targetY - neighborY)

      if (!inOpenSet[neighborIndex]) {
        openSet.push(neighborIndex)
        inOpenSet[neighborIndex] = 1
      }
    }
  }

  return [sourcePoint, targetPoint]
}

function buildAtlasWarpRoutes(placements: MapPlacement[], worldWidth: number, worldHeight: number) {
  const placementsByName = new Map<string, MapPlacement>()
  for (const placement of placements) {
    for (const alias of getWorldAtlasNameAliases(placement.document.name)) {
      if (!placementsByName.has(alias)) {
        placementsByName.set(alias, placement)
      }
    }
  }
  const representativeEdges = new Map<string, WarpEdge>()
  for (const edge of buildWarpEdges(placements.map((placement) => placement.document))) {
    const key = [edge.from, edge.to].sort().join('<->')
    const current = representativeEdges.get(key)
    if (!current || edge.samples > current.samples) {
      representativeEdges.set(key, edge)
    }
  }

  const blocked = buildBlockedAtlasGrid(placements, worldWidth, worldHeight)
  const routes: MapAtlasWarpRoute[] = []

  for (const edge of representativeEdges.values()) {
    const sourcePlacement = placementsByName.get(edge.from)
    const targetPlacement = placementsByName.get(edge.to)
    if (!sourcePlacement || !targetPlacement) {
      continue
    }

    const sourceSide = getWarpSide(sourcePlacement.document, edge.sourceX, edge.sourceY)
    const sourcePoint = getExteriorRoutePoint(sourcePlacement, edge.sourceX, edge.sourceY)
    if (!sourcePoint) {
      continue
    }

    const targetPoint = getTargetRoutePoint(targetPlacement, edge.targetX, edge.targetY, sourceSide)
    const ignoredMaps = new Set([
      normalizeMapName(sourcePlacement.document.name),
      normalizeMapName(targetPlacement.document.name),
    ])
    const path = doesStraightRouteHitPlacements(sourcePoint, targetPoint, placements, ignoredMaps)
      ? findAtlasRoutePath(blocked, worldWidth, worldHeight, sourcePoint, targetPoint)
      : [sourcePoint, targetPoint]

    routes.push({
      id: `${edge.from}->${edge.to}`,
      fromMap: sourcePlacement.document.name,
      toMap: targetPlacement.document.name,
      source: sourcePoint,
      target: targetPoint,
      path,
    })
  }

  return routes
}

function buildAtlasPortals(placements: MapPlacement[]) {
  const placementsByName = new Map<string, MapPlacement>()
  const placedAliases = new Set<string>()

  for (const placement of placements) {
    for (const alias of getWorldAtlasNameAliases(placement.document.name)) {
      placedAliases.add(alias)
      if (!placementsByName.has(alias)) {
        placementsByName.set(alias, placement)
      }
    }
  }

  const portalSamples = new Map<
    string,
    {
      fromMap: string
      targetMap: string
      label: string
      sourceX: number
      sourceY: number
      samples: number
    }
  >()

  function addPortalSample(
    sourceDocument: MapDocument,
    targetMap: string,
    sourceX: number,
    sourceY: number,
    label = targetMap,
  ) {
    const normalizedTargetMap = normalizeMapName(targetMap)
    const sourceMapName = normalizeMapName(sourceDocument.name)
    if (!normalizedTargetMap || normalizedTargetMap === sourceMapName || placedAliases.has(normalizedTargetMap)) {
      return
    }

    const key = `${sourceMapName}=>${normalizedTargetMap}`
    const sample = portalSamples.get(key)
    if (sample) {
      sample.sourceX += clamp(sourceX, 0, sourceDocument.width - 1)
      sample.sourceY += clamp(sourceY, 0, sourceDocument.height - 1)
      sample.samples += 1
      return
    }

    portalSamples.set(key, {
      fromMap: sourceDocument.name,
      targetMap,
      label,
      sourceX: clamp(sourceX, 0, sourceDocument.width - 1),
      sourceY: clamp(sourceY, 0, sourceDocument.height - 1),
      samples: 1,
    })
  }

  for (const placement of placements) {
    const sourceDocument = placement.document

    for (const group of sourceDocument.objectGroups) {
      for (const object of group.objects) {
        const targetMap = getPortalTargetMapFromProperties(object.properties)
        if (!targetMap) {
          continue
        }

        addPortalSample(
          sourceDocument,
          targetMap,
          object.x / sourceDocument.tileWidth,
          object.y / sourceDocument.tileHeight,
          targetMap,
        )
      }
    }

    for (const entry of parseWarpEntries(sourceDocument)) {
      if (isExteriorWarp(sourceDocument, entry)) {
        continue
      }

      addPortalSample(sourceDocument, entry.targetMap, entry.sourceX, entry.sourceY)
    }

    for (const layer of sourceDocument.layers) {
      for (let index = 0; index < layer.gids.length; index += 1) {
        const rawGid = layer.gids[index] ?? 0
        const targetMap = getActionTargetMap(rawGid, sourceDocument)
        if (!targetMap) {
          continue
        }

        const tileX = index % layer.width
        const tileY = Math.floor(index / layer.width)
        addPortalSample(
          sourceDocument,
          targetMap,
          tileX,
          tileY,
          targetMap,
        )
      }
    }
  }

  const portals: MapAtlasPortal[] = []
  for (const [key, sample] of portalSamples) {
    const sourcePlacement = placementsByName.get(normalizeMapName(sample.fromMap))
    if (!sourcePlacement) {
      continue
    }

    portals.push({
      id: key,
      fromMap: sourcePlacement.document.name,
      targetMap: sample.targetMap,
      label: sample.label,
      position: {
        x: sourcePlacement.offsetX + sample.sourceX / sample.samples + 0.5,
        y: sourcePlacement.offsetY + sample.sourceY / sample.samples + 0.5,
      },
    })
  }

  return portals
}

function normalizePlacements(placements: MapPlacement[]) {
  const minX = Math.min(...placements.map((placement) => placement.offsetX))
  const minY = Math.min(...placements.map((placement) => placement.offsetY))

  return {
    originOffsetX: minX - ATLAS_ROUTE_PADDING,
    originOffsetY: minY - ATLAS_ROUTE_PADDING,
    placements: placements
      .map((placement) => ({
        ...placement,
        offsetX: placement.offsetX - minX + ATLAS_ROUTE_PADDING,
        offsetY: placement.offsetY - minY + ATLAS_ROUTE_PADDING,
      }))
      .sort(
        (left, right) =>
          left.offsetY - right.offsetY ||
          left.offsetX - right.offsetX ||
          left.document.name.localeCompare(right.document.name),
      ),
  }
}

export function getExteriorWarpTargetNames(mapDocument: MapDocument) {
  return Array.from(
    new Set(
      parseWarpEntries(mapDocument)
        .filter((entry) => isExteriorWarp(mapDocument, entry))
        .map((entry) => entry.targetMap),
    ),
  )
}

export function getWorldAtlasSeedNames() {
  return ['Town', 'BusStop', 'Forest', 'Mountain', 'Railroad', 'Woods', 'Desert', 'Summit', 'Island_S']
}

export function buildWorldAtlas(
  mapDocuments: MapDocument[],
  rootMapName = 'Town',
  worldMapLayout?: WorldMapLayout,
) {
  const outdoorDocuments = mapDocuments.filter((document) => canBePlacedInWorldAtlas(document))
  const connectedLayout =
    (worldMapLayout ? buildLayoutFromWorldMap(outdoorDocuments, rootMapName, worldMapLayout) : null) ??
    buildConnectedLayout(outdoorDocuments, rootMapName)
  if (!connectedLayout) {
    return null
  }

  const normalizedLayout = normalizePlacements(connectedLayout.placements)
  const normalizedPlacements = normalizedLayout.placements
  const worldWidth =
    Math.max(...normalizedPlacements.map((placement) => placement.offsetX + placement.document.width)) +
    ATLAS_ROUTE_PADDING
  const worldHeight =
    Math.max(...normalizedPlacements.map((placement) => placement.offsetY + placement.document.height)) +
    ATLAS_ROUTE_PADDING
  const { atlasTilesets, firstGidMaps } = buildAtlasTilesets(normalizedPlacements)
  const atlasLayers = buildAtlasLayers(normalizedPlacements, worldWidth, worldHeight, firstGidMaps)
  const atlasObjectGroups = buildAtlasObjectGroups(normalizedPlacements)
  const atlasWarpRoutes = buildAtlasWarpRoutes(normalizedPlacements, worldWidth, worldHeight)
  const atlasPortals = buildAtlasPortals(normalizedPlacements)
  const atlasPlacements: MapAtlasPlacement[] = normalizedPlacements.map((placement) => ({
    mapName: placement.document.name,
    sourcePath: placement.document.sourcePath,
    relativePath: placement.document.relativePath,
    offsetX: placement.offsetX,
    offsetY: placement.offsetY,
    width: placement.document.width,
    height: placement.document.height,
  }))

  return {
    name: 'World Atlas',
    format: 'atlas' as const,
    sourcePath: connectedLayout.rootDocument.sourcePath,
    relativePath: 'World Atlas',
    width: worldWidth,
    height: worldHeight,
    tileWidth: connectedLayout.rootDocument.tileWidth,
    tileHeight: connectedLayout.rootDocument.tileHeight,
    orientation: connectedLayout.rootDocument.orientation,
    renderOrder: connectedLayout.rootDocument.renderOrder,
    properties: {
      rootMap: connectedLayout.rootDocument.name,
      placedMaps: atlasPlacements.map((placement) => placement.mapName).join(', '),
      placedMapCount: atlasPlacements.length,
    },
    tilesets: atlasTilesets,
    layers: atlasLayers,
    objectGroups: atlasObjectGroups,
    atlas: {
      rootMapName: connectedLayout.rootDocument.name,
      originOffsetX: normalizedLayout.originOffsetX,
      originOffsetY: normalizedLayout.originOffsetY,
      placements: atlasPlacements,
      warpRoutes: atlasWarpRoutes,
      portals: atlasPortals,
    },
  }
}
