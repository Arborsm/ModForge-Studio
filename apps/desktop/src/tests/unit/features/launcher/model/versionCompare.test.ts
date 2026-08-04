import { describe, expect, it } from 'vite-plus/test'
import { isUpdateAvailable, normalizeVersionForCompare } from '@features/launcher/model/versionCompare'

describe('normalizeVersionForCompare', () => {
  it('trims whitespace', () => {
    expect(normalizeVersionForCompare('  6.6  ')).toBe('6.6')
  })

  it('drops a leading v/V prefix', () => {
    expect(normalizeVersionForCompare('v6.6')).toBe('6.6')
    expect(normalizeVersionForCompare('V6.6')).toBe('6.6')
    expect(normalizeVersionForCompare('6.6')).toBe('6.6')
  })
})

describe('isUpdateAvailable', () => {
  describe('semantically equivalent forms are not updates', () => {
    it('treats v-prefix and trailing zero forms as equal', () => {
      expect(isUpdateAvailable('v6.6', 'v6.6.0')).toBe(false)
      expect(isUpdateAvailable('6.6', '6.6.0')).toBe(false)
      expect(isUpdateAvailable('6.6', 'v6.6')).toBe(false)
      expect(isUpdateAvailable('6.6.0', '6.6')).toBe(false)
    })

    it('treats leading-zero forms as equal', () => {
      expect(isUpdateAvailable('6.06', '6.6')).toBe(false)
      expect(isUpdateAvailable('06.6.0', '6.6')).toBe(false)
    })

    it('treats whitespace and case-prefix variants as equal', () => {
      expect(isUpdateAvailable(' 6.6 ', 'v6.6.0')).toBe(false)
      expect(isUpdateAvailable('V6.6', '6.6.0')).toBe(false)
    })

    it('treats four-part versions as equal when padded', () => {
      expect(isUpdateAvailable('6.6', '6.6.0.0')).toBe(false)
      expect(isUpdateAvailable('6.6.0', '6.6.0.0')).toBe(false)
    })

    it('treats equal prerelease tags as equal', () => {
      expect(isUpdateAvailable('1.2.3-beta', '1.2.3-beta')).toBe(false)
      expect(isUpdateAvailable('1.2.3-BETA', '1.2.3-beta')).toBe(false)
    })
  })

  describe('real differences are updates', () => {
    it('detects a patch bump', () => {
      expect(isUpdateAvailable('6.6', '6.6.1')).toBe(true)
      expect(isUpdateAvailable('6.6.0', '6.6.1')).toBe(true)
    })

    it('detects minor and major bumps', () => {
      expect(isUpdateAvailable('6.6.0', '6.7.0')).toBe(true)
      expect(isUpdateAvailable('6.6.0', '7.0.0')).toBe(true)
    })

    it('detects a four-part platform release bump', () => {
      expect(isUpdateAvailable('6.6.0', '6.6.0.1')).toBe(true)
    })

    it('does not report an older remote as an update', () => {
      expect(isUpdateAvailable('6.6.1', '6.6')).toBe(false)
      expect(isUpdateAvailable('6.7.0', '6.6.0')).toBe(false)
    })
  })

  describe('prerelease semantics', () => {
    it('treats a stable release as newer than its prerelease', () => {
      expect(isUpdateAvailable('1.2.3-beta', '1.2.3')).toBe(true)
      expect(isUpdateAvailable('1.2.3', '1.2.3-beta')).toBe(false)
    })

    it('orders prerelease tags numerically and lexically', () => {
      expect(isUpdateAvailable('1.2.3-beta', '1.2.3-beta.1')).toBe(true)
      expect(isUpdateAvailable('1.2.3-beta.2', '1.2.3-beta.1')).toBe(false)
      expect(isUpdateAvailable('1.2.3-beta', '1.2.3-rc')).toBe(true)
      expect(isUpdateAvailable('1.2.3-rc', '1.2.3-beta')).toBe(false)
    })

    it('treats unofficial forks as lower precedence', () => {
      expect(isUpdateAvailable('1.0-unofficial.1', '1.0')).toBe(true)
      expect(isUpdateAvailable('1.0-unofficial.1', '1.0-beta')).toBe(true)
      expect(isUpdateAvailable('1.0-beta', '1.0-unofficial.1')).toBe(false)
    })
  })

  describe('unparseable version strings', () => {
    it('does not report equal normalized labels as updates', () => {
      expect(isUpdateAvailable('2024-11-3', '2024-11-3')).toBe(false)
      expect(isUpdateAvailable('v1.2.3a', '1.2.3a')).toBe(false)
      expect(isUpdateAvailable('unknown', 'unknown')).toBe(false)
    })

    it('reports genuinely different labels as updates', () => {
      expect(isUpdateAvailable('2024-11-3', '2024-11-4')).toBe(true)
      expect(isUpdateAvailable('unknown', 'unknown2')).toBe(true)
    })
  })

  describe('missing versions are conservative', () => {
    it('returns false when either side is missing or blank', () => {
      expect(isUpdateAvailable(null, '6.6.0')).toBe(false)
      expect(isUpdateAvailable(undefined, '6.6.0')).toBe(false)
      expect(isUpdateAvailable('', '6.6.0')).toBe(false)
      expect(isUpdateAvailable('   ', '6.6.0')).toBe(false)
      expect(isUpdateAvailable('6.6.0', null)).toBe(false)
      expect(isUpdateAvailable('6.6.0', '')).toBe(false)
    })
  })
})
