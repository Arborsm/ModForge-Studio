export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export const normalizeLookupKey = (value: string) => value.trim().toLowerCase()
