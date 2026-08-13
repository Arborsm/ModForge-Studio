/**
 * Pure parsing/serialization of the map `Music` property and the game clock
 * values its time-range form uses.
 *
 * The game reads the property three ways (matching GameLocation):
 * - absent           → follows the game default (previous track keeps playing);
 * - a single cue     → that cue plays all day;
 * - "start end cue"  → the cue plays only between the two game-clock times
 *   (`end` 0 means "until the day ends").
 *
 * Game clock values are 24-hour HHMM integers (e.g. 600 = 06:00, 1900 = 19:00);
 * the clock only advances in 10-minute steps, so the minute field is one of
 * 00/10/20/30/40/50. Night-owl ranges may pass midnight (up to 2600 = 02:00).
 */

/** Minute tens the game clock can show (00, 10, …, 50). */
export const GAME_CLOCK_MINUTE_STEPS = [0, 10, 20, 30, 40, 50] as const

/** Hour range offered by the play-time steppers (6 AM through 2 AM next day). */
export const GAME_CLOCK_HOUR_MIN = 6
export const GAME_CLOCK_HOUR_MAX = 26

/** Largest game-clock value a time stepper offers (02:00 next day). */
export const GAME_CLOCK_MAX_VALUE = GAME_CLOCK_HOUR_MAX * 100

/** Sentinel the game uses for "no end time" (until the day ends). */
export const GAME_CLOCK_END_UNLIMITED = 0

export type MapMusicProperty =
  /** No `Music` property: the game default / previous track continues. */
  | { kind: 'none' }
  /** A single cue name plays all day. */
  | { kind: 'cue'; cue: string }
  /** "start end cue": the cue plays only between the two game-clock times. */
  | { kind: 'span'; cue: string; start: number; end: number }

/**
 * Parses a raw `Music` property value into its semantic form. Anything that is
 * not an absent value and not a valid "HHMM HHMM cue" triple is treated as a
 * plain cue name so unknown/legacy values round-trip as written.
 */
export function parseMapMusicProperty(raw: string): MapMusicProperty {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { kind: 'none' }
  }
  const tokens = trimmed.split(/\s+/u)
  if (tokens.length >= 3) {
    const start = Number.parseInt(tokens[0] ?? '', 10)
    const end = Number.parseInt(tokens[1] ?? '', 10)
    const cue = tokens.slice(2).join(' ').trim()
    if (Number.isFinite(start) && Number.isFinite(end) && cue) {
      return { kind: 'span', start, end, cue }
    }
  }
  return { kind: 'cue', cue: trimmed }
}

/** Serializes a semantic music value back into the raw `Music` property text. */
export function serializeMapMusicProperty(parsed: MapMusicProperty): string {
  if (parsed.kind === 'none') {
    return ''
  }
  if (parsed.kind === 'cue') {
    return parsed.cue.trim()
  }
  return `${parsed.start} ${parsed.end} ${parsed.cue.trim()}`
}

/**
 * Returns true when `value` is a plausible game-clock HHMM integer: minutes are
 * one of the 10-minute steps and the total is within the night-owl range the
 * clock can represent (0..2600). Used to validate time-range edits before they
 * are written.
 */
export function isValidGameClockValue(value: number): boolean {
  if (!Number.isInteger(value) || value < 0 || value > GAME_CLOCK_MAX_VALUE) {
    return false
  }
  const minutes = value % 100
  return (GAME_CLOCK_MINUTE_STEPS as readonly number[]).includes(minutes)
}

/** Formats a game-clock HHMM integer as a `HH:MM` label (wrapping past 24). */
export function formatGameClockValue(value: number): string {
  const hour = Math.floor(value / 100) % 24
  const minute = Math.max(0, value % 100)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** True when the clock value falls after midnight (>= 24:00). */
export function isGameClockNextDay(value: number): boolean {
  return value >= 2400
}

/** All `HHMM` game-clock values offered by the from/to steppers (10-minute steps). */
export function buildGameClockStepperValues(): readonly number[] {
  const values: number[] = []
  for (let hour = GAME_CLOCK_HOUR_MIN; hour <= GAME_CLOCK_HOUR_MAX; hour += 1) {
    for (const minute of GAME_CLOCK_MINUTE_STEPS) {
      const value = hour * 100 + minute
      if (value > GAME_CLOCK_MAX_VALUE) break
      values.push(value)
    }
  }
  return values
}
