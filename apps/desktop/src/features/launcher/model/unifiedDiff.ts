/**
 * Pure helpers for rendering the archive install diff view: unified diff line
 * parsing, size-delta formatting, and timestamp formatting. No DOM or locale
 * context is required; callers pass the locale explicitly.
 */

export type UnifiedDiffLineKind = 'header' | 'hunk' | 'add' | 'remove' | 'context'

export type UnifiedDiffLine = {
  kind: UnifiedDiffLineKind
  /** Line content including the leading diff marker (e.g. `+foo`, ` context`). */
  text: string
}

/**
 * Parses a unified diff string into typed lines. `---`/`+++` file headers map
 * to `header`, `@@ ... @@` hunk headers to `hunk`, `+`/`-` content lines to
 * `add`/`remove`, and lines starting with a space to `context`. Truly empty
 * segments (including the trailing segment of a final newline) are skipped.
 */
export function parseUnifiedDiff(text: string): UnifiedDiffLine[] {
  const lines: UnifiedDiffLine[] = []
  for (const rawLine of text.split('\n')) {
    if (rawLine.startsWith('---') || rawLine.startsWith('+++')) {
      lines.push({ kind: 'header', text: rawLine })
    } else if (rawLine.startsWith('@@')) {
      lines.push({ kind: 'hunk', text: rawLine })
    } else if (rawLine.startsWith('+')) {
      lines.push({ kind: 'add', text: rawLine })
    } else if (rawLine.startsWith('-')) {
      lines.push({ kind: 'remove', text: rawLine })
    } else if (rawLine.startsWith(' ')) {
      lines.push({ kind: 'context', text: rawLine })
    }
  }
  return lines
}

/**
 * Splits a list into the first `limit` items (visible) and the count of the
 * remaining items (hidden), used by the diff view's fold toggles. Returns the
 * input unchanged when it already fits within the limit.
 */
export function splitForDisplay<T>(items: readonly T[], limit: number): { visible: readonly T[]; hiddenCount: number } {
  if (limit <= 0) {
    return { visible: [], hiddenCount: items.length }
  }
  if (items.length <= limit) {
    return { visible: items, hiddenCount: 0 }
  }
  return { visible: items.slice(0, limit), hiddenCount: items.length - limit }
}

/**
 * Formats a byte-count delta as a signed compact label, e.g. `+128 B` or
 * `−2.5 KB`. Zero differences render as `0 B`.
 */
export function formatSizeDelta(oldSize: number | null | undefined, newSize: number | null | undefined): string {
  if (oldSize == null || newSize == null) {
    return '0 B'
  }
  const delta = newSize - oldSize
  if (delta === 0) {
    return '0 B'
  }
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${formatCompactSize(Math.abs(delta))}`
}

/** Formats an absolute byte count with binary units (`B`/`KB`/`MB`/`GB`/`TB`). */
export function formatCompactSize(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0
  while (unitIndex < units.length - 1 && size >= 1024) {
    size /= 1024
    unitIndex += 1
  }
  if (unitIndex === 0) {
    return `${Math.round(size)} ${units[0]}`
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Formats a unix epoch milliseconds timestamp for the given BCP-47 locale
 * using the short date + time form. Returns null for missing/invalid input.
 */
export function formatTimestampMs(ms: number | null | undefined, locale: string): string | null {
  if (ms == null || !Number.isFinite(ms)) {
    return null
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms))
}
