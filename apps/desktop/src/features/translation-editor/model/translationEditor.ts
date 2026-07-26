import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { stardewI18nPlaceholders } from '@shared/infra/game-formats/stardew-i18n/stardewI18n'

export type TranslationEntryStatus = 'translated' | 'missing' | 'error'
export type TranslationStatusFilter = TranslationEntryStatus | 'all'

export type TranslationEntry = {
  key: string
  sourceText: string
  targetText: string
  status: TranslationEntryStatus
  sourceTokens: string[]
  targetTokens: string[]
  missingTokens: string[]
}

export type I18nParseResult =
  | { valid: true; entries: Record<string, string> }
  | { valid: false; entries: Record<string, never>; reason: 'invalid-json' | 'not-object' | 'non-string-value' }

export type TranslationCheckIssue = {
  key: string | null
  kind: 'invalid-json' | 'missing-token' | 'missing-translation' | 'whitespace' | 'line-breaks' | 'length' | 'language-mix'
  severity: 'blocking' | 'warning'
}

export type TranslationCheckSummary = {
  blocking: TranslationCheckIssue[]
  warnings: TranslationCheckIssue[]
  passed: number
}

type BuildTranslationEntriesOptions = {
  sourceFile: ContentPatcherI18nFile | null
  targetFile: ContentPatcherI18nFile | null
  query: string
  status: TranslationStatusFilter
}

export function parseI18nFile(file: ContentPatcherI18nFile | null): I18nParseResult {
  if (!file) {
    return { valid: true, entries: {} }
  }

  try {
    const parsed = JSON.parse(file.rawJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, entries: {}, reason: 'not-object' }
    }
    const values = Object.entries(parsed as Record<string, unknown>)
    if (values.some((entry) => typeof entry[1] !== 'string')) {
      return { valid: false, entries: {}, reason: 'non-string-value' }
    }
    return { valid: true, entries: Object.fromEntries(values) as Record<string, string> }
  } catch {
    return { valid: false, entries: {}, reason: 'invalid-json' }
  }
}

function validEntries(file: ContentPatcherI18nFile | null) {
  const result = parseI18nFile(file)
  return result.valid ? result.entries : {}
}

export function extractI18nTokens(value: string): string[] {
  const tokens = new Set(stardewI18nPlaceholders(value))

  return [...tokens].sort((left, right) => {
    const leftNumeric = left.startsWith('$')
    const rightNumeric = right.startsWith('$')
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1
    }

    return left.localeCompare(right)
  })
}

function missingI18nTokens(source: string, target: string): string[] {
  const targetCounts = new Map<string, number>()
  for (const token of stardewI18nPlaceholders(target)) targetCounts.set(token, (targetCounts.get(token) ?? 0) + 1)
  const missing = new Set<string>()
  for (const token of stardewI18nPlaceholders(source)) {
    const remaining = targetCounts.get(token) ?? 0
    if (remaining > 0) targetCounts.set(token, remaining - 1)
    else missing.add(token)
  }
  return [...missing].sort()
}

function getEntryStatus(hasTargetKey: boolean, targetText: string, missingTokens: string[]): TranslationEntryStatus {
  if (!hasTargetKey || !targetText.trim()) {
    return 'missing'
  }
  if (missingTokens.length) {
    return 'error'
  }

  return 'translated'
}

export function buildTranslationEntries({ sourceFile, targetFile, query, status }: BuildTranslationEntriesOptions): TranslationEntry[] {
  const sourceEntries = validEntries(sourceFile)
  const targetEntries = validEntries(targetFile)
  const normalizedQuery = query.trim().toLowerCase()

  return Object.keys({ ...sourceEntries, ...targetEntries })
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const sourceText = sourceEntries[key] ?? ''
      const targetText = targetEntries[key] ?? ''
      const hasTargetKey = Object.prototype.hasOwnProperty.call(targetEntries, key)
      const sourceTokens = extractI18nTokens(sourceText)
      const targetTokens = extractI18nTokens(targetText)
      const missingTokens = missingI18nTokens(sourceText, targetText)
      return {
        key,
        sourceText,
        targetText,
        sourceTokens,
        targetTokens,
        missingTokens,
        status: getEntryStatus(hasTargetKey, targetText, missingTokens),
      }
    })
    .filter((entry) => {
      if (status !== 'all' && entry.status !== status) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      return [entry.key, entry.sourceText, entry.targetText].join(' ').toLowerCase().includes(normalizedQuery)
    })
}

export function updateI18nFileEntry(file: ContentPatcherI18nFile, key: string, value: string): ContentPatcherI18nFile {
  const result = parseI18nFile(file)
  if (!result.valid) throw new Error(`Cannot update invalid i18n JSON: ${result.reason}`)
  const entries = result.entries
  entries[key] = value
  const rawJson = `${JSON.stringify(entries, null, 2)}\n`

  return {
    ...file,
    rawJson,
    entryCount: Object.keys(entries).length,
  }
}

export function updateI18nFileEntries(file: ContentPatcherI18nFile, values: ReadonlyMap<string, string>): ContentPatcherI18nFile {
  const result = parseI18nFile(file)
  if (!result.valid) throw new Error(`Cannot update invalid i18n JSON: ${result.reason}`)
  const entries = result.entries
  for (const [key, value] of values) entries[key] = value
  const rawJson = `${JSON.stringify(entries, null, 2)}\n`
  return { ...file, rawJson, entryCount: Object.keys(entries).length }
}

export function buildTranslationCheckSummary(
  sourceFile: ContentPatcherI18nFile | null,
  targetFile: ContentPatcherI18nFile | null,
  entries: readonly TranslationEntry[],
  targetLocale = '',
): TranslationCheckSummary {
  const blocking: TranslationCheckIssue[] = []
  const warnings: TranslationCheckIssue[] = []
  if (!parseI18nFile(sourceFile).valid || !parseI18nFile(targetFile).valid) {
    blocking.push({ key: null, kind: 'invalid-json', severity: 'blocking' })
  }
  for (const entry of entries) {
    if (entry.missingTokens.length) blocking.push({ key: entry.key, kind: 'missing-token', severity: 'blocking' })
    if (!entry.targetText.trim()) {
      warnings.push({ key: entry.key, kind: 'missing-translation', severity: 'warning' })
      continue
    }
    if (entry.targetText !== entry.targetText.trim()) warnings.push({ key: entry.key, kind: 'whitespace', severity: 'warning' })
    if ((entry.sourceText.match(/\n/g)?.length ?? 0) !== (entry.targetText.match(/\n/g)?.length ?? 0))
      warnings.push({ key: entry.key, kind: 'line-breaks', severity: 'warning' })
    if (entry.sourceText.length >= 8 && entry.targetText.length > entry.sourceText.length * 4)
      warnings.push({ key: entry.key, kind: 'length', severity: 'warning' })
    const expectedScript = targetLocale.startsWith('zh')
      ? /[\u3400-\u9fff]/
      : targetLocale.startsWith('ja')
        ? /[\u3040-\u30ff\u3400-\u9fff]/
        : targetLocale.startsWith('ko')
          ? /[\uac00-\ud7af]/
          : null
    if (expectedScript && entry.targetText.length >= 4 && !expectedScript.test(entry.targetText))
      warnings.push({ key: entry.key, kind: 'language-mix', severity: 'warning' })
  }
  const failing = new Set([...blocking, ...warnings].map((issue) => issue.key).filter(Boolean))
  return { blocking, warnings, passed: Math.max(0, entries.length - failing.size) }
}

export function createI18nFile(projectPath: string, locale: string): ContentPatcherI18nFile {
  const filename = `${locale}.json`
  return {
    locale,
    path: `${projectPath}\\i18n\\${filename}`,
    relativePath: `i18n/${filename}`,
    rawJson: '{}\n',
    entryCount: 0,
  }
}
