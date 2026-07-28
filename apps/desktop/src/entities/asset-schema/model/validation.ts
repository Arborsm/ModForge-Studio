/**
 * Schema-driven validation.
 *
 * Runs three universal rules (required fields, unknown enum values,
 * case-insensitive duplicate entry ids — all three follow from how Content
 * Patcher and the game read data assets) plus whatever field-level `validate`
 * callbacks the schema declares, and reports everything as `AssetIssue`.
 */

import { isPlainObject, parseAssetEntry } from './entryDraft'
import { matchEnumValue, type AssetFieldSchema, type AssetIssue, type AssetSchema, type AssetValidationContext } from './fieldSchema'
import { getEnumCatalog } from './registry'

function validateValue(field: AssetFieldSchema, value: unknown, context: AssetValidationContext, issues: AssetIssue[]) {
  if (field.required && (value === undefined || value === null || value === '')) {
    issues.push({
      severity: 'error',
      code: 'requiredMissing',
      messageKey: 'requiredMissing',
      path: context.path,
      params: { field: field.key },
    })
  }

  if (field.control === 'enum' && value !== undefined && value !== null && typeof value !== 'number') {
    // Integer enum serialization is valid game JSON, so only strings are checked.
    const catalog = getEnumCatalog(field.enumCatalog)
    const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
    if (catalog.length > 0 && matchEnumValue(catalog, value) === null) {
      issues.push({
        severity: 'warning',
        code: 'enumUnknown',
        messageKey: 'enumUnknown',
        path: context.path,
        params: { field: field.key, value: text },
      })
    }
  }

  if (field.validate) {
    issues.push(...field.validate(value, context))
  }

  if (field.itemSchema === undefined) {
    return
  }

  if (field.control === 'nested_list' && Array.isArray(value)) {
    value.forEach((item, index) => {
      const siblings = isPlainObject(item) ? item : {}
      for (const child of field.itemSchema ?? []) {
        validateValue(child, siblings[child.key], { ...context, path: [...context.path, index, child.key], siblings }, issues)
      }
    })
  }

  if (field.control === 'nested_object' && isPlainObject(value)) {
    for (const child of field.itemSchema) {
      validateValue(child, value[child.key], { ...context, path: [...context.path, child.key], siblings: value }, issues)
    }
  }
}

/** Validates one parsed entry against its schema. */
export function validateAssetEntry(schema: AssetSchema, entryKey: string, raw: unknown): AssetIssue[] {
  const issues: AssetIssue[] = []
  const draft = parseAssetEntry(schema, raw)
  for (const field of schema.fields) {
    validateValue(
      field,
      draft.fields[field.key],
      { assetId: schema.assetId, entryKey, path: [entryKey, field.key], siblings: draft.fields },
      issues,
    )
  }
  return issues
}

/**
 * Validates every entry of an asset, including duplicate entry ids that differ
 * only in letter case (the game matches asset keys case-insensitively, so those
 * silently overwrite each other at load time).
 */
export function validateAssetEntries(schema: AssetSchema, entries: Readonly<Record<string, unknown>>): AssetIssue[] {
  const issues: AssetIssue[] = []
  const seen = new Map<string, string>()
  for (const entryKey of Object.keys(entries)) {
    const lower = entryKey.toLowerCase()
    const previous = seen.get(lower)
    if (previous === undefined) {
      seen.set(lower, entryKey)
    } else {
      issues.push({
        severity: 'error',
        code: 'duplicateEntryKey',
        messageKey: 'duplicateEntryKey',
        path: [entryKey],
        relatedKeys: [previous],
        params: { entryKey },
      })
    }
  }
  for (const [entryKey, raw] of Object.entries(entries)) {
    issues.push(...validateAssetEntry(schema, entryKey, raw))
  }
  return issues
}

/** Counts issues by severity for hub badges and the validation rail header. */
export function countAssetIssues(issues: readonly AssetIssue[]) {
  let errors = 0
  let warnings = 0
  let infos = 0
  for (const issue of issues) {
    if (issue.severity === 'error') {
      errors += 1
    } else if (issue.severity === 'warning') {
      warnings += 1
    } else {
      infos += 1
    }
  }
  return { errors, warnings, infos, total: issues.length }
}

/** Renders an issue path as the dotted/bracketed text shown in the rail. */
export function formatIssuePath(path: readonly (string | number)[]): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') {
      return `${text}[${segment + 1}]`
    }
    return text === '' ? segment : `${text}.${segment}`
  }, '')
}
