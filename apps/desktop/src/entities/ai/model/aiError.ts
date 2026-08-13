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

/**
 * True for provider failures that are transient at the level of a single batch:
 * a timed-out or unreachable request may succeed when retried later, so a
 * multi-batch job can degrade per batch instead of failing wholesale. Deterministic
 * failures (authentication, model, rate-limit, validation, cancellation) are not
 * transient because retrying the remaining batches would repeat the same error.
 */
export function isTransientAiFailure(failure: AiFailure): boolean {
  return failure.code === 'timeout' || failure.code === 'network'
}
