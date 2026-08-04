/**
 * Parses a discover search query as a Nexus mod id when the trimmed query is a
 * plain positive integer (for example "40775"). Returns null for text queries,
 * empty strings, zero, or numbers outside the safe integer range so normal
 * catalog search behavior is preserved.
 */
export function parseLauncherModIdQuery(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
