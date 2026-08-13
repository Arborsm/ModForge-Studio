import { lazy } from 'react'
import { describe, expect, it } from 'vite-plus/test'
import { createAppRegistry, getWorkbenchModuleRegistration } from '@app/registry'
import { appRegistry } from '@app/registry-setup'
import type { WorkbenchModuleRegistration } from '@shared/contracts'

const createRuntime = () => lazy(async () => ({ default: () => null }))

function registration(overrides: Partial<WorkbenchModuleRegistration> = {}): WorkbenchModuleRegistration {
  return {
    id: 'sample',
    navigation: { section: 'tools', order: 1, icon: 'package', labelKey: 'mod-browser' },
    presentation: 'standalone',
    projectAccess: 'none',
    createRuntime,
    persistenceKey: 'sample',
    ...overrides,
  }
}

describe('registry setup', () => {
  it('publishes the complete module matrix with lazy runtimes', () => {
    expect(appRegistry.workbenchModules.map((module) => module.id)).toEqual([
      'map-browser',
      'event-browser',
      'character-browser',
      'building-browser',
      'item-browser',
      'mod-browser',
      'mod-translation',
      'i18n-generator',
      'ai-localization',
      'game-debugger',
      'project-dashboard',
      'project-content',
      'asset-library',
      'project-settings',
      'map-authoring',
      'event-authoring',
      'character-authoring',
      'dialogue-editor',
      'schedule-editor',
      'mail-editor',
      'building-authoring',
      'item-authoring',
      'project-translation',
      ...(import.meta.env.DEV ? ['dev-resource-browser'] : []),
    ])
    expect(appRegistry.workbenchModules.every((module) => module.createRuntime().$$typeof === Symbol.for('react.lazy'))).toBe(true)
    expect(getWorkbenchModuleRegistration(appRegistry, 'project-content')).toMatchObject({
      presentation: 'authoring',
      projectAccess: 'write',
    })
    expect(getWorkbenchModuleRegistration(appRegistry, 'mod-translation')).toMatchObject({
      presentation: 'standalone',
      projectAccess: 'write',
    })
    expect(getWorkbenchModuleRegistration(appRegistry, 'dialogue-editor')).toMatchObject({
      presentation: 'authoring',
      projectAccess: 'write',
    })
    expect(getWorkbenchModuleRegistration(appRegistry, 'schedule-editor')).toMatchObject({
      presentation: 'authoring',
      projectAccess: 'write',
    })
    expect(getWorkbenchModuleRegistration(appRegistry, 'mail-editor')).toMatchObject({
      presentation: 'authoring',
      projectAccess: 'write',
    })
    expect(getWorkbenchModuleRegistration(appRegistry, 'game-debugger')).toMatchObject({
      presentation: 'standalone',
      projectAccess: 'read',
    })
  })

  it('rejects duplicate ids, persistence keys, unknown sections, and browser writes', () => {
    expect(() => createAppRegistry({ workbenchModules: [registration(), registration()] })).toThrow('Duplicate workbench module id')
    expect(() => createAppRegistry({ workbenchModules: [registration(), registration({ id: 'other' })] })).toThrow(
      'Duplicate workbench persistenceKey',
    )
    expect(() =>
      createAppRegistry({
        workbenchModules: [
          registration({ navigation: { section: 'unknown' as never, order: 1, icon: 'package', labelKey: 'mod-browser' } }),
        ],
      }),
    ).toThrow('Unknown workbench navigation section')
    expect(() => createAppRegistry({ workbenchModules: [registration({ presentation: 'browser', projectAccess: 'write' })] })).toThrow(
      'Browser module cannot request write',
    )
  })

  it('resolves modules by stable id', () => {
    expect(getWorkbenchModuleRegistration(appRegistry, 'map-browser')?.persistenceKey).toBe('map-browser')
    expect(getWorkbenchModuleRegistration(appRegistry, 'missing')).toBeNull()
  })
})
