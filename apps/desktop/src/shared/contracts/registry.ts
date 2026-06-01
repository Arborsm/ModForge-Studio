import type { ComponentType, LazyExoticComponent } from 'react'

export type RegistryItemKind = 'page' | 'workbench-view' | 'workspace-panel'

export type RegistryItemId = string

export type RegistryItemMetadata = {
  id: RegistryItemId
  kind: RegistryItemKind
  title: string
  order?: number
  devOnly?: boolean
}

export type ComponentFactory<TProps = never> = ComponentType<TProps> | LazyExoticComponent<ComponentType<TProps>>

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
  readonly pages: readonly PageRegistration<never>[]
  readonly workbenchViews: readonly WorkbenchViewRegistration<never>[]
  readonly workspacePanels: readonly WorkspacePanelRegistration<never>[]
}

export type AppRegistryInput = {
  pages?: readonly PageRegistration<never>[]
  workbenchViews?: readonly WorkbenchViewRegistration<never>[]
  workspacePanels?: readonly WorkspacePanelRegistration<never>[]
}
