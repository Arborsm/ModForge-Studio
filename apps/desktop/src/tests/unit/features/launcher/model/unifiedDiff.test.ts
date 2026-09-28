import { describe, expect, it } from 'vite-plus/test'
import {
  formatCompactSize,
  formatSizeDelta,
  formatTimestampMs,
  parseUnifiedDiff,
  splitForDisplay,
} from '@features/launcher/model/unifiedDiff'

const SAMPLE_DIFF = `--- config.json
+++ config.json
@@ -1 +1 @@
-{"tone":"old"}
+{"tone":"new"}
`

describe('parseUnifiedDiff', () => {
  it('classifies headers, hunks, add, remove and context lines', () => {
    const lines = parseUnifiedDiff(SAMPLE_DIFF)
    expect(lines).toEqual([
      { kind: 'header', text: '--- config.json' },
      { kind: 'header', text: '+++ config.json' },
      { kind: 'hunk', text: '@@ -1 +1 @@' },
      { kind: 'remove', text: '-{"tone":"old"}' },
      { kind: 'add', text: '+{"tone":"new"}' },
    ])
  })

  it('classifies context lines and skips empty segments', () => {
    const lines = parseUnifiedDiff(' context\n\n+added')
    expect(lines).toEqual([
      { kind: 'context', text: ' context' },
      { kind: 'add', text: '+added' },
    ])
  })

  it('returns an empty list for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  it('ignores the trailing empty segment from a final newline', () => {
    expect(parseUnifiedDiff('+a\n')).toEqual([{ kind: 'add', text: '+a' }])
  })
})

describe('splitForDisplay', () => {
  it('returns the full list when it fits within the limit', () => {
    const items = ['a', 'b', 'c']
    expect(splitForDisplay(items, 5)).toEqual({ visible: items, hiddenCount: 0 })
    expect(splitForDisplay(items, 3)).toEqual({ visible: items, hiddenCount: 0 })
  })

  it('splits overflow into visible items and a hidden count', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    expect(splitForDisplay(items, 2)).toEqual({ visible: ['a', 'b'], hiddenCount: 3 })
  })

  it('treats a zero or negative limit as showing nothing', () => {
    expect(splitForDisplay(['a'], 0)).toEqual({ visible: [], hiddenCount: 1 })
    expect(splitForDisplay(['a'], -1)).toEqual({ visible: [], hiddenCount: 1 })
  })

  it('handles an empty list', () => {
    expect(splitForDisplay([], 10)).toEqual({ visible: [], hiddenCount: 0 })
  })
})

describe('formatCompactSize', () => {
  it('formats byte-level sizes without decimals', () => {
    expect(formatCompactSize(0)).toBe('0 B')
    expect(formatCompactSize(512)).toBe('512 B')
  })

  it('formats larger sizes with binary units', () => {
    expect(formatCompactSize(1024)).toBe('1.0 KB')
    expect(formatCompactSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('formatSizeDelta', () => {
  it('renders positive, negative and zero deltas', () => {
    expect(formatSizeDelta(100, 228)).toBe('+128 B')
    expect(formatSizeDelta(228, 100)).toBe('−128 B')
    expect(formatSizeDelta(100, 100)).toBe('0 B')
  })

  it('renders unit-level deltas', () => {
    expect(formatSizeDelta(1024, 3072)).toBe('+2.0 KB')
  })

  it('treats a missing side as zero delta', () => {
    expect(formatSizeDelta(null, 100)).toBe('0 B')
    expect(formatSizeDelta(100, undefined)).toBe('0 B')
  })
})

describe('formatTimestampMs', () => {
  it('formats a timestamp for the given locale', () => {
    const formatted = formatTimestampMs(Date.UTC(2024, 0, 2, 12, 30), 'en-US')
    expect(formatted).not.toBeNull()
    const other = formatTimestampMs(Date.UTC(2024, 0, 2, 12, 31), 'en-US')
    expect(other).not.toBeNull()
    expect(formatted).not.toBe(other)
  })

  it('returns null for missing or invalid timestamps', () => {
    expect(formatTimestampMs(null, 'en-US')).toBeNull()
    expect(formatTimestampMs(undefined, 'en-US')).toBeNull()
    expect(formatTimestampMs(Number.NaN, 'en-US')).toBeNull()
  })
})
