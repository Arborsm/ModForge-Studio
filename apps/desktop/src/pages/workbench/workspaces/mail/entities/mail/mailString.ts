import { parseStardewI18n } from '@shared/infra/game-formats/stardew-i18n/stardewI18n'
import { type MailAttachment, parseMailAttachmentBody, serializeMailAttachment } from './attachments'

/** A `[letterbg …]` reference: a vanilla sheet index or a custom texture asset + index. */
export type MailLetterBackgroundRef = { kind: 'vanilla'; index: number } | { kind: 'custom'; assetName: string; index: number }

/**
 * Lossless segment of a Data/Mail letter string. `raw` always holds the exact source slice,
 * so `serializeMailString(parseMailString(s)) === s` for every input.
 */
export type MailStringSegment =
  | { kind: 'text'; raw: string }
  | { kind: 'item'; raw: string; attachment: MailAttachment }
  | { kind: 'action'; raw: string; action: string }
  | { kind: 'letterbg'; raw: string; background: MailLetterBackgroundRef | null }
  | { kind: 'textcolor'; raw: string; color: string }

export type ParsedMailString = {
  segments: MailStringSegment[]
  /** Collection title from the trailing `[#]<title>` suffix, or null when absent. */
  title: string | null
}

const TITLE_MARKER = '[#]'

/**
 * Shared-tokenizer nodes verified against the source string. `parseStardewI18n` emits the
 * leading and trailing whitespace of a whitespace-only text span twice (its own tests expect
 * this), so nodes are re-anchored to source offsets and such duplicates are dropped. Returns
 * null when a node unexpectedly diverges from the source, letting callers fall back losslessly.
 */
function readAnchoredNodes(value: string): Array<{ kind: 'literal' | 'text'; value: string }> | null {
  const { nodes } = parseStardewI18n(value)
  const anchored: Array<{ kind: 'literal' | 'text'; value: string }> = []
  let cursor = 0
  for (const node of nodes) {
    if (!value.startsWith(node.value, cursor)) {
      if (/^\s+$/u.test(node.value)) {
        continue
      }
      return null
    }
    anchored.push({ kind: node.kind, value: node.value })
    cursor += node.value.length
  }
  return cursor === value.length ? anchored : null
}

/**
 * Repaired token stream of a letter body for preview walkers: same nodes as the shared
 * tokenizer, with whitespace duplicates removed so spacing matches the source exactly.
 */
export function parseMailBodyTokens(value: string): Array<{ kind: 'literal' | 'text'; value: string }> {
  return readAnchoredNodes(value) ?? [{ kind: 'text', value }]
}

function parseLetterBackgroundFields(fields: string[]): MailLetterBackgroundRef | null {
  if (fields.length === 1) {
    return { kind: 'vanilla', index: 0 }
  }
  if (fields.length === 2 && /^[-+]?\d+$/u.test(fields[1] ?? '')) {
    return { kind: 'vanilla', index: Number.parseInt(fields[1]!, 10) }
  }
  if (fields.length === 3 && /^[-+]?\d+$/u.test(fields[2] ?? '')) {
    return { kind: 'custom', assetName: fields[1]!, index: Number.parseInt(fields[2]!, 10) }
  }
  return null
}

/**
 * Tokenizes a Data/Mail letter string into lossless segments plus the `[#]` collection title.
 * Delegates protocol boundaries (`%item …%%`, `[letterbg]`, `^`, `¦`, …) to the shared Stardew
 * i18n tokenizer instead of regex replacement, so unknown tokens survive untouched as text.
 */
export function parseMailString(value: string): ParsedMailString {
  const nodes = readAnchoredNodes(value)
  if (nodes === null) {
    return { segments: value ? [{ kind: 'text', raw: value }] : [], title: null }
  }
  const segments: MailStringSegment[] = []
  let title: string | null = null
  let cursor = 0

  const pushText = (raw: string) => {
    if (!raw) {
      return
    }
    const last = segments[segments.length - 1]
    if (last?.kind === 'text') {
      last.raw += raw
      return
    }
    segments.push({ kind: 'text', raw })
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    const raw = node.value
    cursor += raw.length
    if (node.kind === 'text') {
      pushText(raw)
      continue
    }
    if (raw === TITLE_MARKER) {
      title = value.slice(cursor)
      break
    }
    if (raw.startsWith('%item') && raw.endsWith('%%')) {
      segments.push({ kind: 'item', raw, attachment: parseMailAttachmentBody(raw.slice('%item'.length, raw.length - 2)) })
      continue
    }
    if (raw.startsWith('%action') && raw.endsWith('%%')) {
      segments.push({ kind: 'action', raw, action: raw.slice('%action'.length, raw.length - 2).trim() })
      continue
    }
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const fields = raw.slice(1, -1).trim().split(/\s+/u).filter(Boolean)
      if (fields[0] === 'letterbg') {
        segments.push({ kind: 'letterbg', raw, background: parseLetterBackgroundFields(fields) })
        continue
      }
      if (fields[0] === 'textcolor' && fields[1]) {
        segments.push({ kind: 'textcolor', raw, color: fields[1] })
        continue
      }
    }
    pushText(raw)
  }

  return { segments, title }
}

/** Reassembles the exact source string from lossless segments and the optional title suffix. */
export function serializeMailString(parsed: ParsedMailString): string {
  const body = parsed.segments.map((segment) => segment.raw).join('')
  return parsed.title === null ? body : `${body}${TITLE_MARKER}${parsed.title}`
}

/** Serializes a background reference into its `[letterbg …]` command form. */
export function serializeLetterBackground(background: MailLetterBackgroundRef): string {
  return background.kind === 'vanilla' ? `[letterbg ${background.index}]` : `[letterbg ${background.assetName} ${background.index}]`
}

/** Attachment inside a draft; `raw` keeps the original block until the attachment is edited. */
export type MailDraftAttachment = { raw: string | null; attachment: MailAttachment }

/**
 * Editable view of a letter. `body` holds only plain letter text (including `^`, `@`, `¦`,
 * `%secretsanta`); commands are lifted into structured fields. Serializing a draft emits the
 * canonical order `[letterbg][textcolor]body %item… %action… [#]title`, which matches every
 * vanilla letter layout; letters with text after a command are canonicalized on edit.
 */
export type MailLetterDraft = {
  background: MailLetterBackgroundRef | null
  /** Original `[letterbg …]` raw slice, kept until the user picks a different background. */
  backgroundRaw: string | null
  textColor: string | null
  body: string
  attachments: MailDraftAttachment[]
  /** Raw `%action …%%` blocks preserved verbatim. */
  actions: string[]
  title: string | null
}

/** Builds an editable draft from a letter string. */
export function mailDraftFromString(value: string): MailLetterDraft {
  const parsed = parseMailString(value)
  const draft: MailLetterDraft = {
    background: null,
    backgroundRaw: null,
    textColor: null,
    body: '',
    attachments: [],
    actions: [],
    title: parsed.title,
  }
  for (const segment of parsed.segments) {
    if (segment.kind === 'text') {
      draft.body += segment.raw
      continue
    }
    if (segment.kind === 'item') {
      draft.attachments.push({ raw: segment.raw, attachment: segment.attachment })
      continue
    }
    if (segment.kind === 'action') {
      draft.actions.push(segment.raw)
      continue
    }
    if (segment.kind === 'letterbg') {
      if (draft.backgroundRaw === null) {
        draft.background = segment.background
        draft.backgroundRaw = segment.raw
      } else {
        draft.body += segment.raw
      }
      continue
    }
    if (draft.textColor === null) {
      draft.textColor = segment.color
    } else {
      draft.body += segment.raw
    }
  }
  return draft
}

/** Serializes a draft back into a Data/Mail letter string in canonical vanilla order. */
export function mailDraftToString(draft: MailLetterDraft): string {
  const backgroundPart = draft.backgroundRaw ?? (draft.background ? serializeLetterBackground(draft.background) : '')
  const colorPart = draft.textColor ? `[textcolor ${draft.textColor}]` : ''
  const attachmentsPart = draft.attachments.map((attachment) => attachment.raw ?? serializeMailAttachment(attachment.attachment)).join('')
  const actionsPart = draft.actions.join('')
  const titlePart = draft.title === null ? '' : `${TITLE_MARKER}${draft.title}`
  return `${backgroundPart}${colorPart}${draft.body}${attachmentsPart}${actionsPart}${titlePart}`
}

/** Returns the vanilla background index of a draft, or null for custom/absent backgrounds. */
export function getVanillaBackgroundIndex(draft: MailLetterDraft): number | null {
  return draft.background?.kind === 'vanilla' ? draft.background.index : null
}
