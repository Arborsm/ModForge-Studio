import type { ComponentType, LazyExoticComponent } from 'react'

/** Stable string id identifying a page or workbench module in the app registry. */
export type RegistryItemId = string
/** Kind of registry item — either a routable page or a workbench module. */
export type RegistryItemKind = 'page' | 'workbench-module'

/** Base metadata shared by all registry items. */
export type RegistryItemMetadata = {
  id: RegistryItemId
  kind: RegistryItemKind
  title: string
  order?: number
  devOnly?: boolean
}

/** React component or lazy-loaded component factory used by registry entries. */
export type ComponentFactory<TProps = never> = ComponentType<TProps> | LazyExoticComponent<ComponentType<TProps>>

/** Registration entry for a routable page with its route and component. */
export type PageRegistration<TProps = never> = RegistryItemMetadata & {
  kind: 'page'
  route: string
  component: ComponentFactory<TProps>
}

/** Navigation section grouping in the workbench sidebar. */
export type WorkbenchNavigationSection = 'browse' | 'authoring' | 'translation' | 'tools' | 'development'
/** Icon id for a workbench module in the sidebar. */
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
/** Locale key identifying a workbench module's sidebar label. */
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
  | 'plugin-manager'

/** Current workbench location — either the home screen or a specific module. */
export type WorkbenchLocation = { kind: 'home' } | { kind: 'module'; moduleId: string }

/** Registration entry for a workbench module with navigation, presentation, and runtime factory. */
export type WorkbenchModuleRegistration = {
  id: string
  navigation: {
    section: WorkbenchNavigationSection
    order: number
    icon: WorkbenchNavigationIcon
    /** Built-in module label key; mutually exclusive with pluginLabel. */
    labelKey?: WorkbenchModuleLocaleKey
    /** Plugin-provided label, resolved through the plugin locale store. */
    pluginLabel?: { pluginId: string; key: string }
  }
  presentation: 'browser' | 'authoring' | 'standalone'
  projectAccess: 'none' | 'read' | 'write'
  /** Creates a fresh lazy runtime so a failed dynamic import can be retried. */
  createRuntime: () => LazyExoticComponent<ComponentType>
  persistenceKey: string
}

/** Read-only app registry exposing all registered pages and workbench modules. */
export interface AppRegistry {
  readonly pages: readonly PageRegistration<never>[]
  readonly workbenchModules: readonly WorkbenchModuleRegistration[]
}

/** Input shape for building an app registry — partial arrays of pages and modules. */
export type AppRegistryInput = {
  pages?: readonly PageRegistration<never>[]
  workbenchModules?: readonly WorkbenchModuleRegistration[]
}
