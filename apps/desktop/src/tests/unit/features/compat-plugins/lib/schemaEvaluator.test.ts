import { describe, expect, test } from 'vite-plus/test'
import {
  defaultFieldValue,
  evaluateVisibleWhen,
  fillDefaults,
  validateField,
  validateFields,
} from '@features/compat-plugins/lib/schemaEvaluator'
import type { CompatPluginField } from '@features/compat-plugins'

function field(overrides: Partial<CompatPluginField> = {}): CompatPluginField {
  return {
    id: 'f',
    path: 'F',
    type: 'text',
    ...overrides,
  }
}

describe('evaluateVisibleWhen', () => {
  test('returns true when condition is undefined', () => {
    expect(evaluateVisibleWhen(undefined, {})).toBe(true)
  })

  test('field-eq matches value', () => {
    expect(evaluateVisibleWhen({ kind: 'field-eq', field: 'Type', value: 'Crop' }, { Type: 'Crop' })).toBe(true)
    expect(evaluateVisibleWhen({ kind: 'field-eq', field: 'Type', value: 'Crop' }, { Type: 'Building' })).toBe(false)
  })

  test('field-in matches any value in list', () => {
    expect(evaluateVisibleWhen({ kind: 'field-in', field: 'Type', values: ['Crop', 'FruitTree'] }, { Type: 'Crop' })).toBe(true)
    expect(evaluateVisibleWhen({ kind: 'field-in', field: 'Type', values: ['Crop', 'FruitTree'] }, { Type: 'Grass' })).toBe(false)
  })
})

describe('validateField', () => {
  test('required field rejects empty value', () => {
    const errors = validateField(field({ required: true }), '')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('at.field.required')
  })

  test('required field accepts non-empty value', () => {
    const errors = validateField(field({ required: true }), 'hello')
    expect(errors).toHaveLength(0)
  })

  test('number field rejects non-number', () => {
    const errors = validateField(field({ type: 'number' }), 'abc')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('at.field.invalid')
  })

  test('number field rejects below min', () => {
    const errors = validateField(field({ type: 'number', min: 10 }), 5)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('at.field.outOfRange')
  })

  test('number field rejects above max', () => {
    const errors = validateField(field({ type: 'number', max: 100 }), 200)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('at.field.outOfRange')
  })

  test('number field accepts within range', () => {
    const errors = validateField(field({ type: 'number', min: 10, max: 100 }), 50)
    expect(errors).toHaveLength(0)
  })

  test('choice field rejects value not in allowValues', () => {
    const errors = validateField(field({ type: 'choice', allowValues: ['A', 'B'] }), 'C')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('at.field.invalid')
  })

  test('choice field accepts value in allowValues', () => {
    const errors = validateField(field({ type: 'choice', allowValues: ['A', 'B'] }), 'A')
    expect(errors).toHaveLength(0)
  })

  test('string-list field rejects non-array', () => {
    const errors = validateField(field({ type: 'string-list' }), 'not-array')
    expect(errors).toHaveLength(1)
  })

  test('string-list field accepts array', () => {
    const errors = validateField(field({ type: 'string-list' }), ['spring', 'summer'])
    expect(errors).toHaveLength(0)
  })

  test('bool field rejects non-boolean', () => {
    const errors = validateField(field({ type: 'bool' }), 'true')
    expect(errors).toHaveLength(1)
  })

  test('optional field accepts empty value', () => {
    const errors = validateField(field({ required: false }), '')
    expect(errors).toHaveLength(0)
  })
})

describe('validateFields', () => {
  test('validates only visible fields', () => {
    const fields = [
      field({ id: 'a', path: 'A', type: 'number', required: true, visibleWhen: { kind: 'field-eq', field: 'Show', value: true } }),
      field({ id: 'b', path: 'B', type: 'number', required: true }),
    ]
    // Show=false, so field 'a' is hidden and should not be validated
    const errors = validateFields(fields, { Show: false, B: 42 })
    expect(errors).toHaveLength(0)
  })

  test('validates visible required fields', () => {
    const fields = [
      field({ id: 'a', path: 'A', type: 'number', required: true, visibleWhen: { kind: 'field-eq', field: 'Show', value: true } }),
      field({ id: 'b', path: 'B', type: 'number', required: true }),
    ]
    const errors = validateFields(fields, { Show: true, B: 42 })
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldId).toBe('a')
  })
})

describe('defaultFieldValue', () => {
  test('bool defaults to false', () => {
    expect(defaultFieldValue(field({ type: 'bool' }))).toBe(false)
  })

  test('number defaults to min if set', () => {
    expect(defaultFieldValue(field({ type: 'number', min: 10 }))).toBe(10)
  })

  test('number defaults to 0 if no min', () => {
    expect(defaultFieldValue(field({ type: 'number' }))).toBe(0)
  })

  test('choice defaults to first allowValue', () => {
    expect(defaultFieldValue(field({ type: 'choice', allowValues: ['A', 'B'] }))).toBe('A')
  })

  test('string-list defaults to empty array', () => {
    expect(defaultFieldValue(field({ type: 'string-list' }))).toEqual([])
  })

  test('record-list defaults to empty array', () => {
    expect(defaultFieldValue(field({ type: 'record-list' }))).toEqual([])
  })

  test('object defaults to empty object', () => {
    expect(defaultFieldValue(field({ type: 'object' }))).toEqual({})
  })
})

describe('fillDefaults', () => {
  test('fills missing fields with defaults', () => {
    const fields = [field({ id: 'a', path: 'A', type: 'number', min: 10 }), field({ id: 'b', path: 'B', type: 'text' })]
    const result = fillDefaults(fields, { A: 20 })
    expect(result.A).toBe(20)
    expect(result.B).toBe('')
  })

  test('does not overwrite existing values', () => {
    const fields = [field({ id: 'a', path: 'A', type: 'text' })]
    const result = fillDefaults(fields, { A: 'existing' })
    expect(result.A).toBe('existing')
  })
})
