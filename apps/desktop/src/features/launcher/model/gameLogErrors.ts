import type { LauncherLogPage } from '../api/types'

/**
 * @file Pure helpers for the Android game-log error watch: parsing SMAPI console
 * ERROR lines out of the teed launcher log and diffing log pages against a
 * persisted line-count cursor so only lines written since the last launcher
 * mount are inspected. Kept free of locale strings and host calls so the
 * parsing and cursor arithmetic are unit-testable.
 */

/** One parsed SMAPI console ERROR line (`[HH:MM:SS ERROR source] message`). */
export type SmapiLogError = {
  /** The original console line, kept verbatim for display and AI analysis. */
  raw: string
  /** Mod/log source token between the level and the closing bracket; null when absent. */
  source: string | null
  /** Message text after the closing bracket. */
  message: string
}

const SMAPI_ERROR_LINE_PATTERN = /^\[(\d{1,2}:\d{2}:\d{2})\s+ERROR\s+([^\]]*)\]\s?(.*)$/u

/** Parses the SMAPI ERROR lines out of raw log lines; other lines are dropped. */
export function parseSmapiLogErrors(lines: string[]): SmapiLogError[] {
  const errors: SmapiLogError[] = []
  for (const line of lines) {
    const match = SMAPI_ERROR_LINE_PATTERN.exec(line)
    if (!match) {
      continue
    }
    const source = (match[2] ?? '').trim()
    errors.push({
      raw: line,
      source: source.length ? source : null,
      message: (match[3] ?? '').trim(),
    })
  }
  return errors
}

/**
 * Diffs a log page against the persisted total-line cursor. A null cursor is
 * the first run: the cursor seeds to the current total without reporting, so
 * the user is not greeted with the whole history. When the log was rotated
 * (total shrank below the cursor, e.g. the 1MB cap restarted the file) the
 * diff reports nothing and reseeds, rather than re-alerting on a stale tail.
 */
export function diffLauncherLogPage(
  cursor: number | null,
  page: Pick<LauncherLogPage, 'lines' | 'totalLines'>,
): { newLines: string[]; nextCursor: number } {
  const totalLines = Math.max(0, page.totalLines)
  if (cursor === null) {
    return { newLines: [], nextCursor: totalLines }
  }
  if (totalLines <= cursor) {
    return { newLines: [], nextCursor: Math.max(cursor, totalLines) }
  }
  const newCount = totalLines - cursor
  const newLines = newCount >= page.lines.length ? [...page.lines] : page.lines.slice(page.lines.length - newCount)
  return { newLines, nextCursor: totalLines }
}

/**
 * Trims a log excerpt to a character budget for AI analysis, cutting whole
 * lines and marking the cut. The budget is approximate: the marker itself and
 * at least the first line always survive.
 */
export function truncateLogExcerpt(text: string, maxChars: number): string {
  const budget = Math.max(256, maxChars)
  if (text.length <= budget) {
    return text
  }
  const cut = text.slice(0, budget)
  const lastNewline = cut.lastIndexOf('\n')
  const trimmed = lastNewline > 0 ? cut.slice(0, lastNewline) : cut
  return `${trimmed}\n… [truncated]`
}
