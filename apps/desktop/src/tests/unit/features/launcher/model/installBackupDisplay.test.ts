import { describe, expect, it } from 'vite-plus/test'
import {
  formatInstallBackupTimestamp,
  formatInstallBackupVersion,
  resolveInstallBackupTitle,
} from '@features/launcher/model/installBackupDisplay'

describe('formatInstallBackupTimestamp', () => {
  it('formats epoch milliseconds as a UTC timestamp', () => {
    expect(formatInstallBackupTimestamp(1700000000000)).toBe('2023-11-14 22:13')
  })

  it('returns null for missing or invalid input', () => {
    expect(formatInstallBackupTimestamp(null)).toBeNull()
    expect(formatInstallBackupTimestamp(undefined)).toBeNull()
    expect(formatInstallBackupTimestamp(Number.NaN)).toBeNull()
    expect(formatInstallBackupTimestamp(0)).toBeNull()
    expect(formatInstallBackupTimestamp(-5)).toBeNull()
  })
})

describe('resolveInstallBackupTitle', () => {
  it('prefers the primary mod name when present', () => {
    expect(resolveInstallBackupTitle({ primaryModName: 'Some Mod', backupId: 'install-1700000000000' })).toBe('Some Mod')
  })

  it('falls back to the backup id for legacy backups', () => {
    expect(resolveInstallBackupTitle({ primaryModName: null, backupId: 'install-1700000000000' })).toBe('install-1700000000000')
    expect(resolveInstallBackupTitle({ primaryModName: '   ', backupId: 'install-1700000000000' })).toBe('install-1700000000000')
  })
})

describe('formatInstallBackupVersion', () => {
  it('prefixes the version with v', () => {
    expect(formatInstallBackupVersion('1.2.3')).toBe('v1.2.3')
  })

  it('returns null when the version is missing or blank', () => {
    expect(formatInstallBackupVersion(null)).toBeNull()
    expect(formatInstallBackupVersion(undefined)).toBeNull()
    expect(formatInstallBackupVersion('  ')).toBeNull()
  })
})
