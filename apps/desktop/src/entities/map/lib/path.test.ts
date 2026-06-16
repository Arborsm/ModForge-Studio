import { describe, expect, it } from 'vite-plus/test'
import { getMapDirectory, normalizePath } from './path'

describe('normalizePath', () => {
  it('converts forward slashes to backslashes', () => {
    expect(normalizePath('maps/TestMap.tmx')).toBe('maps\\TestMap.tmx')
    expect(normalizePath('a/b/c/file.xnb')).toBe('a\\b\\c\\file.xnb')
  })

  it('leaves backslashes unchanged', () => {
    expect(normalizePath('maps\\TestMap.tmx')).toBe('maps\\TestMap.tmx')
  })

  it('handles mixed slashes', () => {
    expect(normalizePath('maps/Sub\\file.xnb')).toBe('maps\\Sub\\file.xnb')
  })

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('')
  })
})

describe('getMapDirectory', () => {
  it('returns the directory portion of a source path with backslashes', () => {
    expect(getMapDirectory('maps\\Sub\\TestMap.tmx')).toBe('maps\\Sub')
  })

  it('returns the directory portion of a source path with forward slashes', () => {
    expect(getMapDirectory('maps/Sub/TestMap.tmx')).toBe('maps\\Sub')
  })

  it('returns an empty string for a root-level file', () => {
    expect(getMapDirectory('TestMap.tmx')).toBe('TestMap.tmx')
  })

  it('returns the parent for deeply nested paths', () => {
    expect(getMapDirectory('a\\b\\c\\d.xnb')).toBe('a\\b\\c')
  })

  it('handles empty string', () => {
    expect(getMapDirectory('')).toBe('')
  })
})
