import JSON5 from 'json5'

type JsonObject = Record<string, unknown>

export type I18nExtraction = {
  key: string
  source: string
  target: string
  targetKey: string
  entryPath: string
}

export type ContentPatcherI18nOptions = {
  targetPrefixes?: Record<string, string>
}

export type ContentPatcherI18nGeneration = {
  patch: JsonObject
  translations: Record<string, string>
  extractions: I18nExtraction[]
  skippedExisting: number
  conflictsResolved: number
}

export type ContentPatcherProjectFile = { path: string; text: string }
export type ContentPatcherProjectGeneration = {
  files: Map<string, string>
  translations: Record<string, string>
  extractions: I18nExtraction[]
  transformedFileCount: number
  skippedExisting: number
  conflictsResolved: number
  warnings: string[]
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function property(object: JsonObject, name: string) {
  return Object.entries(object).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

function segment(value: string) {
  return value
    .trim()
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/[^\p{L}\p{N}_()]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function targetSegment(target: string) {
  return segment(target.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Patch') || 'Patch'
}

const FESTIVAL_PREFIXES: Record<string, string> = {
  spring13: 'EggFestival',
  spring24: 'FlowerDance',
  summer11: 'Luau',
  summer28: 'MoonlightJellies',
  fall16: 'StardewValleyFair',
  fall27: 'SpiritEve',
  winter8: 'FestivalOfIce',
  winter25: 'FeastOfWinterStar',
}

/** Suggests a stable semantic group prefix from a Content Patcher target asset. */
export function suggestTargetPrefix(target: string) {
  const parts = target.split(/[\\/]/).filter(Boolean)
  const leaf = parts.at(-1) ?? 'Patch'
  if (leaf.toLowerCase() === 'festivals') return 'Festivals'
  if (parts.some((part) => part.toLowerCase() === 'festivals')) {
    return FESTIVAL_PREFIXES[leaf.toLowerCase()] ?? `Festival.${segment(leaf)}`
  }
  if (/^MarriageDialogue/i.test(leaf)) return 'MarriageDialogue'
  if (/MovieReactions?/i.test(target)) return 'MovieReactions'
  if (/ExtraDialogue/i.test(target)) return 'ExtraDialogue'
  if (parts.some((part) => part.toLowerCase() === 'dialogue')) return segment(leaf)
  return segment(leaf) || 'Patch'
}

function configuredTargetPrefix(target: string, configured: Record<string, string> | undefined) {
  if (!configured) return ''
  return Object.entries(configured)
    .filter(([path, value]) => value.trim() && (target === path || target.startsWith(`${path}/`) || target.startsWith(`${path}\\`)))
    .sort(([left], [right]) => left.split(/[\\/]/).length - right.split(/[\\/]/).length)
    .map(([, value]) => value.trim())
    .join('.')
}

function isExistingI18n(value: string) {
  return /\{\{\s*i18n\s*:/i.test(value)
}

type Candidate = {
  change: JsonObject
  container: JsonObject | unknown[]
  property: string | number
  source: string
  target: string
  path: string[]
  baseKey: string
  targetPrefix: string
}

function collectLeaves(
  value: unknown,
  container: JsonObject | unknown[],
  propertyKey: string | number,
  path: string[],
  target: string,
  prefix: string,
  targetPrefix: string,
  change: JsonObject,
  candidates: Candidate[],
  skipped: { count: number },
) {
  if (typeof value === 'string') {
    if (!value.trim() || isExistingI18n(value)) {
      if (isExistingI18n(value)) skipped.count += 1
      return
    }
    const pathKey = path.map(segment).filter(Boolean).join('.') || 'Text'
    candidates.push({
      change,
      container,
      property: propertyKey,
      source: value,
      target,
      path,
      baseKey: [prefix, targetPrefix, pathKey].filter(Boolean).join('.'),
      targetPrefix,
    })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectLeaves(entry, value, index, [...path, String(index + 1)], target, prefix, targetPrefix, change, candidates, skipped),
    )
    return
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectLeaves(entry, value, key, [...path, key], target, prefix, targetPrefix, change, candidates, skipped)
    }
  }
}

/** Parses JSON/JSON5 Content Patcher data and replaces localizable Entries leaves with i18n tokens. */
export function generateContentPatcherI18n(
  sourceText: string,
  rawPrefix: string,
  options: ContentPatcherI18nOptions = {},
): ContentPatcherI18nGeneration {
  const parsed = JSON5.parse(sourceText) as unknown
  if (!isObject(parsed)) throw new Error('The Content Patcher file must contain a JSON object.')
  const prefix = rawPrefix.split('.').map(segment).filter(Boolean).join('.')
  if (!prefix) throw new Error('Enter a valid i18n key prefix.')

  const changes = property(parsed, 'Changes')
  if (!Array.isArray(changes)) throw new Error('The Content Patcher file does not contain a Changes array.')
  const candidates: Candidate[] = []
  const skipped = { count: 0 }
  for (const change of changes) {
    if (!isObject(change)) continue
    const action = property(change, 'Action')
    const entries = property(change, 'Entries')
    if (typeof action !== 'string' || action.toLowerCase() !== 'editdata' || (!isObject(entries) && !Array.isArray(entries))) continue
    const targetValue = property(change, 'Target')
    const target = typeof targetValue === 'string' ? targetValue : 'Patch'
    const targetPrefix = configuredTargetPrefix(target, options.targetPrefixes).split('.').map(segment).filter(Boolean).join('.')
    if (Array.isArray(entries)) {
      entries.forEach((entry, index) =>
        collectLeaves(entry, entries, index, [String(index + 1)], target, prefix, targetPrefix, change, candidates, skipped),
      )
    } else {
      for (const [key, entry] of Object.entries(entries)) {
        collectLeaves(entry, entries, key, [key], target, prefix, targetPrefix, change, candidates, skipped)
      }
    }
  }

  const baseValues = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    const values = baseValues.get(candidate.baseKey) ?? new Set<string>()
    values.add(candidate.source)
    baseValues.set(candidate.baseKey, values)
  }
  const translations: Record<string, string> = {}
  const extractions: I18nExtraction[] = []
  let conflictsResolved = 0
  for (const [index, candidate] of candidates.entries()) {
    let key = candidate.baseKey
    if ((baseValues.get(key)?.size ?? 0) > 1) {
      conflictsResolved += 1
      key = [prefix, candidate.targetPrefix, targetSegment(candidate.target), candidate.path.map(segment).filter(Boolean).join('.')]
        .filter(Boolean)
        .join('.')
    }
    if (translations[key] !== undefined && translations[key] !== candidate.source) key = `${key}.${index + 1}`
    translations[key] = candidate.source
    candidate.container[candidate.property as never] = `{{i18n:${key}}}` as never
    extractions.push({
      key,
      source: candidate.source,
      target: candidate.target,
      targetKey: candidate.target,
      entryPath: candidate.path.join('.'),
    })
  }

  return { patch: parsed, translations, extractions, skippedExisting: skipped.count, conflictsResolved }
}

export function stringifyGeneratedJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Converts every parseable Content Patcher JSON file in a project and merges one default locale. */
export function generateContentPatcherProjectI18n(
  inputFiles: ContentPatcherProjectFile[],
  prefix: string,
  options: ContentPatcherI18nOptions = {},
): ContentPatcherProjectGeneration {
  const files = new Map(inputFiles.map((file) => [file.path, file.text]))
  const defaultLocaleEntry = inputFiles.find((file) => file.path.toLowerCase() === 'i18n/default.json')
  let translations: Record<string, string> = {}
  const warnings: string[] = []
  const manifestEntry = inputFiles.find((file) => file.path.toLowerCase() === 'manifest.json')
  const contentEntry = inputFiles.find((file) => file.path.toLowerCase() === 'content.json')
  if (!manifestEntry) warnings.push('manifest.json is missing from the selected project.')
  if (!contentEntry) warnings.push('content.json is missing from the selected project.')
  if (manifestEntry) {
    try {
      const manifest = JSON5.parse(manifestEntry.text) as unknown
      const contentPackFor =
        isObject(manifest) && isObject(property(manifest, 'ContentPackFor'))
          ? property(property(manifest, 'ContentPackFor') as JsonObject, 'UniqueID')
          : null
      if (typeof contentPackFor !== 'string' || contentPackFor.toLowerCase() !== 'pathoschild.contentpatcher') {
        warnings.push('manifest.json does not declare Pathoschild.ContentPatcher as ContentPackFor.')
      }
    } catch (error) {
      warnings.push(`manifest.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (defaultLocaleEntry) {
    try {
      const parsed = JSON5.parse(defaultLocaleEntry.text) as unknown
      if (isObject(parsed)) {
        translations = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      }
    } catch (error) {
      warnings.push(`i18n/default.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const extractions: I18nExtraction[] = []
  let skippedExisting = 0
  let conflictsResolved = 0
  let transformedFileCount = 0
  for (const file of inputFiles) {
    if (!/\.(?:json5?|jsonc)$/i.test(file.path) || file.path.toLowerCase().startsWith('i18n/')) continue
    let generated: ContentPatcherI18nGeneration
    try {
      generated = generateContentPatcherI18n(file.text, prefix, options)
    } catch (error) {
      if (/Changes array/.test(String(error))) continue
      warnings.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (!generated.extractions.length) continue
    const fileSegment = segment(file.path.replace(/\.(?:json5?|jsonc)$/i, '')) || 'Patch'
    const remapped = new Map<string, string>()
    for (const extraction of generated.extractions) {
      let key = extraction.key
      if (translations[key] !== undefined && translations[key] !== extraction.source) {
        conflictsResolved += 1
        key = `${prefix}.${fileSegment}.${key.slice(prefix.length + 1)}`
      }
      let suffix = 2
      const baseKey = key
      while (translations[key] !== undefined && translations[key] !== extraction.source) key = `${baseKey}.${suffix++}`
      remapped.set(extraction.key, key)
      translations[key] = extraction.source
      extractions.push({ ...extraction, key, target: `${file.path} -> ${extraction.target}` })
    }
    const rewriteTokens = (value: unknown): unknown => {
      if (typeof value === 'string') {
        const match = /^\{\{i18n:(.+)}}$/i.exec(value)
        return match && remapped.has(match[1]) ? `{{i18n:${remapped.get(match[1])}}}` : value
      }
      if (Array.isArray(value)) return value.map(rewriteTokens)
      if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteTokens(entry)]))
      return value
    }
    files.set(file.path, stringifyGeneratedJson(rewriteTokens(generated.patch)))
    skippedExisting += generated.skippedExisting
    conflictsResolved += generated.conflictsResolved
    transformedFileCount += 1
  }
  files.set('i18n/default.json', stringifyGeneratedJson(translations))
  return { files, translations, extractions, transformedFileCount, skippedExisting, conflictsResolved, warnings }
}
