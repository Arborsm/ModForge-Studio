import { describe, expect, it } from 'vite-plus/test'
import { appRegistry, createAppRegistry, getWorkbenchViewRegistration, getWorkspacePanelRegistration } from '@app/registry-setup'
import type { PageRegistration, WorkbenchViewRegistration, WorkspacePanelRegistration } from '@shared/contracts'

describe('registry setup', () => {
  it('publishes the initial static workbench views and workspace panels', () => {
    expect(appRegistry.workbenchViews.map((view) => view.viewId)).toEqual([
      'workspace-editor',
      'mod-browser',
      'mod-i18n',
      'i18n-generator',
      'dev-resource-browser',
    ])
    expect(getWorkbenchViewRegistration('mod-browser')?.activation).toEqual({
      kind: 'workspace',
      workspaceMode: 'mod-browser',
      presentation: 'browser',
    })
    expect(getWorkbenchViewRegistration('workspace-editor')?.requiresProject).toBe(true)
    expect(getWorkbenchViewRegistration('i18n-generator')?.requiresProject).not.toBe(true)
    expect(getWorkbenchViewRegistration('dev-resource-browser')?.requiresProject).not.toBe(true)
    expect(appRegistry.workspacePanels.map((panel) => panel.panelId)).toEqual([
      'assets',
      'viewport',
      'event-timeline',
      'item-navigation',
      'item-catalog',
      'item-details',
    ])
  })

  it('creates isolated copies of registry input arrays', () => {
    const pages: PageRegistration[] = []
    const workbenchViews: WorkbenchViewRegistration[] = [
      {
        id: 'sample-view',
        kind: 'workbench-view',
        title: 'Sample view',
        viewId: 'sample-view',
        category: 'internal',
        activation: { kind: 'component' },
        component: () => null,
      },
    ]
    const workspacePanels: WorkspacePanelRegistration[] = [
      {
        id: 'sample-panel',
        kind: 'workspace-panel',
        title: 'Sample panel',
        panelId: 'sample-panel',
        component: () => null,
      },
    ]

    const registry = createAppRegistry({ pages, workbenchViews, workspacePanels })

    pages.push({ id: 'mutated-page', kind: 'page', title: 'Mutated page', route: '/', component: () => null })
    workbenchViews.push({
      id: 'mutated-view',
      kind: 'workbench-view',
      title: 'Mutated view',
      viewId: 'mutated-view',
      category: 'internal',
      activation: { kind: 'component' },
      component: () => null,
    })
    workspacePanels.push({
      id: 'mutated-panel',
      kind: 'workspace-panel',
      title: 'Mutated panel',
      panelId: 'mutated-panel',
      component: () => null,
    })

    expect(registry.pages).toHaveLength(0)
    expect(registry.workbenchViews).toHaveLength(1)
    expect(registry.workspacePanels).toHaveLength(1)
  })

  it('resolves the registered workbench view and workspace panel by id', () => {
    expect(getWorkbenchViewRegistration('studio-desk')).toBeNull()
    expect(getWorkbenchViewRegistration('workspace-editor')?.viewId).toBe('workspace-editor')
    expect(getWorkbenchViewRegistration('missing-view')).toBeNull()

    expect(getWorkspacePanelRegistration('assets')?.panelId).toBe('assets')
    expect(getWorkspacePanelRegistration('viewport')?.panelId).toBe('viewport')
    expect(getWorkspacePanelRegistration('missing-panel')).toBeNull()
  })
})
