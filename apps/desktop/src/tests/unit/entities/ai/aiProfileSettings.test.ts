import { describe, expect, it } from 'vite-plus/test'
import {
  AI_BATCH_MAX_BYTES,
  AI_CONTEXT_WINDOW_MAX,
  AI_CONTEXT_WINDOW_SAFE_DEFAULT,
  aiContextWindowInputByteBudget,
  estimateAiTokens,
  parseOptionalNumberInput,
  resolveAiContextWindow,
  validateAiGenerationParams,
  type AiGenerationParamField,
} from '@entities/ai'

function strings(values: Partial<Record<AiGenerationParamField, string>>): Record<AiGenerationParamField, string> {
  return {
    contextWindowTokens: '',
    maxOutputTokens: '',
    maxBatchBytes: '',
    temperature: '',
    topP: '',
    frequencyPenalty: '',
    presencePenalty: '',
    ...values,
  }
}

describe('generation parameter validation', () => {
  it('accepts blank fields as provider defaults', () => {
    expect(validateAiGenerationParams(strings({}))).toEqual([])
  })

  it('accepts in-range values', () => {
    expect(
      validateAiGenerationParams(
        strings({
          contextWindowTokens: '128000',
          maxOutputTokens: '4096',
          temperature: '0.7',
          topP: '0.9',
          frequencyPenalty: '0.2',
          presencePenalty: '-0.5',
        }),
      ),
    ).toEqual([])
  })

  it('rejects unparseable non-empty values', () => {
    const errors = validateAiGenerationParams(strings({ temperature: 'abc' }))
    expect(errors).toEqual([{ field: 'temperature', kind: 'invalid-number' }])
  })

  it('rejects non-positive and oversized token counts', () => {
    expect(validateAiGenerationParams(strings({ contextWindowTokens: '0' }))).toEqual([
      { field: 'contextWindowTokens', kind: 'positive-int', max: AI_CONTEXT_WINDOW_MAX },
    ])
    expect(validateAiGenerationParams(strings({ contextWindowTokens: '-5' }))).toEqual([
      { field: 'contextWindowTokens', kind: 'positive-int', max: AI_CONTEXT_WINDOW_MAX },
    ])
    expect(validateAiGenerationParams(strings({ contextWindowTokens: '1.5' }))).toEqual([
      { field: 'contextWindowTokens', kind: 'positive-int', max: AI_CONTEXT_WINDOW_MAX },
    ])
    expect(validateAiGenerationParams(strings({ maxOutputTokens: String(AI_CONTEXT_WINDOW_MAX + 1) }))).toEqual([
      { field: 'maxOutputTokens', kind: 'positive-int', max: AI_CONTEXT_WINDOW_MAX },
    ])
  })

  it('validates the per-batch byte override against the 256 KB cap', () => {
    expect(validateAiGenerationParams(strings({ maxBatchBytes: '0' }))).toEqual([
      { field: 'maxBatchBytes', kind: 'positive-int', max: AI_BATCH_MAX_BYTES },
    ])
    expect(validateAiGenerationParams(strings({ maxBatchBytes: String(AI_BATCH_MAX_BYTES + 1) }))).toEqual([
      { field: 'maxBatchBytes', kind: 'positive-int', max: AI_BATCH_MAX_BYTES },
    ])
    expect(validateAiGenerationParams(strings({ maxBatchBytes: '1.5' }))).toEqual([
      { field: 'maxBatchBytes', kind: 'positive-int', max: AI_BATCH_MAX_BYTES },
    ])
    expect(validateAiGenerationParams(strings({ maxBatchBytes: String(AI_BATCH_MAX_BYTES) }))).toEqual([])
    expect(validateAiGenerationParams(strings({ maxBatchBytes: '131072' }))).toEqual([])
  })

  it('rejects out-of-range floats', () => {
    expect(validateAiGenerationParams(strings({ temperature: '2.5' }))).toEqual([{ field: 'temperature', kind: 'range', min: 0, max: 2 }])
    expect(validateAiGenerationParams(strings({ temperature: '-0.1' }))).toEqual([{ field: 'temperature', kind: 'range', min: 0, max: 2 }])
    expect(validateAiGenerationParams(strings({ topP: '1.1' }))).toEqual([{ field: 'topP', kind: 'range', min: 0, max: 1 }])
    expect(validateAiGenerationParams(strings({ frequencyPenalty: '-2.1' }))).toEqual([
      { field: 'frequencyPenalty', kind: 'range', min: -2, max: 2 },
    ])
    expect(validateAiGenerationParams(strings({ presencePenalty: '3' }))).toEqual([
      { field: 'presencePenalty', kind: 'range', min: -2, max: 2 },
    ])
  })

  it('reports every invalid field at once', () => {
    const errors = validateAiGenerationParams(strings({ contextWindowTokens: 'nope', temperature: '9', topP: '9' }))
    expect(errors).toHaveLength(3)
    expect(errors.map((error) => error.field).sort()).toEqual(['contextWindowTokens', 'temperature', 'topP'])
  })
})

describe('context window resolution and batching budget', () => {
  it('prioritizes the explicit profile setting over metadata and the safe default', () => {
    expect(resolveAiContextWindow(128_000, 64_000)).toBe(128_000)
    expect(resolveAiContextWindow(null, 64_000)).toBe(64_000)
    expect(resolveAiContextWindow(null, null)).toBe(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
    expect(resolveAiContextWindow(undefined, undefined)).toBe(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
  })

  it('falls back to the safe default for invalid explicit values', () => {
    expect(resolveAiContextWindow(0, 64_000)).toBe(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
    expect(resolveAiContextWindow(-1, null)).toBe(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
    expect(resolveAiContextWindow(1.5, null)).toBe(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
  })

  it('clamps oversized explicit values to the documented ceiling', () => {
    expect(resolveAiContextWindow(AI_CONTEXT_WINDOW_MAX + 1, null)).toBe(AI_CONTEXT_WINDOW_MAX)
  })

  it('estimates tokens conservatively from UTF-8 bytes', () => {
    // CJK: 3 bytes per char, so ceil(12 / 2) = 6 estimated tokens vs 4 real.
    expect(estimateAiTokens(new TextEncoder().encode('你好世界').byteLength)).toBe(6)
    expect(estimateAiTokens(0)).toBe(0)
    expect(estimateAiTokens(1)).toBe(1)
  })

  it('converts the input fraction back into a byte budget', () => {
    // 16k default → 7200 input tokens → 14400 bytes (below the 256 KB hard cap).
    const budget = aiContextWindowInputByteBudget(AI_CONTEXT_WINDOW_SAFE_DEFAULT)
    expect(budget).toBe(Math.floor(AI_CONTEXT_WINDOW_SAFE_DEFAULT * 0.45) * 2)
    expect(budget).toBeLessThan(256 * 1024)
    // The budget grows with the window; it is NOT clamped here — the batching
    // builder applies the 256 KB hard cap (covered in translationBatch.test.ts).
    expect(aiContextWindowInputByteBudget(128_000)).toBeGreaterThan(budget)
  })
})

describe('optional number input parsing', () => {
  it('maps blank input to null and parses finite values', () => {
    expect(parseOptionalNumberInput('')).toBeNull()
    expect(parseOptionalNumberInput('   ')).toBeNull()
    expect(parseOptionalNumberInput('128000')).toBe(128000)
    expect(parseOptionalNumberInput('0.7')).toBeCloseTo(0.7)
    expect(parseOptionalNumberInput('-0.5')).toBeCloseTo(-0.5)
    expect(parseOptionalNumberInput('abc')).toBeNull()
  })
})
