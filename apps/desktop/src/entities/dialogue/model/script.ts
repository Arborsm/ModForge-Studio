/**
 * Lossless page-level AST for Stardew `Characters/Dialogue` scripts.
 *
 * Fidelity contract: every page keeps its exact raw chunk, so
 * `serializeDialogueScript(parseDialogueScript(s)) === s` for any input.
 * Structure (portrait, question block) is derived from the raw chunk; editing
 * helpers rebuild a page's raw from structure and re-parse the whole script so
 * derived state can never drift from the canonical string.
 * Pages using advanced constructs (`$c`, `$p`, `$d`, `$y`, `$t`, `$k`, `$1`,
 * `$query`, `$action`) become `kind: 'command'`: every `#`-segment is exposed as
 * a typed command or a speech segment, each keeping its exact raw text. Only
 * content no layer can parse — a malformed `$q`/`$r` block — stays `kind: 'raw'`.
 *
 * Shared by the dialogue workspace and the event workflow's `dialogue_script`
 * control, so event scripts and dialogue assets speak one AST.
 */

import { buildPortraitToken, parsePortraitToken, type DialoguePortrait } from './portrait'

export type DialogueResponse = {
  id: string
  /** Exact `$r <id> <score> <resultKey>` header segment, preserved verbatim. */
  headerRaw: string
  responseId: string
  score: string
  resultKey: string
  text: string
}

export type DialogueQuestion = {
  /** Exact `$q <ids> <fallbackKey>` header segment, preserved verbatim. */
  headerRaw: string
  ids: string
  fallbackKey: string
  prompt: string
  responses: DialogueResponse[]
}

export type DialoguePageSeparator = '#$e#' | '#$b#'

/** Segment-leading commands the game understands beyond speech and `$q`/`$r`. */
export const DIALOGUE_COMMAND_KINDS = ['c', 'p', 'd', 'y', 't', 'k', '1', 'query', 'action'] as const
export type DialogueCommandKind = (typeof DIALOGUE_COMMAND_KINDS)[number]

/** `rest` swallows the remainder of the segment, spaces included. */
export type DialogueCommandArgKind = 'number' | 'text' | 'rest'

/** Argument identity; renderers resolve the label from their own copy contract. */
export type DialogueCommandArgKey =
  | 'chance'
  | 'eventIds'
  | 'flag'
  | 'quickQuestion'
  | 'timeFrom'
  | 'timeTo'
  | 'eventId'
  | 'onceId'
  | 'gameStateQuery'
  | 'triggerAction'

export type DialogueCommandArgSpec = { key: DialogueCommandArgKey; kind: DialogueCommandArgKind }

/** Argument shape per command, driving both parsing and the structured cards. */
export const DIALOGUE_COMMAND_ARG_SPECS: Record<DialogueCommandKind, readonly DialogueCommandArgSpec[]> = {
  c: [{ key: 'chance', kind: 'number' }],
  p: [{ key: 'eventIds', kind: 'rest' }],
  d: [{ key: 'flag', kind: 'text' }],
  y: [{ key: 'quickQuestion', kind: 'rest' }],
  t: [
    { key: 'timeFrom', kind: 'number' },
    { key: 'timeTo', kind: 'number' },
  ],
  k: [{ key: 'eventId', kind: 'text' }],
  '1': [{ key: 'onceId', kind: 'text' }],
  query: [{ key: 'gameStateQuery', kind: 'rest' }],
  action: [{ key: 'triggerAction', kind: 'rest' }],
}

export type DialogueTextSegment = {
  id: string
  index: number
  kind: 'text'
  /** Exact segment text. Canonical for serialization. */
  raw: string
  text: string
  portraitRaw: string
  portrait: DialoguePortrait
}

export type DialogueCommandSegment = {
  id: string
  index: number
  kind: 'command'
  /** Exact segment text. Canonical for serialization. */
  raw: string
  command: DialogueCommandKind
  /** Positional values matching `DIALOGUE_COMMAND_ARG_SPECS[command]`. */
  args: string[]
}

export type DialogueSegment = DialogueTextSegment | DialogueCommandSegment

export type DialoguePage = {
  id: string
  index: number
  /** Separator that preceded this page in the script; null for the first page. */
  separatorBefore: DialoguePageSeparator | null
  /** Exact raw chunk between separators. Canonical for serialization. */
  raw: string
  kind: 'text' | 'question' | 'command' | 'raw'
  /** Speech text with inline protocol tokens intact. Empty for `command`/`raw` pages. */
  text: string
  /** Exact trailing portrait suffix (including leading whitespace), '' if none. */
  portraitRaw: string
  portrait: DialoguePortrait
  question: DialogueQuestion | null
  /** True when a question page carries a leading speech segment (even an empty one). */
  hasLeadingTextSegment: boolean
  /** Typed segments of a `command` page; empty for every other kind. */
  segments: DialogueSegment[]
}

export type DialogueScriptAst = {
  raw: string
  pages: DialoguePage[]
}

const PAGE_SEPARATOR_PATTERN = /#\$[eb]#/gu
const PORTRAIT_SUFFIX_PATTERN = /(\s*)(\$(?:neutral|[hsula]|\d+))$/iu
const QUESTION_HEADER_PATTERN = /^\$q(?:\s|$)/u
const RESPONSE_HEADER_PATTERN = /^\$r(?:\s|$)/u
const RESPONSE_FIELDS_PATTERN = /^\$r\s+(\S+)\s+(\S+)\s+(\S+)\s*$/u
const QUESTION_FIELDS_PATTERN = /^\$q\s+(\S+)(?:\s+(\S+))?\s*$/u
/** Segment-leading commands that take a page out of the plain speech shape. */
const ADVANCED_SEGMENT_PATTERN = /^\$(?:c|p|d|y|t|k|1|query|action)(?:\s|$)/u
const COMMAND_SEGMENT_PATTERN = /^\$(query|action|[cpdytk1])(?:\s+([\s\S]*))?$/u
const LEADING_TOKEN_PATTERN = /^(\S+)\s*([\s\S]*)$/u
/** `$q` / `$r` outside a parseable question block: nothing structured to offer. */
const UNPARSEABLE_SEGMENT_PATTERN = /^\$[qr](?:\s|$)/u

function splitPortraitSuffix(value: string): { text: string; portraitRaw: string; portrait: DialoguePortrait } {
  const match = PORTRAIT_SUFFIX_PATTERN.exec(value)
  if (!match) {
    return { text: value, portraitRaw: '', portrait: { kind: 'none' } }
  }

  const whitespace = match[1] ?? ''
  const token = match[2] ?? ''
  return {
    text: value.slice(0, value.length - whitespace.length - token.length),
    portraitRaw: `${whitespace}${token}`,
    portrait: parsePortraitToken(token),
  }
}

function tryParseQuestion(segments: string[]): { question: DialogueQuestion; speechRaw: string | null } | null {
  const questionIndex = segments.findIndex((segment) => QUESTION_HEADER_PATTERN.test(segment))
  if (questionIndex < 0 || questionIndex > 1) {
    return null
  }

  const headerRaw = segments[questionIndex] ?? ''
  const prompt = segments[questionIndex + 1]
  if (prompt == null || RESPONSE_HEADER_PATTERN.test(prompt)) {
    return null
  }

  const responses: DialogueResponse[] = []
  for (let cursor = questionIndex + 2; cursor < segments.length; cursor += 2) {
    const responseHeader = segments[cursor] ?? ''
    const responseText = segments[cursor + 1]
    if (!RESPONSE_HEADER_PATTERN.test(responseHeader) || responseText == null) {
      return null
    }

    const fields = RESPONSE_FIELDS_PATTERN.exec(responseHeader)
    responses.push({
      id: `response:${responses.length}`,
      headerRaw: responseHeader,
      responseId: fields?.[1] ?? '',
      score: fields?.[2] ?? '',
      resultKey: fields?.[3] ?? '',
      text: responseText,
    })
  }

  if (responses.length === 0) {
    return null
  }

  const headerFields = QUESTION_FIELDS_PATTERN.exec(headerRaw)
  return {
    question: {
      headerRaw,
      ids: headerFields?.[1] ?? '',
      fallbackKey: headerFields?.[2] ?? '',
      prompt,
      responses,
    },
    speechRaw: questionIndex === 1 ? (segments[0] ?? '') : null,
  }
}

/** Splits a command's argument tail into the positional values its spec declares. */
function parseCommandArgs(command: DialogueCommandKind, argsRaw: string): string[] {
  const args: string[] = []
  let remainder = argsRaw.trim()

  for (const spec of DIALOGUE_COMMAND_ARG_SPECS[command]) {
    if (spec.kind === 'rest') {
      args.push(remainder)
      remainder = ''
      continue
    }
    const match = LEADING_TOKEN_PATTERN.exec(remainder)
    args.push(match?.[1] ?? '')
    remainder = match?.[2] ?? ''
  }

  return args
}

/** Rebuilds a command segment; trailing empty arguments are dropped, not padded. */
export function buildCommandSegmentRaw(command: DialogueCommandKind, args: readonly string[]): string {
  const values = args.map((value) => value.trim())
  while (values.length > 0 && values[values.length - 1] === '') {
    values.pop()
  }
  return [`$${command}`, ...values].join(' ')
}

function parseSegment(raw: string, index: number): DialogueSegment {
  const commandMatch = COMMAND_SEGMENT_PATTERN.exec(raw)
  if (commandMatch) {
    const command = commandMatch[1] as DialogueCommandKind
    return { id: `segment:${index}`, index, kind: 'command', raw, command, args: parseCommandArgs(command, commandMatch[2] ?? '') }
  }
  const { text, portraitRaw, portrait } = splitPortraitSuffix(raw)
  return { id: `segment:${index}`, index, kind: 'text', raw, text, portraitRaw, portrait }
}

function parsePageChunk(raw: string, index: number, separatorBefore: DialoguePageSeparator | null): DialoguePage {
  const base = {
    id: `page:${index}`,
    index,
    separatorBefore,
    raw,
    segments: [] as DialogueSegment[],
  }
  const segments = raw.split('#')
  const hasAdvancedSegment = segments.some((segment) => ADVANCED_SEGMENT_PATTERN.test(segment))

  if (!hasAdvancedSegment && segments.length === 1) {
    const { text, portraitRaw, portrait } = splitPortraitSuffix(raw)
    return { ...base, kind: 'text', text, portraitRaw, portrait, question: null, hasLeadingTextSegment: true }
  }

  const parsedQuestion = hasAdvancedSegment ? null : tryParseQuestion(segments)
  if (parsedQuestion) {
    const speechRaw = parsedQuestion.speechRaw
    const { text, portraitRaw, portrait } = splitPortraitSuffix(speechRaw ?? '')
    return {
      ...base,
      kind: 'question',
      text,
      portraitRaw,
      portrait,
      question: parsedQuestion.question,
      hasLeadingTextSegment: speechRaw != null,
    }
  }

  if (hasAdvancedSegment && !segments.some((segment) => UNPARSEABLE_SEGMENT_PATTERN.test(segment))) {
    return {
      ...base,
      kind: 'command',
      text: '',
      portraitRaw: '',
      portrait: { kind: 'none' },
      question: null,
      hasLeadingTextSegment: false,
      segments: segments.map(parseSegment),
    }
  }

  return { ...base, kind: 'raw', text: '', portraitRaw: '', portrait: { kind: 'none' }, question: null, hasLeadingTextSegment: false }
}

/** Parses a dialogue script into pages split on `#$e#` / `#$b#` separators. */
export function parseDialogueScript(raw: string): DialogueScriptAst {
  const pages: DialoguePage[] = []
  let separatorBefore: DialoguePageSeparator | null = null
  let chunkStart = 0

  PAGE_SEPARATOR_PATTERN.lastIndex = 0
  for (const match of raw.matchAll(PAGE_SEPARATOR_PATTERN)) {
    const matchIndex = match.index ?? 0
    pages.push(parsePageChunk(raw.slice(chunkStart, matchIndex), pages.length, separatorBefore))
    separatorBefore = match[0] as DialoguePageSeparator
    chunkStart = matchIndex + match[0].length
  }
  pages.push(parsePageChunk(raw.slice(chunkStart), pages.length, separatorBefore))

  return { raw, pages }
}

/** Rebuilds the exact script string from the parsed pages. */
export function serializeDialogueScript(ast: DialogueScriptAst): string {
  return ast.pages.map((page) => `${page.separatorBefore ?? ''}${page.raw}`).join('')
}

function buildQuestionSegments(page: DialoguePage): string[] {
  const question = page.question
  if (!question) {
    return [`${page.text}${page.portraitRaw}`]
  }

  const segments: string[] = []
  if (page.hasLeadingTextSegment) {
    segments.push(`${page.text}${page.portraitRaw}`)
  }
  segments.push(question.headerRaw, question.prompt)
  for (const response of question.responses) {
    segments.push(response.headerRaw, response.text)
  }
  return segments
}

/** Rebuilds one page's raw chunk from its structured fields. */
export function buildPageRaw(page: DialoguePage): string {
  if (page.kind === 'raw') {
    return page.raw
  }
  if (page.kind === 'command') {
    return page.segments.map((segment) => segment.raw).join('#')
  }
  if (page.kind === 'question') {
    return buildQuestionSegments(page).join('#')
  }
  return `${page.text}${page.portraitRaw}`
}

function replacePage(ast: DialogueScriptAst, pageId: string, mutate: (page: DialoguePage) => DialoguePage): string {
  const pages = ast.pages.map((page) => (page.id === pageId ? mutate(page) : page))
  return pages.map((page, index) => `${index > 0 ? (page.separatorBefore ?? '#$e#') : ''}${buildPageRaw(page)}`).join('')
}

/** Replaces a page's speech text (or raw content for `raw` pages) and returns the new script. */
export function setPageText(ast: DialogueScriptAst, pageId: string, text: string): string {
  return replacePage(ast, pageId, (page) => (page.kind === 'raw' ? { ...page, raw: text } : { ...page, text }))
}

/** Replaces a page's portrait command with the canonical token for the choice. */
export function setPagePortrait(ast: DialogueScriptAst, pageId: string, portrait: DialoguePortrait): string {
  return replacePage(ast, pageId, (page) => ({ ...page, portrait, portraitRaw: buildPortraitToken(portrait) }))
}

function replaceSegment(
  ast: DialogueScriptAst,
  pageId: string,
  segmentId: string,
  mutate: (segment: DialogueSegment) => DialogueSegment,
): string {
  return replacePage(ast, pageId, (page) =>
    page.kind === 'command'
      ? { ...page, segments: page.segments.map((segment) => (segment.id === segmentId ? mutate(segment) : segment)) }
      : page,
  )
}

/** Rewrites one command segment's positional arguments on a `command` page. */
export function updateCommandSegment(ast: DialogueScriptAst, pageId: string, segmentId: string, args: readonly string[]): string {
  return replaceSegment(ast, pageId, segmentId, (segment) =>
    segment.kind === 'command' ? { ...segment, args: [...args], raw: buildCommandSegmentRaw(segment.command, args) } : segment,
  )
}

/** Rewrites one speech segment's text on a `command` page, keeping its portrait token. */
export function setSegmentText(ast: DialogueScriptAst, pageId: string, segmentId: string, text: string): string {
  return replaceSegment(ast, pageId, segmentId, (segment) =>
    segment.kind === 'text' ? { ...segment, text, raw: `${text}${segment.portraitRaw}` } : segment,
  )
}

/** Rewrites one speech segment's portrait on a `command` page. */
export function setSegmentPortrait(ast: DialogueScriptAst, pageId: string, segmentId: string, portrait: DialoguePortrait): string {
  return replaceSegment(ast, pageId, segmentId, (segment) => {
    if (segment.kind !== 'text') {
      return segment
    }
    const portraitRaw = buildPortraitToken(portrait)
    return { ...segment, portrait, portraitRaw, raw: `${segment.text}${portraitRaw}` }
  })
}

function buildResponseHeader(responseId: string, score: string, resultKey: string): string {
  return `$r ${responseId.trim() || '-1'} ${score.trim() || '0'} ${resultKey.trim() || '-1'}`
}

function buildQuestionHeader(ids: string, fallbackKey: string): string {
  return `$q ${ids.trim() || '-1'} ${fallbackKey.trim() || '-1'}`
}

/** Attaches an empty question block (one placeholder response) to a text page. */
export function attachQuestion(ast: DialogueScriptAst, pageId: string): string {
  return replacePage(ast, pageId, (page) => {
    if (page.kind !== 'text' || page.question) {
      return page
    }
    return {
      ...page,
      kind: 'question',
      hasLeadingTextSegment: true,
      question: {
        headerRaw: buildQuestionHeader('', ''),
        ids: '-1',
        fallbackKey: '-1',
        prompt: '',
        responses: [
          { id: 'response:0', headerRaw: buildResponseHeader('', '', ''), responseId: '-1', score: '0', resultKey: '-1', text: '' },
        ],
      },
    }
  })
}

/** Removes a page's question block, keeping the speech text. */
export function removeQuestion(ast: DialogueScriptAst, pageId: string): string {
  return replacePage(ast, pageId, (page) =>
    page.kind === 'question' ? { ...page, kind: 'text', question: null, hasLeadingTextSegment: true } : page,
  )
}

/** Updates the `$q` ids / fallback key / prompt fields, regenerating the header. */
export function updateQuestionFields(
  ast: DialogueScriptAst,
  pageId: string,
  fields: Partial<Pick<DialogueQuestion, 'ids' | 'fallbackKey' | 'prompt'>>,
): string {
  return replacePage(ast, pageId, (page) => {
    if (!page.question) {
      return page
    }
    const ids = fields.ids ?? page.question.ids
    const fallbackKey = fields.fallbackKey ?? page.question.fallbackKey
    return {
      ...page,
      question: {
        ...page.question,
        ids,
        fallbackKey,
        prompt: fields.prompt ?? page.question.prompt,
        headerRaw: buildQuestionHeader(ids, fallbackKey),
      },
    }
  })
}

/** Appends a placeholder response to a question page. */
export function addQuestionResponse(ast: DialogueScriptAst, pageId: string): string {
  return replacePage(ast, pageId, (page) => {
    if (!page.question) {
      return page
    }
    const responses = [
      ...page.question.responses,
      {
        id: `response:${page.question.responses.length}`,
        headerRaw: buildResponseHeader('', '', ''),
        responseId: '-1',
        score: '0',
        resultKey: '-1',
        text: '',
      },
    ]
    return { ...page, question: { ...page.question, responses } }
  })
}

/** Removes one response; removing the last response removes the whole question. */
export function removeQuestionResponse(ast: DialogueScriptAst, pageId: string, responseId: string): string {
  const page = ast.pages.find((candidate) => candidate.id === pageId)
  if (page?.question && page.question.responses.length <= 1) {
    return removeQuestion(ast, pageId)
  }
  return replacePage(ast, pageId, (candidate) => {
    if (!candidate.question) {
      return candidate
    }
    return {
      ...candidate,
      question: { ...candidate.question, responses: candidate.question.responses.filter((response) => response.id !== responseId) },
    }
  })
}

/** Updates one response's fields, regenerating its `$r` header. */
export function updateQuestionResponse(
  ast: DialogueScriptAst,
  pageId: string,
  responseId: string,
  fields: Partial<Pick<DialogueResponse, 'responseId' | 'score' | 'resultKey' | 'text'>>,
): string {
  return replacePage(ast, pageId, (page) => {
    if (!page.question) {
      return page
    }
    const responses = page.question.responses.map((response) => {
      if (response.id !== responseId) {
        return response
      }
      const next = { ...response, ...fields }
      return { ...next, headerRaw: buildResponseHeader(next.responseId, next.score, next.resultKey) }
    })
    return { ...page, question: { ...page.question, responses } }
  })
}

/** Inserts an empty page after `afterPageId` (or at the start when null). */
export function insertPageAfter(ast: DialogueScriptAst, afterPageId: string | null, separator: DialoguePageSeparator): string {
  const parts: string[] = []
  if (afterPageId === null) {
    parts.push('', separator)
  }
  for (const page of ast.pages) {
    parts.push(`${page.separatorBefore ?? ''}${page.raw}`)
    if (page.id === afterPageId) {
      parts.push(separator)
    }
  }
  return parts.join('')
}

/** Removes a page (and its leading separator); the last remaining page is cleared instead. */
export function removePage(ast: DialogueScriptAst, pageId: string): string {
  if (ast.pages.length <= 1) {
    return ''
  }

  const parts: string[] = []
  for (const page of ast.pages) {
    if (page.id === pageId) {
      continue
    }
    // Whichever page ends up first loses its leading separator.
    const isNewFirst = parts.length === 0
    parts.push(`${isNewFirst ? '' : (page.separatorBefore ?? '#$e#')}${page.raw}`)
  }
  return parts.join('')
}

/** Toggles the separator kind (`$e` / `$b`) that introduces a page. */
export function setPageSeparator(ast: DialogueScriptAst, pageId: string, separator: DialoguePageSeparator): string {
  return ast.pages
    .map((page) => {
      if (page.index === 0) {
        return page.raw
      }
      const nextSeparator = page.id === pageId ? separator : (page.separatorBefore ?? '#$e#')
      return `${nextSeparator}${page.raw}`
    })
    .join('')
}
