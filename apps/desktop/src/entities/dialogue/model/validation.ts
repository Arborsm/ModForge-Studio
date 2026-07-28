import { parseDialogueScript } from './script'

export type DialogueScriptWarningCode =
  | 'unknown-command'
  | 'unterminated-question'
  | 'orphan-response'
  | 'malformed-response'
  | 'empty-page'
  | 'unbalanced-gender-switch'

export type DialogueScriptWarning = {
  code: DialogueScriptWarningCode
  /** Zero-based page index the warning belongs to. */
  pageIndex: number
  /** Offending token or segment, for message interpolation. */
  detail: string
}

/** Commands understood by the vanilla dialogue parser at segment start. */
const KNOWN_SEGMENT_COMMANDS = new Set(['e', 'b', 'k', 'c', 't', 'q', 'r', 'p', 'd', 'y', 'v', 'query', 'action'])
const KNOWN_EMOTIONS = new Set(['h', 's', 'u', 'l', 'a', 'neutral'])
const SEGMENT_COMMAND_PATTERN = /^\$([A-Za-z]+|\d+)(?:\s|$)/u
const RESPONSE_HEADER_PATTERN = /^\$r(?:\s|$)/u
const RESPONSE_FIELDS_PATTERN = /^\$r\s+\S+\s+\S+\s+\S+\s*$/u
const QUESTION_HEADER_PATTERN = /^\$q(?:\s|$)/u

function countOccurrences(value: string, token: string): number {
  let count = 0
  let cursor = value.indexOf(token)
  while (cursor >= 0) {
    count += 1
    cursor = value.indexOf(token, cursor + token.length)
  }
  return count
}

function collectSegmentWarnings(segments: string[], pageIndex: number, warnings: DialogueScriptWarning[]) {
  let sawQuestion = false

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? ''
    const commandMatch = SEGMENT_COMMAND_PATTERN.exec(segment)
    if (commandMatch) {
      const command = (commandMatch[1] ?? '').toLowerCase()
      const isKnown = KNOWN_SEGMENT_COMMANDS.has(command) || KNOWN_EMOTIONS.has(command) || /^\d+$/u.test(command)
      if (!isKnown) {
        warnings.push({ code: 'unknown-command', pageIndex, detail: `$${commandMatch[1] ?? ''}` })
      }
    }

    if (QUESTION_HEADER_PATTERN.test(segment)) {
      sawQuestion = true
      const prompt = segments[index + 1]
      const firstResponse = segments[index + 2]
      if (prompt == null || firstResponse == null || !RESPONSE_HEADER_PATTERN.test(firstResponse)) {
        warnings.push({ code: 'unterminated-question', pageIndex, detail: segment })
      }
      continue
    }

    if (RESPONSE_HEADER_PATTERN.test(segment)) {
      if (!sawQuestion) {
        warnings.push({ code: 'orphan-response', pageIndex, detail: segment })
      }
      if (!RESPONSE_FIELDS_PATTERN.test(segment)) {
        warnings.push({ code: 'malformed-response', pageIndex, detail: segment })
      }
      if (segments[index + 1] == null) {
        warnings.push({ code: 'unterminated-question', pageIndex, detail: segment })
      }
    }
  }
}

/**
 * Surfaces non-blocking authoring warnings for a dialogue script.
 * Unknown `$` tokens are warnings (they may be literal text), never errors.
 */
export function validateDialogueScript(script: string): DialogueScriptWarning[] {
  const warnings: DialogueScriptWarning[] = []
  const ast = parseDialogueScript(script)

  for (const page of ast.pages) {
    if (!page.raw.trim() && ast.pages.length > 1) {
      warnings.push({ code: 'empty-page', pageIndex: page.index, detail: '' })
      continue
    }

    if (countOccurrences(page.raw, '${') !== countOccurrences(page.raw, '}$')) {
      warnings.push({ code: 'unbalanced-gender-switch', pageIndex: page.index, detail: '${...}$' })
    }

    collectSegmentWarnings(page.raw.split('#'), page.index, warnings)
  }

  return warnings
}
