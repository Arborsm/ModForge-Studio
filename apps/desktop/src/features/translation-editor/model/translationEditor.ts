import type { ContentPatcherI18nFile } from '@entities/mod/api'

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

type BuildTranslationEntriesOptions = {
  sourceFile: ContentPatcherI18nFile | null
  targetFile: ContentPatcherI18nFile | null
  query: string
  status: TranslationStatusFilter
}

function parseI18nObject(file: ContentPatcherI18nFile | null): Record<string, string> {
  if (!file) {
    return {}
  }

  try {
    const parsed = JSON.parse(file.rawJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

export function extractI18nTokens(value: string): string[] {
  const tokens = new Set<string>()
  for (const match of value.matchAll(/\{\{[^{}]+\}\}|\$\d+/g)) {
    tokens.add(match[0])
  }

  return [...tokens].sort((left, right) => {
    const leftNumeric = left.startsWith('$')
    const rightNumeric = right.startsWith('$')
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1
    }

    return left.localeCompare(right)
  })
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
  const sourceEntries = parseI18nObject(sourceFile)
  const targetEntries = parseI18nObject(targetFile)
  const normalizedQuery = query.trim().toLowerCase()

  return Object.keys({ ...sourceEntries, ...targetEntries })
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const sourceText = sourceEntries[key] ?? ''
      const targetText = targetEntries[key] ?? ''
      const hasTargetKey = Object.prototype.hasOwnProperty.call(targetEntries, key)
      const sourceTokens = extractI18nTokens(sourceText)
      const targetTokens = extractI18nTokens(targetText)
      const missingTokens = sourceTokens.filter((token) => !targetTokens.includes(token))
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
  const entries = parseI18nObject(file)
  entries[key] = value
  const rawJson = `${JSON.stringify(entries, null, 2)}\n`

  return {
    ...file,
    rawJson,
    entryCount: Object.keys(entries).length,
  }
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
