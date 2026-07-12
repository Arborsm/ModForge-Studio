import { describe, expect, it } from 'vite-plus/test'
import {
  decodeWorkbenchNavigation,
  encodeWorkbenchNavigation,
  reduceWorkbenchNavigation,
} from '@pages/workbench/model/useWorkbenchNavigation'

describe('workbench navigation model', () => {
  it('canonicalizes registered views as a destination exclusive from workspace tools', () => {
    const tool = decodeWorkbenchNavigation({
      workbenchRoute: 'workspace',
      workspaceMode: 'mod-i18n',
      workspaceViewMode: 'preview',
      registeredWorkbenchViewId: null,
    })
    const registered = reduceWorkbenchNavigation(tool, { type: 'set-registered-view', viewId: 'i18n-generator' })

    expect(registered).toEqual({ kind: 'registered-view', workspaceMode: 'mod-i18n', viewId: 'i18n-generator' })
    expect(encodeWorkbenchNavigation(registered)).toEqual({
      workbenchRoute: 'workspace',
      workspaceMode: 'mod-i18n',
      workspaceViewMode: 'edit',
      registeredWorkbenchViewId: 'i18n-generator',
    })
    expect(reduceWorkbenchNavigation(registered, { type: 'set-view-mode', mode: 'edit' })).toBe(registered)
  })

  it('clears a registered destination when a workspace is selected', () => {
    const registered = decodeWorkbenchNavigation({
      workbenchRoute: 'workspace',
      workspaceMode: 'mod-i18n',
      workspaceViewMode: 'edit',
      registeredWorkbenchViewId: 'i18n-generator',
    })

    expect(reduceWorkbenchNavigation(registered, { type: 'set-workspace', mode: 'map' })).toEqual({
      kind: 'workspace',
      workspaceMode: 'map',
      workspaceViewMode: 'edit',
    })
  })
})
