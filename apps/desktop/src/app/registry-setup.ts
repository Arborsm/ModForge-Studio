import { EditWorkspaceContent, StudioDesk } from '@features/cp-maker'
import type {
  AppRegistry,
  AppRegistryInput,
  RegistryItemId,
  WorkbenchViewRegistration,
  WorkspacePanelRegistration,
} from '@shared/contracts'

const coreWorkbenchViews: WorkbenchViewRegistration[] = [
  {
    id: 'studio-desk',
    kind: 'workbench-view',
    title: 'Studio Desk',
    order: 10,
    viewId: 'studio-desk',
    component: StudioDesk,
  },
  {
    id: 'workspace-editor',
    kind: 'workbench-view',
    title: 'Workspace Editor',
    order: 20,
    viewId: 'workspace-editor',
    component: EditWorkspaceContent,
  },
]

const coreWorkspacePanels: WorkspacePanelRegistration[] = [
  {
    id: 'assets',
    kind: 'workspace-panel',
    title: 'Assets',
    order: 10,
    panelId: 'assets',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['assets'],
      defaultViewId: 'workspace-editor',
    },
  },
  {
    id: 'viewport',
    kind: 'workspace-panel',
    title: 'Viewport',
    order: 20,
    panelId: 'viewport',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['viewport'],
      defaultViewId: 'workspace-editor',
    },
  },
  {
    id: 'event-timeline',
    kind: 'workspace-panel',
    title: 'Event Timeline',
    order: 30,
    panelId: 'event-timeline',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['event-timeline'],
      defaultViewId: 'workspace-editor',
    },
  },
  {
    id: 'item-navigation',
    kind: 'workspace-panel',
    title: 'Item Navigation',
    order: 40,
    panelId: 'item-navigation',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['item-navigation'],
      defaultViewId: 'workspace-editor',
    },
  },
  {
    id: 'item-catalog',
    kind: 'workspace-panel',
    title: 'Item Catalog',
    order: 50,
    panelId: 'item-catalog',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['item-catalog'],
      defaultViewId: 'workspace-editor',
    },
  },
  {
    id: 'item-details',
    kind: 'workspace-panel',
    title: 'Item Details',
    order: 60,
    panelId: 'item-details',
    component: () => null,
    defaultLayout: {
      preferredPanelIds: ['item-details'],
      defaultViewId: 'workspace-editor',
    },
  },
]

export function createAppRegistry(input: AppRegistryInput = {}): AppRegistry {
  return {
    pages: [...(input.pages ?? [])],
    workbenchViews: [...(input.workbenchViews ?? [])],
    workspacePanels: [...(input.workspacePanels ?? [])],
  }
}

export const appRegistry = createAppRegistry({
  workbenchViews: coreWorkbenchViews,
  workspacePanels: coreWorkspacePanels,
})

export function getWorkbenchViewRegistration(
  viewId: RegistryItemId,
  registry: AppRegistry = appRegistry,
): WorkbenchViewRegistration | null {
  return registry.workbenchViews.find((view) => view.viewId === viewId) ?? null
}

export function getWorkspacePanelRegistration(
  panelId: RegistryItemId,
  registry: AppRegistry = appRegistry,
): WorkspacePanelRegistration | null {
  return registry.workspacePanels.find((panel) => panel.panelId === panelId) ?? null
}
