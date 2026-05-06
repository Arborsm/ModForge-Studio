import type { ComponentType } from 'react'

export type RegistryItemKind = 'page' | 'workbench-view' | 'workspace-panel'

export type RegistryItemId = string

export type RegistryItemMetadata = {
  id: RegistryItemId
  kind: RegistryItemKind
  title: string
  order?: number
}

export type ComponentFactory<TProps = never> = ComponentType<TProps>

export type DefaultLayoutContract = {
  preferredPanelIds?: readonly string[]
  defaultViewId?: RegistryItemId
}

export type PageRegistration<TProps = never> = RegistryItemMetadata & {
  kind: 'page'
  route: string
  component: ComponentFactory<TProps>
}

export type WorkbenchViewRegistration<TProps = never> = RegistryItemMetadata & {
  kind: 'workbench-view'
  viewId: RegistryItemId
  component: ComponentFactory<TProps>
  layout?: DefaultLayoutContract
}

export type WorkspacePanelRegistration<TProps = never> = RegistryItemMetadata & {
  kind: 'workspace-panel'
  panelId: RegistryItemId
  component: ComponentFactory<TProps>
  defaultLayout?: DefaultLayoutContract
}

export interface AppRegistry {
  readonly pages: readonly PageRegistration[]
  readonly workbenchViews: readonly WorkbenchViewRegistration[]
  readonly workspacePanels: readonly WorkspacePanelRegistration[]
}

export type AppRegistryInput = {
  pages?: readonly PageRegistration[]
  workbenchViews?: readonly WorkbenchViewRegistration[]
  workspacePanels?: readonly WorkspacePanelRegistration[]
}
