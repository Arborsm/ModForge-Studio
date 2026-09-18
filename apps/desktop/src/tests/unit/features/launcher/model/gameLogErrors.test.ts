import { describe, expect, it } from 'vite-plus/test'
import { diffLauncherLogPage, parseSmapiLogErrors, truncateLogExcerpt } from '@features/launcher/model/gameLogErrors'

describe('parseSmapiLogErrors', () => {
  it('parses SMAPI console ERROR lines with a source token', () => {
    const errors = parseSmapiLogErrors([
      '[06:30:15 INFO  SMAPI] Loading mods...',
      '[06:30:16 ERROR  Some.Mod] Something went wrong',
      '[06:30:17 TRACE  Game] ignored',
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual({
      raw: '[06:30:16 ERROR  Some.Mod] Something went wrong',
      source: 'Some.Mod',
      message: 'Something went wrong',
    })
  })

  it('keeps ERROR lines without a source token', () => {
    const errors = parseSmapiLogErrors(['[06:30:16 ERROR ] Bare failure'])
    expect(errors).toHaveLength(1)
    expect(errors[0].source).toBeNull()
    expect(errors[0].message).toBe('Bare failure')
  })

  it('drops non-SMAPI lines and malformed brackets', () => {
    const errors = parseSmapiLogErrors([
      'ERROR not bracketed',
      '[06:30:16 WARN  Some.Mod] a warning',
      '[]',
      '[not-a-time ERROR Some.Mod] bad time',
    ])
    expect(errors).toHaveLength(0)
  })

  it('handles two-digit hours and single-space separators', () => {
    const errors = parseSmapiLogErrors(['[16:05:07 ERROR FarmTypeManager] No object found'])
    expect(errors).toHaveLength(1)
    expect(errors[0].source).toBe('FarmTypeManager')
  })
})

describe('diffLauncherLogPage', () => {
  const page = { lines: ['a', 'b', 'c', 'd'], totalLines: 10 }

  it('seeds the cursor without reporting on the first run', () => {
    expect(diffLauncherLogPage(null, page)).toEqual({ newLines: [], nextCursor: 10 })
  })

  it('returns the tail slice when fewer new lines than the page size exist', () => {
    expect(diffLauncherLogPage(8, page)).toEqual({ newLines: ['c', 'd'], nextCursor: 10 })
  })

  it('returns the whole page when the new portion covers it', () => {
    expect(diffLauncherLogPage(6, { lines: ['a', 'b', 'c', 'd'], totalLines: 10 })).toEqual({
      newLines: ['a', 'b', 'c', 'd'],
      nextCursor: 10,
    })
  })

  it('reports nothing when the total did not advance', () => {
    expect(diffLauncherLogPage(10, page)).toEqual({ newLines: [], nextCursor: 10 })
  })

  it('reseeds without reporting when the log rotated below the cursor', () => {
    expect(diffLauncherLogPage(10, { lines: ['x'], totalLines: 3 })).toEqual({ newLines: [], nextCursor: 10 })
  })
})

describe('truncateLogExcerpt', () => {
  it('returns short text unchanged', () => {
    expect(truncateLogExcerpt('short', 100)).toBe('short')
  })

  it('cuts whole lines and marks the cut', () => {
    const text = Array.from({ length: 50 }, (_, index) => `line ${index} ${'x'.repeat(20)}`).join('\n')
    const excerpt = truncateLogExcerpt(text, 256)
    expect(excerpt.endsWith('\n… [truncated]')).toBe(true)
    expect(excerpt.length).toBeLessThan(300)
  })

  it('keeps at least the first line even without a newline', () => {
    const text = 'x'.repeat(1000)
    const excerpt = truncateLogExcerpt(text, 256)
    expect(excerpt.startsWith('x'.repeat(256))).toBe(true)
    expect(excerpt.endsWith('… [truncated]')).toBe(true)
  })
})
