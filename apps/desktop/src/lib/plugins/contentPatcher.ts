import type { ContentPatcherPatchSummary } from '../desktop'

type JsonObject = Record<string, unknown>

type ParsedJsonResult = {
  value: unknown | null
  error: string | null
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
