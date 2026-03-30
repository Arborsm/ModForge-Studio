import type { ContentPatcherPatchSummary } from '../desktop'

type JsonObject = Record<string, unknown>

type ParsedJsonResult = {
  value: unknown | null
  error: string | null
}

export type ContentPatcherAssetKind = 'image' | 'json' | 'other'

export type ContentPatcherAsset = {
  path: string
  kind: ContentPatcherAssetKind
}

export type ContentPatcherTarget = {
  path: string
}

export type ContentPatcherConditionPreset = {
  key: 'Season' | 'Weather' | 'Relationship' | 'Config'
  values?: string[]
}

export type ContentPatcherSimulationContext = {
  season?: string
  weather?: string
  relationship?: string | number
  config?: Record<string, string | number | boolean>
}

export type ContentPatcherCanvasNodeKind = 'condition' | 'action' | 'target' | 'asset'

export type ContentPatcherCanvasEdgeType = 'logic' | 'file' | 'data'

export type ContentPatcherCanvasNode = {
  id: string
  kind: ContentPatcherCanvasNodeKind
  position: { x: number; y: number }
  data: {
    label: string
    patchId?: string
    action?: string
    target?: string
    assetPath?: string
    whenKey?: string
    simulation?: {
      isActive: boolean
      hasUnknownConditions: boolean
    }
    details?: Record<string, unknown>
  }
}

export type ContentPatcherCanvasEdge = {
  id: string
  source: string
  target: string
  type: ContentPatcherCanvasEdgeType
  patchId?: string
}

export type ContentPatcherCanvasBuildResult = {
  nodes: ContentPatcherCanvasNode[]
  edges: ContentPatcherCanvasEdge[]
}

export type ContentPatcherConnectionValidation =
  | { ok: true; edgeType: ContentPatcherCanvasEdgeType }
  | { ok: false; edgeType?: ContentPatcherCanvasEdgeType; reason: string; detail?: string }

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toSafeId(value: string) {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function getPatchEntries(value: unknown) {
  const content = ensureJsonObject(value)
  return Array.isArray(content.Changes) ? content.Changes : []
}

function normalizeStringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed.toLowerCase() : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase()
  }
  return null
}

function matchesConditionValue(expected: unknown, actual: unknown) {
  const actualNormalized = normalizeStringValue(actual)
  if (!actualNormalized) {
    return false
  }

  if (Array.isArray(expected)) {
    return expected.some((entry) => {
      const entryNormalized = normalizeStringValue(entry)
      return entryNormalized ? entryNormalized === actualNormalized : false
    })
  }

  const expectedNormalized = normalizeStringValue(expected)
  return expectedNormalized ? expectedNormalized === actualNormalized : false
}

function evaluateWhenConditions(
  when: JsonObject | null,
  simulation: ContentPatcherSimulationContext | undefined,
) {
  if (!when || !Object.keys(when).length) {
    return { isActive: true, hasUnknownConditions: false }
  }

  let hasUnknownConditions = false
  const season = simulation?.season
  const weather = simulation?.weather
  const relationship = simulation?.relationship
  const config = simulation?.config

  for (const [key, value] of Object.entries(when)) {
    if (key === 'Season') {
      if (!season) {
        hasUnknownConditions = true
        continue
      }
      if (!matchesConditionValue(value, season)) {
        return { isActive: false, hasUnknownConditions }
      }
      continue
    }

    if (key === 'Weather') {
      if (!weather) {
        hasUnknownConditions = true
        continue
      }
      if (!matchesConditionValue(value, weather)) {
        return { isActive: false, hasUnknownConditions }
      }
      continue
    }

    if (key === 'Relationship') {
      if (relationship === undefined || relationship === null) {
        hasUnknownConditions = true
        continue
      }
      if (!matchesConditionValue(value, relationship)) {
        return { isActive: false, hasUnknownConditions }
      }
      continue
    }

    if (key === 'Config' && isJsonObject(value)) {
      const configObject = value
      for (const [configKey, configValue] of Object.entries(configObject)) {
        if (!config || !(configKey in config)) {
          hasUnknownConditions = true
          continue
        }
        if (!matchesConditionValue(configValue, config[configKey])) {
          return { isActive: false, hasUnknownConditions }
        }
      }
      continue
    }

    if (!config || !(key in config)) {
      hasUnknownConditions = true
      continue
    }

    if (!matchesConditionValue(value, config[key])) {
      return { isActive: false, hasUnknownConditions }
    }
  }

  return { isActive: true, hasUnknownConditions }
}

function normalizePatchTarget(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(', ')
  }

  return ''
}

function readPatchFromFiles(patch: JsonObject) {
  const fromFile = patch.FromFile
  if (typeof fromFile === 'string') {
    const trimmed = fromFile.trim()
    return trimmed ? [trimmed] : []
  }
  if (Array.isArray(fromFile)) {
    return fromFile
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function readPatchTargets(patch: JsonObject) {
  const target = patch.Target
  if (typeof target === 'string') {
    const trimmed = target.trim()
    return trimmed ? [trimmed] : []
  }
  if (Array.isArray(target)) {
    return target
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function getAssetKind(path: string): ContentPatcherAssetKind {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) {
    return 'json'
  }
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.webp')
  ) {
    return 'image'
  }
  return 'other'
}

function buildPatchSummary(index: number, patch: JsonObject): ContentPatcherPatchSummary {
  const action = asTrimmedString(patch.Action) || 'Unknown'
  const target = normalizePatchTarget(patch.Target)
  const fromFile = asTrimmedString(patch.FromFile) || null
  const logName = asTrimmedString(patch.LogName) || (target ? `${action} -> ${target}` : `${action} #${index}`)
  const whenKeys = isJsonObject(patch.When) ? Object.keys(patch.When).sort((left, right) => left.localeCompare(right)) : []
  const updateKeys = Array.isArray(patch.Update)
    ? patch.Update.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : []

  return {
    id: `patch:${index}`,
    index,
    action,
    target,
    fromFile,
    logName,
    whenKeys,
    hasWhen: whenKeys.length > 0,
    updateKeys,
  }
}

export function stringifyPrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function parseJsonText(text: string): ParsedJsonResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      value: null,
      error: 'JSON is empty.',
    }
  }

  try {
    return {
      value: JSON.parse(trimmed),
      error: null,
    }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function ensureJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? { ...value } : {}
}

export function summarizeContentPatcherContent(value: unknown) {
  const content = ensureJsonObject(value)
  const rawChanges = Array.isArray(content.Changes) ? content.Changes : []
  const patches = rawChanges
    .map((entry, index) => (isJsonObject(entry) ? buildPatchSummary(index, entry) : null))
    .filter((entry): entry is ContentPatcherPatchSummary => Boolean(entry))
  const configKeys = isJsonObject(content.ConfigSchema)
    ? Object.keys(content.ConfigSchema).sort((left, right) => left.localeCompare(right))
    : []

  return {
    format: typeof content.Format === 'string' ? content.Format : null,
    changeCount: rawChanges.length,
    includeCount: Array.isArray(content.Include) ? content.Include.length : 0,
    dynamicTokenCount: Array.isArray(content.DynamicTokens) ? content.DynamicTokens.length : 0,
    configKeys,
    patches,
  }
}

export function getPatchObject(value: unknown, patchId: string) {
  const summary = summarizeContentPatcherContent(value)
  const selected = summary.patches.find((patch) => patch.id === patchId)
  if (!selected) {
    return null
  }

  const content = ensureJsonObject(value)
  const rawChanges = Array.isArray(content.Changes) ? content.Changes : []
  const patch = rawChanges[selected.index]
  return isJsonObject(patch) ? { ...patch } : null
}

export function updateManifestField(value: unknown, field: string, nextValue: string) {
  const manifest = ensureJsonObject(value)
  const trimmed = nextValue.trim()
  if (trimmed) {
    manifest[field] = trimmed
  } else {
    delete manifest[field]
  }
  return manifest
}

function withChanges(value: unknown, updater: (changes: unknown[]) => unknown[]) {
  const content = ensureJsonObject(value)
  const changes = Array.isArray(content.Changes) ? [...content.Changes] : []
  content.Changes = updater(changes)
  return content
}

export function addPatch(value: unknown) {
  return withChanges(value, (changes) => [
    ...changes,
    {
      LogName: 'New Patch',
      Action: 'EditData',
      Target: '',
    },
  ])
}

export function removePatch(value: unknown, patchId: string) {
  const patch = summarizeContentPatcherContent(value).patches.find((entry) => entry.id === patchId)
  if (!patch) {
    return ensureJsonObject(value)
  }

  return withChanges(value, (changes) => changes.filter((_, index) => index !== patch.index))
}

export function replacePatch(value: unknown, patchId: string, nextPatch: JsonObject) {
  const patch = summarizeContentPatcherContent(value).patches.find((entry) => entry.id === patchId)
  if (!patch) {
    return ensureJsonObject(value)
  }

  return withChanges(value, (changes) => changes.map((entry, index) => (index === patch.index ? nextPatch : entry)))
}

export function updatePatchField(value: unknown, patchId: string, field: string, nextValue: string) {
  const currentPatch = getPatchObject(value, patchId)
  if (!currentPatch) {
    return ensureJsonObject(value)
  }

  const trimmed = nextValue.trim()
  if (trimmed) {
    currentPatch[field] = trimmed
  } else {
    delete currentPatch[field]
  }

  return replacePatch(value, patchId, currentPatch)
}

export function updatePatchWhen(value: unknown, patchId: string, nextValue: string) {
  const currentPatch = getPatchObject(value, patchId)
  if (!currentPatch) {
    return {
      value: ensureJsonObject(value),
      error: 'Patch not found.',
    }
  }

  const trimmed = nextValue.trim()
  if (!trimmed) {
    delete currentPatch.When
    return {
      value: replacePatch(value, patchId, currentPatch),
      error: null,
    }
  }

  const parsed = parseJsonText(trimmed)
  if (parsed.error) {
    return {
      value: ensureJsonObject(value),
      error: parsed.error,
    }
  }

  if (!isJsonObject(parsed.value)) {
    return {
      value: ensureJsonObject(value),
      error: 'When must be a JSON object.',
    }
  }

  currentPatch.When = parsed.value
  return {
    value: replacePatch(value, patchId, currentPatch),
    error: null,
  }
}

export function collectContentPatcherAssets(value: unknown): ContentPatcherAsset[] {
  const assets = new Map<string, ContentPatcherAssetKind>()
  const changes = getPatchEntries(value)
  changes.forEach((entry) => {
    if (!isJsonObject(entry)) {
      return
    }
    readPatchFromFiles(entry).forEach((path) => {
      if (!assets.has(path)) {
        assets.set(path, getAssetKind(path))
      }
    })
  })

  return Array.from(assets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, kind]) => ({ path, kind }))
}

export function collectContentPatcherTargets(value: unknown): string[] {
  const targets = new Set<string>()
  const changes = getPatchEntries(value)
  changes.forEach((entry) => {
    if (!isJsonObject(entry)) {
      return
    }
    readPatchTargets(entry).forEach((path) => {
      targets.add(path)
    })
  })

  return Array.from(targets.values()).sort((left, right) => left.localeCompare(right))
}

export function getContentPatcherConditionPresets(): ContentPatcherConditionPreset[] {
  return [
    { key: 'Season', values: ['spring', 'summer', 'fall', 'winter'] },
    { key: 'Weather' },
    { key: 'Relationship' },
    { key: 'Config' },
  ]
}

export function buildContentPatcherCanvas(
  value: unknown,
  options?: { simulation?: ContentPatcherSimulationContext },
): ContentPatcherCanvasBuildResult {
  const summary = summarizeContentPatcherContent(value)
  const changes = getPatchEntries(value)
  const nodes = new Map<string, ContentPatcherCanvasNode>()
  const edges: ContentPatcherCanvasEdge[] = []
  const edgeIds = new Set<string>()
  const layoutIndex: Record<ContentPatcherCanvasNodeKind, number> = {
    condition: 0,
    asset: 0,
    action: 0,
    target: 0,
  }
  const columns: Record<ContentPatcherCanvasNodeKind, number> = {
    condition: 120,
    asset: 120,
    action: 420,
    target: 760,
  }

  function createNode(id: string, kind: ContentPatcherCanvasNodeKind, data: ContentPatcherCanvasNode['data']) {
    if (nodes.has(id)) {
      return nodes.get(id) as ContentPatcherCanvasNode
    }
    const index = layoutIndex[kind]++
    const node: ContentPatcherCanvasNode = {
      id,
      kind,
      position: {
        x: columns[kind],
        y: index * 140,
      },
      data,
    }
    nodes.set(id, node)
    return node
  }

  function pushEdge(source: string, target: string, type: ContentPatcherCanvasEdgeType, patchId?: string) {
    const id = `edge:${source}:${target}:${type}`
    if (edgeIds.has(id)) {
      return
    }
    edgeIds.add(id)
    edges.push({ id, source, target, type, patchId })
  }

  summary.patches.forEach((patch) => {
    const rawPatch = changes[patch.index]
    if (!isJsonObject(rawPatch)) {
      return
    }

    const whenObject = isJsonObject(rawPatch.When) ? rawPatch.When : null
    const simulation = evaluateWhenConditions(whenObject, options?.simulation)

    const actionNodeId = `action:${patch.id}`
    createNode(actionNodeId, 'action', {
      label: patch.logName,
      patchId: patch.id,
      action: patch.action,
      target: patch.target,
      assetPath: patch.fromFile ?? undefined,
      simulation,
      details: {
        when: whenObject ?? undefined,
      },
    })

    if (whenObject) {
      Object.keys(whenObject).forEach((key) => {
        const conditionId = `condition:${patch.id}:${toSafeId(key)}`
        createNode(conditionId, 'condition', {
          label: key,
          patchId: patch.id,
          whenKey: key,
        })
        pushEdge(conditionId, actionNodeId, 'logic', patch.id)
      })
    }

    readPatchFromFiles(rawPatch).forEach((path) => {
      const assetId = `asset:${toSafeId(path)}`
      createNode(assetId, 'asset', {
        label: path,
        assetPath: path,
      })
      pushEdge(assetId, actionNodeId, 'file', patch.id)
    })

    readPatchTargets(rawPatch).forEach((target) => {
      const targetId = `target:${toSafeId(target)}`
      createNode(targetId, 'target', {
        label: target,
        target,
      })
      pushEdge(actionNodeId, targetId, 'data', patch.id)
    })
  })

  return {
    nodes: Array.from(nodes.values()),
    edges,
  }
}

export function validateContentPatcherConnection(input: {
  sourceKind: ContentPatcherCanvasNodeKind
  targetKind: ContentPatcherCanvasNodeKind
  action?: string
  targetPath?: string
}): ContentPatcherConnectionValidation {
  if (input.sourceKind === 'condition' && input.targetKind === 'action') {
    return { ok: true, edgeType: 'logic' }
  }

  if (input.sourceKind === 'asset' && input.targetKind === 'action') {
    return { ok: true, edgeType: 'file' }
  }

  if (input.sourceKind === 'action' && input.targetKind === 'target') {
    const action = input.action?.trim().toLowerCase()
    const targetPath = input.targetPath?.trim().toLowerCase()
    if (action && targetPath) {
      if (action === 'editimage' && targetPath.startsWith('data/')) {
        return {
          ok: false,
          edgeType: 'data',
          reason: 'action-target-mismatch',
          detail: 'EditImage cannot target Data/* assets.',
        }
      }
      if (action === 'editdata' && !targetPath.startsWith('data/')) {
        return {
          ok: false,
          edgeType: 'data',
          reason: 'action-target-mismatch',
          detail: 'EditData expects a Data/* target.',
        }
      }
    }
    return { ok: true, edgeType: 'data' }
  }

  return {
    ok: false,
    reason: 'unsupported-connection',
  }
}

export function getPatchPreviewJson(value: unknown, patchId: string) {
  const patch = getPatchObject(value, patchId)
  if (!patch) {
    return ''
  }
  return stringifyPrettyJson(patch)
}
