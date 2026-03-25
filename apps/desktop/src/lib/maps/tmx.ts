import type {
  MapDocument,
  MapLayer,
  MapObject,
  MapObjectGroup,
  MapPropertyValue,
  MapTileset,
  MapTilesetAnimationFrame,
} from './types'

function getRequiredAttribute(element: Element, name: string) {
  const value = element.getAttribute(name)
  if (!value) {
    throw new Error(`Missing required attribute "${name}" on <${element.tagName}>.`)
  }

  return value
}

function getNumberAttribute(element: Element, name: string, fallback = 0) {
  const value = element.getAttribute(name)
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getBooleanAttribute(element: Element, name: string, fallback = true) {
  const value = element.getAttribute(name)
  if (!value) {
    return fallback
  }

  return value !== '0' && value.toLowerCase() !== 'false'
}

function normalizePath(path: string) {
  return path.replaceAll('/', '\\')
}

function resolveTilesetImagePath(sourcePath: string, imageSource: string | null) {
  if (!imageSource) {
    return null
  }

  const normalizedMapPath = normalizePath(sourcePath)
  const separatorIndex = normalizedMapPath.lastIndexOf('\\')
  const mapDirectory = separatorIndex >= 0 ? normalizedMapPath.slice(0, separatorIndex) : normalizedMapPath
  const normalizedSource = normalizePath(imageSource)
  const fileName = /\.[A-Za-z0-9]+$/.test(normalizedSource) ? normalizedSource : `${normalizedSource}.png`

  return `${mapDirectory}\\${fileName}`
}

function parsePropertyValue(element: Element): MapPropertyValue {
  const declaredType = element.getAttribute('type') ?? 'string'
  const rawValue = element.getAttribute('value') ?? element.textContent?.trim() ?? ''

  if (declaredType === 'bool') {
    return rawValue.toLowerCase() === 'true' || rawValue === '1'
  }

  if (
    declaredType === 'int' ||
    declaredType === 'float' ||
    declaredType === 'number' ||
    declaredType === 'color'
  ) {
    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? parsed : rawValue
  }

  return rawValue
}

function parseProperties(parent: Element): Record<string, MapPropertyValue> {
  const properties: Record<string, MapPropertyValue> = {}
  const propertiesElement = parent.querySelector(':scope > properties')
  if (!propertiesElement) {
    return properties
  }

  for (const propertyElement of propertiesElement.querySelectorAll(':scope > property')) {
    const name = propertyElement.getAttribute('name')
    if (!name) {
      continue
    }

    properties[name] = parsePropertyValue(propertyElement)
  }

  return properties
}

function parseCsvLayerData(layerElement: Element) {
  const dataElement = layerElement.querySelector(':scope > data')
  if (!dataElement) {
    throw new Error(`Layer "${getRequiredAttribute(layerElement, 'name')}" has no <data> node.`)
  }

  const encoding = dataElement.getAttribute('encoding')
  const compression = dataElement.getAttribute('compression')
  if (encoding && encoding !== 'csv') {
    throw new Error(`Only CSV TMX layer data is supported right now. Got encoding "${encoding}".`)
  }

  if (compression) {
    throw new Error(`Compressed TMX layer data is not supported right now. Got "${compression}".`)
  }

  const values = (dataElement.textContent ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10) || 0)

  return Uint32Array.from(values)
}

function parseLayer(layerElement: Element): MapLayer {
  const gids = parseCsvLayerData(layerElement)
  let nonEmptyTiles = 0
  for (const gid of gids) {
    if (gid !== 0) {
      nonEmptyTiles += 1
    }
  }

  return {
    id: getNumberAttribute(layerElement, 'id'),
    name: getRequiredAttribute(layerElement, 'name'),
    kind: 'tile',
    width: getNumberAttribute(layerElement, 'width'),
    height: getNumberAttribute(layerElement, 'height'),
    visible: getBooleanAttribute(layerElement, 'visible', true),
    opacity: getNumberAttribute(layerElement, 'opacity', 1),
    offsetX: getNumberAttribute(layerElement, 'offsetx'),
    offsetY: getNumberAttribute(layerElement, 'offsety'),
    properties: parseProperties(layerElement),
    gids,
    nonEmptyTiles,
  }
}

function parseObject(objectElement: Element): MapObject {
  return {
    id: getNumberAttribute(objectElement, 'id'),
    name: objectElement.getAttribute('name') ?? '',
    type: objectElement.getAttribute('type') ?? '',
    x: getNumberAttribute(objectElement, 'x'),
    y: getNumberAttribute(objectElement, 'y'),
    width: getNumberAttribute(objectElement, 'width'),
    height: getNumberAttribute(objectElement, 'height'),
    rotation: getNumberAttribute(objectElement, 'rotation'),
    properties: parseProperties(objectElement),
  }
}

function parseObjectGroup(groupElement: Element): MapObjectGroup {
  const objects = Array.from(groupElement.querySelectorAll(':scope > object')).map(parseObject)

  return {
    id: getNumberAttribute(groupElement, 'id'),
    name: getRequiredAttribute(groupElement, 'name'),
    kind: 'object',
    visible: getBooleanAttribute(groupElement, 'visible', true),
    opacity: getNumberAttribute(groupElement, 'opacity', 1),
    drawOrder: groupElement.getAttribute('draworder') ?? 'topdown',
    properties: parseProperties(groupElement),
    objects,
  }
}

function parseTileset(sourcePath: string, tilesetElement: Element): MapTileset {
  const tileProperties: Record<number, Record<string, MapPropertyValue>> = {}
  const animations: Record<number, MapTilesetAnimationFrame[]> = {}

  for (const tileElement of tilesetElement.querySelectorAll(':scope > tile')) {
    const tileId = getNumberAttribute(tileElement, 'id')
    tileProperties[tileId] = parseProperties(tileElement)

    const animationElement = tileElement.querySelector(':scope > animation')
    if (animationElement) {
      animations[tileId] = Array.from(animationElement.querySelectorAll(':scope > frame')).map(
        (frameElement) => ({
          tileId: getNumberAttribute(frameElement, 'tileid'),
          duration: getNumberAttribute(frameElement, 'duration'),
        }),
      )
    }
  }

  const imageElement = tilesetElement.querySelector(':scope > image')
  const imageSource = imageElement?.getAttribute('source') ?? null

  return {
    firstGid: getNumberAttribute(tilesetElement, 'firstgid', 1),
    name: getRequiredAttribute(tilesetElement, 'name'),
    tileWidth: getNumberAttribute(tilesetElement, 'tilewidth'),
    tileHeight: getNumberAttribute(tilesetElement, 'tileheight'),
    tileCount: getNumberAttribute(tilesetElement, 'tilecount'),
    columns: getNumberAttribute(tilesetElement, 'columns'),
    imageSource,
    imagePath: resolveTilesetImagePath(sourcePath, imageSource),
    imageWidth: imageElement ? getNumberAttribute(imageElement, 'width') : null,
    imageHeight: imageElement ? getNumberAttribute(imageElement, 'height') : null,
    properties: parseProperties(tilesetElement),
    tileProperties,
    animations,
  }
}

export function parseTmxMap(
  sourcePath: string,
  relativePath: string,
  xml: string,
): MapDocument {
  const parser = new DOMParser()
  const document = parser.parseFromString(xml, 'application/xml')
  const errorNode = document.querySelector('parsererror')
  if (errorNode) {
    throw new Error(`Failed to parse TMX XML: ${errorNode.textContent?.trim() ?? 'Unknown parser error'}`)
  }

  const mapElement = document.querySelector('map')
  if (!mapElement) {
    throw new Error('TMX document has no <map> root element.')
  }

  const layers = Array.from(mapElement.querySelectorAll(':scope > layer')).map(parseLayer)
  const objectGroups = Array.from(mapElement.querySelectorAll(':scope > objectgroup')).map(parseObjectGroup)
  const tilesets = Array.from(mapElement.querySelectorAll(':scope > tileset')).map((tilesetElement) =>
    parseTileset(sourcePath, tilesetElement),
  )

  return {
    name: relativePath.split(/[/\\]/).pop()?.replace(/\.tmx$/i, '') ?? 'Unnamed',
    format: 'tmx',
    sourcePath,
    relativePath,
    width: getNumberAttribute(mapElement, 'width'),
    height: getNumberAttribute(mapElement, 'height'),
    tileWidth: getNumberAttribute(mapElement, 'tilewidth'),
    tileHeight: getNumberAttribute(mapElement, 'tileheight'),
    orientation: getRequiredAttribute(mapElement, 'orientation'),
    renderOrder: mapElement.getAttribute('renderorder') ?? 'right-down',
    properties: parseProperties(mapElement),
    tilesets,
    layers,
    objectGroups,
  }
}
