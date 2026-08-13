/**
 * Pure parsing model for Stardew Valley 1.6 schedule scripts
 * (`Content/Characters/schedules/*`). A schedule entry value is a
 * slash-separated command list. Parsing is loss-free: any segment that cannot
 * be reproduced verbatim from its structured form is preserved as a raw
 * segment, so `serializeScheduleScript(parseScheduleScript(script)) === script`
 * holds for every input string.
 */

/** Facing direction after reaching a schedule point: 0=up, 1=right, 2=down, 3=left. */
export type ScheduleFacing = 0 | 1 | 2 | 3

/** Semantic ids for the four schedule facing directions, in game order 0..3. */
export const SCHEDULE_FACING_IDS = ['up', 'right', 'down', 'left'] as const

export type ScheduleFacingId = (typeof SCHEDULE_FACING_IDS)[number]

/** Maps a numeric facing value to its semantic id (0=up, 1=right, 2=down, 3=left). */
export function getScheduleFacingId(facing: ScheduleFacing): ScheduleFacingId {
  return SCHEDULE_FACING_IDS[facing]
}

/**
 * A destination command: `<time> [location] [x y] [facing] [animation] [dialogue]`.
 * `location` is null when omitted (the game reuses the previous map), `x`/`y`
 * are null for the `bed` / location-only shorthands, and `dialogue` stores the
 * quoted text without its surrounding quotes.
 */
export type SchedulePointSegment = {
  kind: 'point'
  /** Military time without a colon (e.g. 900, 2530). 0 means "from day start". */
  time: number
  /** True when the time carries the `a` prefix (arrival time instead of departure). */
  arrival: boolean
  location: string | null
  x: number | null
  y: number | null
  facing: ScheduleFacing | null
  animation: string | null
  dialogue: string | null
}

/** `GOTO <key|season|NO_SCHEDULE>` redirect command. */
export type ScheduleGotoSegment = {
  kind: 'goto'
  target: string
}

export type ScheduleFriendshipRequirement = {
  npc: string
  hearts: number
}

/** `NOT friendship <NpcName> <hearts> [...]` precondition command. */
export type ScheduleNotFriendshipSegment = {
  kind: 'notFriendship'
  requirements: ScheduleFriendshipRequirement[]
}

/** `MAIL <mailId>` branch command (next segment runs without the flag, the one after with it). */
export type ScheduleMailSegment = {
  kind: 'mail'
  mailId: string
}

/** Verbatim fallback for segments outside the structured grammar; round-trips unchanged. */
export type ScheduleRawSegment = {
  kind: 'raw'
  text: string
}

export type ScheduleSegment =
  | SchedulePointSegment
  | ScheduleGotoSegment
  | ScheduleNotFriendshipSegment
  | ScheduleMailSegment
  | ScheduleRawSegment

export type ScheduleEntryModel = {
  segments: ScheduleSegment[]
}

/** Special location keyword that sends the NPC to their home/bed destination. */
export const SCHEDULE_BED_LOCATION = 'bed'

const TIME_TOKEN_PATTERN = /^(a?)(\d{1,4})$/u
const INTEGER_TOKEN_PATTERN = /^-?\d+$/u
const HEARTS_TOKEN_PATTERN = /^\d+$/u
const FACING_TOKEN_PATTERN = /^[0-3]$/u

type SegmentToken = {
  text: string
  quoted: boolean
}

/** Splits a script on `/` while keeping slashes inside quoted dialogue intact. */
function splitScriptSegments(script: string): string[] {
  const segments: string[] = []
  let current = ''
  let inQuotes = false

  for (const character of script) {
    if (character === '"') {
      inQuotes = !inQuotes
      current += character
      continue
    }

    if (character === '/' && !inQuotes) {
      segments.push(current)
      current = ''
      continue
    }

    current += character
  }

  segments.push(current)
  return segments
}

/** Tokenizes one segment; returns null when quoting is unbalanced. */
function tokenizeSegment(segment: string): SegmentToken[] | null {
  const tokens: SegmentToken[] = []
  let index = 0

  while (index < segment.length) {
    const character = segment[index]!

    if (/\s/u.test(character)) {
      index += 1
      continue
    }

    if (character === '"') {
      const end = segment.indexOf('"', index + 1)
      if (end === -1) {
        return null
      }
      tokens.push({ text: segment.slice(index + 1, end), quoted: true })
      index = end + 1
      continue
    }

    let cursor = index
    while (cursor < segment.length && !/\s/u.test(segment[cursor]!) && segment[cursor] !== '"') {
      cursor += 1
    }
    tokens.push({ text: segment.slice(index, cursor), quoted: false })
    index = cursor
  }

  return tokens
}

function parseGotoTokens(tokens: SegmentToken[]): ScheduleGotoSegment | null {
  if (tokens.length !== 2 || tokens[0]!.text !== 'GOTO' || tokens[1]!.quoted) {
    return null
  }
  return { kind: 'goto', target: tokens[1]!.text }
}

function parseNotFriendshipTokens(tokens: SegmentToken[]): ScheduleNotFriendshipSegment | null {
  if (tokens.length < 4 || tokens[0]!.text !== 'NOT' || tokens[1]!.text !== 'friendship') {
    return null
  }

  const pairTokens = tokens.slice(2)
  if (pairTokens.length % 2 !== 0 || pairTokens.some((token) => token.quoted)) {
    return null
  }

  const requirements: ScheduleFriendshipRequirement[] = []
  for (let index = 0; index < pairTokens.length; index += 2) {
    const heartsToken = pairTokens[index + 1]!
    if (!HEARTS_TOKEN_PATTERN.test(heartsToken.text)) {
      return null
    }
    requirements.push({ npc: pairTokens[index]!.text, hearts: Number.parseInt(heartsToken.text, 10) })
  }

  return { kind: 'notFriendship', requirements }
}

function parseMailTokens(tokens: SegmentToken[]): ScheduleMailSegment | null {
  if (tokens.length !== 2 || tokens[0]!.text !== 'MAIL' || tokens[1]!.quoted) {
    return null
  }
  return { kind: 'mail', mailId: tokens[1]!.text }
}

function parsePointTokens(tokens: SegmentToken[]): SchedulePointSegment | null {
  const first = tokens[0]
  if (!first || first.quoted) {
    return null
  }

  const timeMatch = TIME_TOKEN_PATTERN.exec(first.text)
  if (!timeMatch) {
    return null
  }

  const point: SchedulePointSegment = {
    kind: 'point',
    time: Number.parseInt(timeMatch[2]!, 10),
    arrival: timeMatch[1] === 'a',
    location: null,
    x: null,
    y: null,
    facing: null,
    animation: null,
    dialogue: null,
  }

  const rest = tokens.slice(1)
  let index = 0

  if (rest[index] && !rest[index]!.quoted && !INTEGER_TOKEN_PATTERN.test(rest[index]!.text)) {
    point.location = rest[index]!.text
    index += 1
  }

  if (rest[index] && !rest[index]!.quoted && INTEGER_TOKEN_PATTERN.test(rest[index]!.text)) {
    const yToken = rest[index + 1]
    if (!yToken || yToken.quoted || !INTEGER_TOKEN_PATTERN.test(yToken.text)) {
      return null
    }
    point.x = Number.parseInt(rest[index]!.text, 10)
    point.y = Number.parseInt(yToken.text, 10)
    index += 2

    if (rest[index] && !rest[index]!.quoted && FACING_TOKEN_PATTERN.test(rest[index]!.text)) {
      point.facing = Number.parseInt(rest[index]!.text, 10) as ScheduleFacing
      index += 1
    }

    if (rest[index] && !rest[index]!.quoted) {
      point.animation = rest[index]!.text
      index += 1
    }
  }

  if (rest[index]?.quoted) {
    point.dialogue = rest[index]!.text
    index += 1
  }

  if (index !== rest.length) {
    return null
  }

  return point
}

function parseStructuredSegment(tokens: SegmentToken[]): ScheduleSegment | null {
  return parseGotoTokens(tokens) ?? parseNotFriendshipTokens(tokens) ?? parseMailTokens(tokens) ?? parsePointTokens(tokens)
}

/**
 * Parses one slash-delimited segment. Falls back to a verbatim raw segment
 * whenever the structured interpretation would not serialize back to the exact
 * source text (unknown commands, irregular whitespace, unbalanced quotes...).
 */
export function parseScheduleSegment(text: string): ScheduleSegment {
  const tokens = tokenizeSegment(text)
  if (tokens && tokens.length > 0) {
    const structured = parseStructuredSegment(tokens)
    if (structured && serializeScheduleSegment(structured) === text) {
      return structured
    }
  }

  return { kind: 'raw', text }
}

/** Serializes one segment back to schedule-script syntax; raw segments emit verbatim. */
export function serializeScheduleSegment(segment: ScheduleSegment): string {
  switch (segment.kind) {
    case 'goto':
      return `GOTO ${segment.target}`
    case 'notFriendship':
      return `NOT friendship ${segment.requirements.map((requirement) => `${requirement.npc} ${requirement.hearts}`).join(' ')}`
    case 'mail':
      return `MAIL ${segment.mailId}`
    case 'raw':
      return segment.text
    case 'point': {
      const parts: string[] = [`${segment.arrival ? 'a' : ''}${segment.time}`]
      if (segment.location != null) {
        parts.push(segment.location)
      }
      if (segment.x != null && segment.y != null) {
        parts.push(String(segment.x), String(segment.y))
        if (segment.facing != null) {
          parts.push(String(segment.facing))
        }
        if (segment.animation != null) {
          parts.push(segment.animation)
        }
      }
      if (segment.dialogue != null) {
        parts.push(`"${segment.dialogue}"`)
      }
      return parts.join(' ')
    }
  }
}

/** Parses a full schedule entry value into an ordered segment list. */
export function parseScheduleScript(script: string): ScheduleEntryModel {
  if (script === '') {
    return { segments: [] }
  }

  return { segments: splitScriptSegments(script).map(parseScheduleSegment) }
}

/** Serializes a schedule model back into the slash-separated script string. */
export function serializeScheduleScript(model: ScheduleEntryModel): string {
  return model.segments.map(serializeScheduleSegment).join('/')
}

/**
 * Issues surfaced by the editor for the current schedule model. `error`
 * severity blocks saving (the serialized script would be malformed); `warning`
 * severity is informational.
 */
export type ScheduleModelIssue =
  | { kind: 'raw-segment'; severity: 'warning'; index: number }
  | { kind: 'time-out-of-range'; severity: 'warning'; index: number; time: number }
  | { kind: 'dialogue-quote'; severity: 'error'; index: number }
  | { kind: 'goto-target-missing'; severity: 'error'; index: number }
  | { kind: 'mail-id-missing'; severity: 'error'; index: number }
  | { kind: 'friendship-npc-missing'; severity: 'error'; index: number }

/** Earliest conventional schedule time (day start is 600; 610 is the safe minimum). */
export const SCHEDULE_MIN_TIME = 600
/** Latest conventional schedule time (2600 = 2 AM). */
export const SCHEDULE_MAX_TIME = 2600

/**
 * Collects editor warnings: verbatim raw segments, times outside the
 * conventional 600-2600 window (0 is allowed as "day start"), and dialogue
 * text that would break the quoting syntax.
 */
export function collectScheduleModelIssues(model: ScheduleEntryModel): ScheduleModelIssue[] {
  const issues: ScheduleModelIssue[] = []

  model.segments.forEach((segment, index) => {
    switch (segment.kind) {
      case 'raw':
        if (segment.text.trim() !== '') {
          issues.push({ kind: 'raw-segment', severity: 'warning', index })
        }
        return
      case 'goto':
        if (segment.target.trim() === '') {
          issues.push({ kind: 'goto-target-missing', severity: 'error', index })
        }
        return
      case 'mail':
        if (segment.mailId.trim() === '') {
          issues.push({ kind: 'mail-id-missing', severity: 'error', index })
        }
        return
      case 'notFriendship':
        if (segment.requirements.length === 0 || segment.requirements.some((requirement) => requirement.npc.trim() === '')) {
          issues.push({ kind: 'friendship-npc-missing', severity: 'error', index })
        }
        return
      case 'point':
        if (segment.time !== 0 && (segment.time < SCHEDULE_MIN_TIME || segment.time > SCHEDULE_MAX_TIME)) {
          issues.push({ kind: 'time-out-of-range', severity: 'warning', index, time: segment.time })
        }
        if (segment.dialogue != null && segment.dialogue.includes('"')) {
          issues.push({ kind: 'dialogue-quote', severity: 'error', index })
        }
    }
  })

  return issues
}

/** Splits a schedule time (e.g. 1030) into hour and minute parts. */
export function getScheduleTimeParts(time: number): { hour: number; minute: number } {
  return { hour: Math.floor(time / 100), minute: time % 100 }
}

/** Combines hour/minute parts back into schedule-time form (hour * 100 + minute). */
export function buildScheduleTime(hour: number, minute: number): number {
  return hour * 100 + minute
}

/** Hour options offered by the structured time editor (6:00 through 26:00). */
export const SCHEDULE_HOUR_OPTIONS = Array.from({ length: 21 }, (_, index) => index + 6)

/** Minute options offered by the structured time editor. */
export const SCHEDULE_MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50]

/**
 * Creates a new point one hour after the previous one (clamped to 2600),
 * reusing the previous location and coordinates as the starting position.
 */
export function createSchedulePointAfter(previous: SchedulePointSegment | null): SchedulePointSegment {
  const time = previous
    ? Math.min(
        buildScheduleTime(getScheduleTimeParts(previous.time).hour + 1, getScheduleTimeParts(previous.time).minute),
        SCHEDULE_MAX_TIME,
      )
    : 900

  return {
    kind: 'point',
    time,
    arrival: false,
    location: previous?.location ?? null,
    x: previous?.x ?? 0,
    y: previous?.y ?? 0,
    facing: 2,
    animation: null,
    dialogue: null,
  }
}

/** Returns the last point segment of a model, used to seed newly added points. */
export function findLastSchedulePoint(model: ScheduleEntryModel): SchedulePointSegment | null {
  for (let index = model.segments.length - 1; index >= 0; index -= 1) {
    const segment = model.segments[index]!
    if (segment.kind === 'point') {
      return segment
    }
  }
  return null
}

/** True when every non-empty segment of the script parses into the structured grammar. */
export function isScheduleScriptStructured(script: string): boolean {
  return parseScheduleScript(script).segments.every((segment) => segment.kind !== 'raw' || segment.text.trim() === '')
}
