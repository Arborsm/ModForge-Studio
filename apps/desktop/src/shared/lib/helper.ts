/** @file Small shared utilities: class name joiner, lookup key normalizer, and locale template interpolation. */

/** Joins truthy class name values with spaces. */
export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

/** Normalizes a string for case-insensitive lookup keys (trim + lowercase). */
export const normalizeLookupKey = (value: string) => value.trim().toLowerCase()

/** Interpolates `{name}` placeholders in a locale copy template. */
export function formatCopyTemplate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template)
}
