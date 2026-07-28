export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export const normalizeLookupKey = (value: string) => value.trim().toLowerCase()

/** Interpolates `{name}` placeholders in a locale copy template. */
export function formatCopyTemplate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template)
}
