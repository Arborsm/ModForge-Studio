import type { ComponentType, LazyExoticComponent } from 'react'

export type RegistryItemId = string
export type RegistryItemKind = 'page' | 'workbench-module'

export type RegistryItemMetadata = {
  id: RegistryItemId
  kind: RegistryItemKind
  title: string
  order?: number
  devOnly?: boolean
}

export type ComponentFactory<TProps = never> = ComponentType<TProps> | LazyExoticComponent<ComponentType<TProps>>

export type PageRegistration<TProps = never> = RegistryItemMetadata & {
  kind: 'page'
  route: string
  component: ComponentFactory<TProps>
}

export type WorkbenchNavigationSection = 'browse' | 'authoring' | 'translation' | 'tools' | 'development'
export type WorkbenchNavigationIcon =
  | 'map'
  | 'events'
  | 'characters'
  | 'buildings'
  | 'items'
  | 'audio'
  | 'package'
  | 'languages'
  | 'files'
  | 'beaker'
  | 'book-open-check'
  | 'book-open'
  | 'dialogue'
  | 'schedule'
  | 'mail'
  | 'bug'
  | 'settings'
  | 'images'
export type WorkbenchModuleLocaleKey =
  | 'map-browser'
  | 'event-browser'
  | 'character-browser'
  | 'building-browser'
  | 'item-browser'
  | 'audio-browser'
  | 'mod-browser'
  | 'mod-translation'
  | 'i18n-generator'
  | 'ai-localization'
  | 'project-dashboard'
  | 'project-content'
  | 'asset-library'
  | 'project-settings'
  | 'map-authoring'
  | 'event-authoring'
  | 'character-authoring'
  | 'building-authoring'
  | 'item-authoring'
  | 'project-translation'
  | 'dialogue-editor'
  | 'schedule-editor'
  | 'mail-editor'
  | 'game-debugger'
  | 'dev-resource-browser'

export type WorkbenchLocation = { kind: 'home' } | { kind: 'module'; moduleId: string }

export type WorkbenchModuleRegistration = {
  id: string
  navigation: {
    section: WorkbenchNavigationSection
    order: number
    icon: WorkbenchNavigationIcon
    labelKey: WorkbenchModuleLocaleKey
  }
  presentation: 'browser' | 'authoring' | 'standalone'
  projectAccess: 'none' | 'read' | 'write'
  /** Creates a fresh lazy runtime so a failed dynamic import can be retried. */
  createRuntime: () => LazyExoticComponent<ComponentType>
  persistenceKey: string
}

export interface AppRegistry {
  readonly pages: readonly PageRegistration<never>[]
  readonly workbenchModules: readonly WorkbenchModuleRegistration[]
}

export type AppRegistryInput = {
  pages?: readonly PageRegistration<never>[]
  workbenchModules?: readonly WorkbenchModuleRegistration[]
}
