import type { ComponentType, LazyExoticComponent } from 'react'

export type RegistryItemKind = 'page' | 'workbench-view' | 'workspace-panel'

export type RegistryItemId = string

export type WorkbenchViewCategory = 'internal' | 'tool' | 'dev'
export type WorkbenchNavigationIcon = 'package' | 'languages' | 'beaker'
export type WorkbenchWorkspacePresentation = 'authoring' | 'browser'

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

type WorkbenchViewRegistrationBase = RegistryItemMetadata & {
  kind: 'workbench-view'
  viewId: RegistryItemId
  /** Navigation category for registered workbench views. */
  category: WorkbenchViewCategory
  navigationIcon?: WorkbenchNavigationIcon
  layout?: DefaultLayoutContract
  /** Whether the view requires an active authoring project before it can open. Defaults to false. */
  requiresProject?: boolean
}

export type WorkbenchViewRegistration<TProps = never> = WorkbenchViewRegistrationBase &
  (
    | {
        activation: { kind: 'component' }
        component: ComponentFactory<TProps>
      }
    | {
        activation: {
          kind: 'workspace'
          workspaceMode: RegistryItemId
          /** Controls workspace chrome and whether edit locations can be restored. */
          presentation: WorkbenchWorkspacePresentation
        }
        component?: never
      }
  )

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
