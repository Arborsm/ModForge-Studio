import type { AiErrorCode } from '@shared/contracts'

const AI_ERROR_PATTERN = /AI_ERROR::([a-z-]+)::([\s\S]*)/
const AI_ERROR_CODES = new Set<AiErrorCode>([
  'not-configured',
  'authentication',
  'model',
  'rate-limit',
  'timeout',
  'network',
  'cache',
  'invalid-response',
  'placeholder-mismatch',
  'cancelled',
  'unknown',
])

export type AiFailure = {
  code: AiErrorCode
  detail: string
}

/** Parses the stable AI command error envelope while preserving diagnostic detail for inline UI. */
export function parseAiFailure(cause: unknown): AiFailure {
  const message = cause instanceof Error ? cause.message : String(cause)
  const match = message.match(AI_ERROR_PATTERN)
  if (!match) {
    return { code: 'unknown', detail: message }
  }
  const code = match[1] as AiErrorCode
  if (!code || !AI_ERROR_CODES.has(code)) {
    return { code: 'unknown', detail: message }
  }
  return { code, detail: match[2].trim() }
}
