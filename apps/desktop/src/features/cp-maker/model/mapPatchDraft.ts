type JsonRecord = Record<string, unknown>

export type MapPatchDraft = {
  properties: JsonRecord
  warps: JsonRecord[]
  npcWarps: JsonRecord[]
  mapTiles: JsonRecord[]
  patchMode: unknown
  fromArea: unknown
  toArea: unknown
  textOperations: JsonRecord[]
  unknownFields: JsonRecord
}

const KNOWN_STATE_KEYS = new Set([
  'properties',
  'warps',
  'rawWarps',
  'warpsSourceShape',
  'npcWarps',
  'rawNpcWarps',
  'npcWarpsSourceShape',
  'mapTiles',
  'rawMapTiles',
  'fromArea',
  'toArea',
  'patchMode',
  'textOperations',
  'changes',
  'fromFile',
  'mapDocument',
  'disabledEntries',
  'entryLabels',
  'titles',
])

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => asRecord(entry) !== null) : []
}

function pascalCase(value: string): string {
  return value === '' ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`
}

function mapKeys(value: JsonRecord, names: Record<string, string>): JsonRecord {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [names[key] ?? key, entry]))
}

function formatWarp(warp: JsonRecord): string {
  return ['fromX', 'fromY', 'toMap', 'toX', 'toY']
    .map((key) => {
      const value = warp[key]
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
    })
    .join(' ')
}

function serializeWarps(state: JsonRecord, key: 'warps' | 'npcWarps'): unknown {
  const rawKey = key === 'warps' ? 'rawWarps' : 'rawNpcWarps'
  const shapeKey = key === 'warps' ? 'warpsSourceShape' : 'npcWarpsSourceShape'
  const shape = state[shapeKey]
  if (shape === 'raw' && !Array.isArray(state[rawKey])) return state[rawKey]
  const values: unknown[] = asRecordArray(state[key]).map(formatWarp)
  const raw = state[rawKey]
  if (Array.isArray(raw)) values.push(...raw)
  else if (raw !== undefined) values.push(raw)
  if (shape === 'string' && values.length === 1) return values[0]
  return values
}

function serializeArea(value: unknown): unknown {
  const area = asRecord(value)
  if (!area) return value
  const raw = asRecord(area['_raw']) ?? {}
  const result: JsonRecord = { ...raw }
  for (const [key, entry] of Object.entries(area)) {
    if (key !== '_raw') result[pascalCase(key)] = entry
  }
  return result
}

function normalizedRemove(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return null
}

function serializeMapTile(tile: JsonRecord): JsonRecord {
  const raw = asRecord(tile['_raw']) ?? {}
  const result: JsonRecord = { ...raw }
  result['Layer'] = tile['layer']
  const rawPosition = asRecord(raw['Position']) ?? {}
  result['Position'] = { ...rawPosition, X: tile['x'], Y: tile['y'] }
  for (const [draftKey, cpKey] of [
    ['setTilesheet', 'SetTilesheet'],
    ['setIndex', 'SetIndex'],
    ['setProperties', 'SetProperties'],
  ] as const) {
    if (tile[draftKey] === undefined || tile[draftKey] === '') delete result[cpKey]
    else result[cpKey] = tile[draftKey]
  }
  const remove = tile['remove'] === true
  if (normalizedRemove(raw['Remove']) !== remove) {
    if (remove) result['Remove'] = true
    else delete result['Remove']
  }
  return result
}

/** Reads the stable EditMap semantic surface while retaining unknown CP fields. */
export function readMapPatchDraft(editorState: unknown): MapPatchDraft {
  const state = asRecord(editorState) ?? {}
  return {
    properties: asRecord(state['properties']) ?? {},
    warps: asRecordArray(state['warps']),
    npcWarps: asRecordArray(state['npcWarps']),
    mapTiles: asRecordArray(state['mapTiles']),
    patchMode: state['patchMode'] ?? 'ReplaceByLayer',
    fromArea: state['fromArea'],
    toArea: state['toArea'],
    textOperations: asRecordArray(state['textOperations']),
    unknownFields: Object.fromEntries(Object.entries(state).filter(([key]) => !KNOWN_STATE_KEYS.has(key))),
  }
}

const TEXT_OPERATION_KEY_NAMES: Record<string, string> = {
  operation: 'Operation',
  target: 'Target',
  value: 'Value',
  delimiter: 'Delimiter',
  search: 'Search',
  replaceMode: 'ReplaceMode',
}

function serializeTextOperation(operation: JsonRecord): JsonRecord {
  return mapKeys(operation, TEXT_OPERATION_KEY_NAMES)
}

/**
 * Derives CP fields from the EditMap change-card model (`editorState.changes`).
 *
 * `fromFile` comes from the patch level — the file card never owns a copy, so a
 * stale `fromFile` left on a migrated card cannot win over the patch field.
 * Raw token bags that were never migrated into cards (`rawWarps`,
 * `rawNpcWarps`, `rawMapTiles`) are appended after the structured values, the
 * same merge the flat branch applies. When `changes` is non-empty but holds no
 * file card, no `FromFile` is emitted even if `fromFile` has a value.
 */
function serializeChangeCards(cards: JsonRecord[], state: JsonRecord, fromFile: unknown): JsonRecord {
  const result: JsonRecord = {}
  const fileCard = cards.find((card) => card['type'] === 'file')
  if (fileCard) {
    if (typeof fromFile === 'string' && fromFile !== '') {
      result['FromFile'] = fromFile
    }
    if (fileCard['fromArea'] !== undefined) result['FromArea'] = serializeArea(fileCard['fromArea'])
    if (fileCard['toArea'] !== undefined) result['ToArea'] = serializeArea(fileCard['toArea'])
    result['PatchMode'] = fileCard['patchMode'] ?? 'ReplaceByLayer'
  }
  const mapTiles: JsonRecord[] = []
  const properties: JsonRecord = {}
  const warps: unknown[] = []
  const npcWarps: unknown[] = []
  const textOperations: JsonRecord[] = []
  for (const card of cards) {
    if (card['type'] === 'tiles') mapTiles.push(...asRecordArray(card['mapTiles']).map(serializeMapTile))
    else if (card['type'] === 'properties') Object.assign(properties, asRecord(card['properties']) ?? {})
    else if (card['type'] === 'warps') {
      warps.push(...asRecordArray(card['warps']).map(formatWarp))
      npcWarps.push(...asRecordArray(card['npcWarps']).map(formatWarp))
    } else if (card['type'] === 'text') textOperations.push(...asRecordArray(card['textOperations']))
  }
  const rawWarps = state['rawWarps']
  if (Array.isArray(rawWarps)) warps.push(...rawWarps)
  else if (rawWarps !== undefined) warps.push(rawWarps)
  const rawNpcWarps = state['rawNpcWarps']
  if (Array.isArray(rawNpcWarps)) npcWarps.push(...rawNpcWarps)
  else if (rawNpcWarps !== undefined) npcWarps.push(rawNpcWarps)
  const rawMapTiles = state['rawMapTiles']
  if (Array.isArray(rawMapTiles)) mapTiles.push(...rawMapTiles)
  if (mapTiles.length > 0) result['MapTiles'] = mapTiles
  if (Object.keys(properties).length > 0) result['MapProperties'] = properties
  if (warps.length > 0) result['AddWarps'] = warps
  if (npcWarps.length > 0) result['AddNpcWarps'] = npcWarps
  if (textOperations.length > 0) result['TextOperations'] = textOperations.map(serializeTextOperation)
  return result
}

/**
 * Converts an EditMap editor state back to CP fields without discarding raw expressions or unknown fields.
 *
 * `fromFile` is the patch-level source path; the file change card reads it from
 * here rather than from a card-local copy.
 */
export function mapPatchDraftToContentFields(editorState: unknown, fromFile?: unknown): JsonRecord {
  const state = asRecord(editorState) ?? {}
  const draft = readMapPatchDraft(state)
  const result: JsonRecord = { ...draft.unknownFields }
  const changes = asRecordArray(state['changes'])
  if (changes.length > 0) {
    Object.assign(result, serializeChangeCards(changes, state, fromFile))
    return result
  }
  if (Object.keys(draft.properties).length > 0) result['MapProperties'] = draft.properties
  const warps = serializeWarps(state, 'warps')
  if (!Array.isArray(warps) || warps.length > 0) result['AddWarps'] = warps
  const npcWarps = serializeWarps(state, 'npcWarps')
  if (!Array.isArray(npcWarps) || npcWarps.length > 0) result['AddNpcWarps'] = npcWarps
  const mapTiles = [...draft.mapTiles.map(serializeMapTile), ...(Array.isArray(state['rawMapTiles']) ? state['rawMapTiles'] : [])]
  if (mapTiles.length > 0) result['MapTiles'] = mapTiles
  if (draft.fromArea !== undefined) result['FromArea'] = serializeArea(draft.fromArea)
  if (draft.toArea !== undefined) result['ToArea'] = serializeArea(draft.toArea)
  if (draft.patchMode !== undefined) result['PatchMode'] = draft.patchMode
  if (draft.textOperations.length > 0) {
    result['TextOperations'] = draft.textOperations.map(serializeTextOperation)
  }
  return result
}
