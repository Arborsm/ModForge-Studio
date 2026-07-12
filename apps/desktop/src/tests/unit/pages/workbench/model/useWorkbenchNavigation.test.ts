import { describe, expect, it } from 'vite-plus/test'
import { lazy } from 'react'
import { reduceWorkbenchNavigation, resolveWorkbenchLocation } from '@pages/workbench/model/useWorkbenchNavigation'
import type { WorkbenchModuleRegistration } from '@shared/contracts'

const registration = (presentation: WorkbenchModuleRegistration['presentation']): WorkbenchModuleRegistration => ({
  id: `${presentation}-module`,
  navigation: { section: 'tools', order: 1, icon: 'files', labelKey: 'project-content' },
  presentation,
  projectAccess: presentation === 'authoring' ? 'write' : 'none',
  layout: 'fixed',
  runtime: lazy(async () => ({ default: () => null })),
  persistenceKey: `${presentation}-module`,
})

describe('workbench navigation model', () => {
  it('navigates only between home and module locations', () => {
    const module = reduceWorkbenchNavigation({ kind: 'home' }, { type: 'navigate', location: { kind: 'module', moduleId: 'map-browser' } })
    expect(module).toEqual({ kind: 'module', moduleId: 'map-browser' })
    expect(reduceWorkbenchNavigation(module, { type: 'home' })).toEqual({ kind: 'home' })
  })

  it('resolves unknown modules and authoring modules without a project to home', () => {
    const authoring = registration('authoring')
    const lookup = (moduleId: string) => (moduleId === authoring.id ? authoring : null)

    expect(resolveWorkbenchLocation({ kind: 'module', moduleId: 'missing' }, lookup, true)).toEqual({ kind: 'home' })
    expect(resolveWorkbenchLocation({ kind: 'module', moduleId: authoring.id }, lookup, false)).toEqual({ kind: 'home' })
    expect(resolveWorkbenchLocation({ kind: 'module', moduleId: authoring.id }, lookup, true)).toEqual({
      kind: 'module',
      moduleId: authoring.id,
    })
  })
})
