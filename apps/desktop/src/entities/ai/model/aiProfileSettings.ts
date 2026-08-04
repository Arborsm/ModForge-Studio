/** Safe context-window fallback (tokens) used when a profile sets no explicit
 * value and no model metadata is available. Chosen so the default batch byte
 * budget stays close to the legacy 24 KB cap while remaining safe for the
 * 16k-context models common among local and budget providers. */
export const AI_CONTEXT_WINDOW_SAFE_DEFAULT = 16_000
/** Upper bound for an explicit context window override. */
export const AI_CONTEXT_WINDOW_MAX = 10_000_000
/** Upper bound for an explicit max-output-token override. */
export const AI_MAX_OUTPUT_TOKENS_MAX = 10_000_000
/** Backend hard cap for a single translation batch (bytes). */
export const AI_BATCH_MAX_BYTES = 256 * 1024
/** Backend hard cap for a single translation item (bytes). */
export const AI_BATCH_MAX_ITEM_BYTES = 32 * 1024
/** Fraction of the context window reserved for batch input; the rest covers
 * the system prompt, the JSON schema, and the generated output. */
export const AI_CONTEXT_WINDOW_INPUT_FRACTION = 0.45
/** Conservative token estimator: one token per two UTF-8 bytes overestimates
 * both CJK (~3 bytes/token) and Latin (~4 bytes/token) text, so batches never
 * exceed the real context window even for dense CJK input. */
const BYTES_PER_ESTIMATED_TOKEN = 2

export type AiGenerationParamField =
  | 'contextWindowTokens'
  | 'maxOutputTokens'
  | 'maxBatchBytes'
  | 'temperature'
  | 'topP'
  | 'frequencyPenalty'
  | 'presencePenalty'

export type AiGenerationParamError =
  | { field: AiGenerationParamField; kind: 'invalid-number' }
  | { field: AiGenerationParamField; kind: 'positive-int'; max: number }
  | { field: AiGenerationParamField; kind: 'range'; min: number; max: number }

/** Parses a number input; blank or unparseable input becomes `null` (inherit provider default). */
export function parseOptionalNumberInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Validates raw generation-parameter inputs. Empty strings (provider default)
 * always pass; non-empty values must parse and fall within their documented
 * range. Returns a field-level error list; the UI maps each error to locale
 * copy.
 */
export function validateAiGenerationParams(input: Record<AiGenerationParamField, string>): AiGenerationParamError[] {
  const errors: AiGenerationParamError[] = []
  for (const field of Object.keys(input) as AiGenerationParamField[]) {
    const raw = input[field].trim()
    if (!raw) continue
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      errors.push({ field, kind: 'invalid-number' })
      continue
    }
    switch (field) {
      case 'contextWindowTokens':
      case 'maxOutputTokens':
      case 'maxBatchBytes': {
        const max =
          field === 'contextWindowTokens'
            ? AI_CONTEXT_WINDOW_MAX
            : field === 'maxOutputTokens'
              ? AI_MAX_OUTPUT_TOKENS_MAX
              : AI_BATCH_MAX_BYTES
        if (!Number.isInteger(parsed) || parsed <= 0) {
          errors.push({ field, kind: 'positive-int', max })
        } else if (parsed > max) {
          errors.push({ field, kind: 'positive-int', max })
        }
        break
      }
      case 'temperature':
        if (parsed < 0 || parsed > 2) errors.push({ field, kind: 'range', min: 0, max: 2 })
        break
      case 'topP':
        if (parsed < 0 || parsed > 1) errors.push({ field, kind: 'range', min: 0, max: 1 })
        break
      case 'frequencyPenalty':
      case 'presencePenalty':
        if (parsed < -2 || parsed > 2) errors.push({ field, kind: 'range', min: -2, max: 2 })
        break
    }
  }
  return errors
}

/**
 * Resolves the effective context window with the documented priority:
 * explicit profile setting > model metadata > safe default.
 */
export function resolveAiContextWindow(explicit: number | null | undefined, metadata: number | null | undefined): number {
  const value = explicit ?? metadata ?? AI_CONTEXT_WINDOW_SAFE_DEFAULT
  if (!Number.isInteger(value) || value <= 0) return AI_CONTEXT_WINDOW_SAFE_DEFAULT
  return Math.min(value, AI_CONTEXT_WINDOW_MAX)
}

/** Estimates the token count of a UTF-8 string using the conservative 2-bytes-per-token bound. */
export function estimateAiTokens(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_ESTIMATED_TOKEN)
}

/**
 * Computes the per-batch input byte budget for a context window: the input
 * fraction converted back through the token estimator. Callers still clamp the
 * result with the backend's 256 KB hard cap.
 */
export function aiContextWindowInputByteBudget(contextWindowTokens: number): number {
  const inputTokens = Math.floor(contextWindowTokens * AI_CONTEXT_WINDOW_INPUT_FRACTION)
  return Math.max(0, inputTokens * BYTES_PER_ESTIMATED_TOKEN)
}
