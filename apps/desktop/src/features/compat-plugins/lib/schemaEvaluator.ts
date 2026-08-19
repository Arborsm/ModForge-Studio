/**
 * @file Pure-logic schema evaluator for compat plugin page descriptors: field
 * visibility, validation, default value filling and value extraction.
 * @module features/compat-plugins
 */
import type { CompatPluginField, CompatPluginFieldVisibleWhen, CompatPluginValidation } from '../api/types'

/** Result of evaluating a field's visibility condition. */
export function evaluateVisibleWhen(condition: CompatPluginFieldVisibleWhen | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true
  const fieldValue = values[condition.field]
  if (condition.kind === 'field-eq') {
    return fieldValue === condition.value
  }
  if (condition.kind === 'field-in') {
    const allowed = condition.values ?? []
    return allowed.some((v) => v === fieldValue)
  }
  return true
}

/** Filters fields that are visible given the current values. */
export function filterVisibleFields(fields: readonly CompatPluginField[], values: Record<string, unknown>): CompatPluginField[] {
  return fields.filter((field) => evaluateVisibleWhen(field.visibleWhen, values))
}

/** Field validation error. */
export type FieldValidationError = {
  fieldId: string
  path: string
  message: string
}

/** Validates a single field's value against its constraints. Returns errors (empty = valid). */
export function validateField(field: CompatPluginField, value: unknown): FieldValidationError[] {
  const errors: FieldValidationError[] = []
  const isEmpty = value === undefined || value === null || value === ''

  if (field.required && isEmpty) {
    errors.push({ fieldId: field.id, path: field.path, message: 'at.field.required' })
    return errors
  }

  if (isEmpty) return errors

  switch (field.type) {
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
        break
      }
      if (field.min !== undefined && value < field.min) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.outOfRange' })
      }
      if (field.max !== undefined && value > field.max) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.outOfRange' })
      }
      break
    }
    case 'choice': {
      const strValue = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value)
      if (field.allowValues && !field.allowValues.includes(strValue)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
    case 'string-list': {
      if (!Array.isArray(value)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
    case 'record-list': {
      if (!Array.isArray(value)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
    case 'bool': {
      if (typeof value !== 'boolean') {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
    case 'text':
    case 'keybind':
    case 'keybind-list': {
      if (typeof value !== 'string' && !Array.isArray(value)) {
        errors.push({ fieldId: field.id, path: field.path, message: 'at.field.invalid' })
      }
      break
    }
  }

  return errors
}

/** Validates all visible fields in a section. Returns all errors (empty = valid). */
export function validateFields(fields: readonly CompatPluginField[], values: Record<string, unknown>): FieldValidationError[] {
  const errors: FieldValidationError[] = []
  for (const field of fields) {
    if (!evaluateVisibleWhen(field.visibleWhen, values)) continue
    const value = values[field.path]
    errors.push(...validateField(field, value))
  }
  return errors
}

/** Checks if a value is non-empty (not undefined, null, empty string, or empty array). */
function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** Validates cross-field rules (e.g. require-one-of). Returns errors (empty = valid). */
export function validateCrossField(rules: readonly CompatPluginValidation[], values: Record<string, unknown>): FieldValidationError[] {
  const errors: FieldValidationError[] = []
  for (const rule of rules) {
    if (rule.kind === 'require-one-of') {
      const hasAtLeastOne = rule.paths.some((path) => isNonEmpty(values[path]))
      if (!hasAtLeastOne) {
        errors.push({ fieldId: rule.paths[0] ?? '', path: rule.paths.join('|'), message: rule.messageKey })
      }
    }
  }
  return errors
}

/** Validates fields and cross-field rules together. Returns all errors (empty = valid). */
export function validateAll(
  fields: readonly CompatPluginField[],
  rules: readonly CompatPluginValidation[],
  values: Record<string, unknown>,
): FieldValidationError[] {
  return [...validateFields(fields, values), ...validateCrossField(rules, values)]
}

/** Returns the default value for a field type (used when a field is missing from loaded data). */
export function defaultFieldValue(field: CompatPluginField): unknown {
  switch (field.type) {
    case 'bool':
      return false
    case 'number':
      return field.min ?? 0
    case 'text':
    case 'keybind':
      return ''
    case 'choice':
      return field.allowValues?.[0] ?? ''
    case 'string-list':
    case 'keybind-list':
    case 'record-list':
      return []
    case 'object':
      return {}
    default:
      return null
  }
}

/** Fills missing fields in a loaded entry with their default values. Does not overwrite existing values. */
export function fillDefaults(fields: readonly CompatPluginField[], values: Record<string, unknown>): Record<string, unknown> {
  const result = { ...values }
  for (const field of fields) {
    if (result[field.path] === undefined) {
      result[field.path] = defaultFieldValue(field)
    }
  }
  return result
}

/** Extracts a field value from a record by its path (top-level key). */
export function getFieldPath(field: CompatPluginField): string {
  return field.path
}
