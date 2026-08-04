import { describe, expect, it } from 'vite-plus/test'
import { isArchiveUpdateOnly, planArchiveModRootInstall } from '@features/launcher/model/archiveInstallPlan'

describe('planArchiveModRootInstall', () => {
  it('labels a root as new when nothing is installed for the unique ID', () => {
    expect(planArchiveModRootInstall('1.0.0', '1.0.0', false)).toEqual({
      status: 'new',
      fromVersion: null,
      toVersion: '1.0.0',
    })
    expect(planArchiveModRootInstall(null, null, false)).toEqual({
      status: 'new',
      fromVersion: null,
      toVersion: null,
    })
  })

  it('labels an archive with a newer version as update', () => {
    expect(planArchiveModRootInstall('1.3.0', '1.2.0', true)).toEqual({
      status: 'update',
      fromVersion: '1.2.0',
      toVersion: '1.3.0',
    })
  })

  it('labels an archive with an older version as downgrade', () => {
    expect(planArchiveModRootInstall('1.1.0', '1.2.0', true)).toEqual({
      status: 'downgrade',
      fromVersion: '1.2.0',
      toVersion: '1.1.0',
    })
  })

  it('labels equal versions as reinstall', () => {
    expect(planArchiveModRootInstall('1.2.0', '1.2.0', true)).toEqual({
      status: 'reinstall',
      fromVersion: '1.2.0',
      toVersion: '1.2.0',
    })
  })

  it('treats semantically equivalent forms as reinstall', () => {
    expect(planArchiveModRootInstall('v1.2', '1.2.0', true).status).toBe('reinstall')
    expect(planArchiveModRootInstall('6.6', '6.06', true).status).toBe('reinstall')
  })

  it('treats a stable archive over a prerelease as update', () => {
    expect(planArchiveModRootInstall('1.2.3', '1.2.3-beta', true).status).toBe('update')
    expect(planArchiveModRootInstall('1.2.3-beta', '1.2.3', true).status).toBe('downgrade')
  })

  it('treats an existing install with unknown versions as reinstall', () => {
    expect(planArchiveModRootInstall(null, '1.0.0', true).status).toBe('reinstall')
    expect(planArchiveModRootInstall('1.0.0', null, true).status).toBe('reinstall')
    expect(planArchiveModRootInstall(null, null, true).status).toBe('reinstall')
    expect(planArchiveModRootInstall('', '   ', true).status).toBe('reinstall')
  })

  it('trims version labels before comparing and exposing them', () => {
    const plan = planArchiveModRootInstall(' 2.0.0 ', ' 1.0.0 ', true)
    expect(plan.status).toBe('update')
    expect(plan.fromVersion).toBe('1.0.0')
    expect(plan.toVersion).toBe('2.0.0')
  })
})

describe('isArchiveUpdateOnly', () => {
  it('is false for archives without mod roots', () => {
    expect(isArchiveUpdateOnly([])).toBe(false)
  })

  it('is true when every detected root already exists', () => {
    expect(
      isArchiveUpdateOnly([
        { existingUniqueId: 'ModForge.A', manifestUniqueId: 'ModForge.A' },
        { existingUniqueId: 'ModForge.B', manifestUniqueId: 'ModForge.B' },
      ]),
    ).toBe(true)
  })

  it('is false when any root is a fresh install', () => {
    expect(
      isArchiveUpdateOnly([{ existingUniqueId: 'ModForge.A', manifestUniqueId: 'ModForge.A' }, { manifestUniqueId: 'ModForge.B' }]),
    ).toBe(false)
    expect(isArchiveUpdateOnly([{ manifestUniqueId: 'ModForge.B' }])).toBe(false)
  })

  it('is false when a root carries no unique ID at all', () => {
    expect(isArchiveUpdateOnly([{}])).toBe(false)
  })
})
