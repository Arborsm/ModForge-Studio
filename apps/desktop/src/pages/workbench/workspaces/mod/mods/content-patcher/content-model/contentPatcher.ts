import type { ContentPatcherPatchSummary } from '@entities/mod/api'

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePatchTarget(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(', ')
}

function buildPatchSummary(index: number, patch: JsonObject): ContentPatcherPatchSummary {
  const action = asTrimmedString(patch.Action) || 'Unknown'
  const target = normalizePatchTarget(patch.Target)
  const fromFile = asTrimmedString(patch.FromFile) || null
  const logName = asTrimmedString(patch.LogName) || (target ? `${action} -> ${target}` : `${action} #${index}`)
  const whenKeys = isJsonObject(patch.When) ? Object.keys(patch.When).sort((left, right) => left.localeCompare(right)) : []
  const updateKeys = Array.isArray(patch.Update)
    ? patch.Update.filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
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

/** Derives the read-only Content Patcher summary used by mod inspection. */
export function summarizeContentPatcherContent(value: unknown) {
  const content = isJsonObject(value) ? value : {}
  const rawChanges = Array.isArray(content.Changes) ? content.Changes : []
  const patches = rawChanges
    .map((entry, index) => (isJsonObject(entry) ? buildPatchSummary(index, entry) : null))
    .filter((entry): entry is ContentPatcherPatchSummary => Boolean(entry))
  const configEntries = isJsonObject(content.ConfigSchema)
    ? Object.entries(content.ConfigSchema)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, definition]) => ({
          key,
          defaultValue: isJsonObject(definition) ? (definition.Default ?? null) : null,
        }))
    : []
  return {
    format: typeof content.Format === 'string' ? content.Format : null,
    changeCount: rawChanges.length,
    includeCount: Array.isArray(content.Include) ? content.Include.length : 0,
    dynamicTokenCount: Array.isArray(content.DynamicTokens) ? content.DynamicTokens.length : 0,
    configKeys: configEntries.map((entry) => entry.key),
    configEntries,
    patches,
  }
}
