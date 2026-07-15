import { lazy, type ComponentType } from 'react'
import type { WorkbenchModuleRegistration } from '@shared/contracts'

function registration(
  id: string,
  navigation: WorkbenchModuleRegistration['navigation'],
  presentation: WorkbenchModuleRegistration['presentation'],
  projectAccess: WorkbenchModuleRegistration['projectAccess'],
  loadRuntime: () => Promise<{ default: ComponentType }>,
): WorkbenchModuleRegistration {
  return { id, navigation, presentation, projectAccess, createRuntime: () => lazy(loadRuntime), persistenceKey: id }
}

export const mapBrowserRegistration = registration(
  'map-browser',
  { section: 'browse', order: 10, icon: 'map', labelKey: 'map-browser' },
  'browser',
  'none',
  () => import('./ui/module-runtimes/MapBrowserModuleRuntime'),
)
export const eventBrowserRegistration = registration(
  'event-browser',
  { section: 'browse', order: 20, icon: 'events', labelKey: 'event-browser' },
  'browser',
  'none',
  () => import('./ui/module-runtimes/EventBrowserModuleRuntime'),
)
export const characterBrowserRegistration = registration(
  'character-browser',
  { section: 'browse', order: 30, icon: 'characters', labelKey: 'character-browser' },
  'browser',
  'none',
  () => import('./ui/module-runtimes/CharacterBrowserModuleRuntime'),
)
export const buildingBrowserRegistration = registration(
  'building-browser',
  { section: 'browse', order: 40, icon: 'buildings', labelKey: 'building-browser' },
  'browser',
  'none',
  () => import('./ui/module-runtimes/BuildingBrowserModuleRuntime'),
)
export const itemBrowserRegistration = registration(
  'item-browser',
  { section: 'browse', order: 50, icon: 'items', labelKey: 'item-browser' },
  'browser',
  'none',
  () => import('./ui/module-runtimes/ItemBrowserModuleRuntime'),
)
export const modBrowserRegistration = registration(
  'mod-browser',
  { section: 'tools', order: 100, icon: 'package', labelKey: 'mod-browser' },
  'browser',
  'read',
  () => import('./ui/module-runtimes/ModBrowserModuleRuntime'),
)
export const modTranslationRegistration = registration(
  'mod-translation',
  { section: 'tools', order: 110, icon: 'languages', labelKey: 'mod-translation' },
  'standalone',
  'write',
  () => import('./ui/module-runtimes/ModTranslationModuleRuntime'),
)
export const i18nGeneratorRegistration = registration(
  'i18n-generator',
  { section: 'tools', order: 120, icon: 'languages', labelKey: 'i18n-generator' },
  'standalone',
  'none',
  () => import('./ui/module-runtimes/I18nGeneratorModuleRuntime'),
)
export const aiLocalizationRegistration = registration(
  'ai-localization',
  { section: 'tools', order: 130, icon: 'book-open-check', labelKey: 'ai-localization' },
  'standalone',
  'read',
  () => import('./ui/module-runtimes/AiLocalizationModuleRuntime'),
)
export const projectDashboardRegistration = registration(
  'project-dashboard',
  { section: 'authoring', order: 190, icon: 'files', labelKey: 'project-dashboard' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/ProjectDashboardModuleRuntime'),
)
export const projectContentRegistration = registration(
  'project-content',
  { section: 'authoring', order: 200, icon: 'files', labelKey: 'project-content' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/ProjectContentModuleRuntime'),
)
export const mapAuthoringRegistration = registration(
  'map-authoring',
  { section: 'authoring', order: 210, icon: 'map', labelKey: 'map-authoring' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/MapAuthoringModuleRuntime'),
)
export const eventAuthoringRegistration = registration(
  'event-authoring',
  { section: 'authoring', order: 220, icon: 'events', labelKey: 'event-authoring' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/EventAuthoringModuleRuntime'),
)
export const characterAuthoringRegistration = registration(
  'character-authoring',
  { section: 'authoring', order: 230, icon: 'characters', labelKey: 'character-authoring' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/CharacterAuthoringModuleRuntime'),
)
export const buildingAuthoringRegistration = registration(
  'building-authoring',
  { section: 'authoring', order: 240, icon: 'buildings', labelKey: 'building-authoring' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/BuildingAuthoringModuleRuntime'),
)
export const itemAuthoringRegistration = registration(
  'item-authoring',
  { section: 'authoring', order: 250, icon: 'items', labelKey: 'item-authoring' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/ItemAuthoringModuleRuntime'),
)
export const projectTranslationRegistration = registration(
  'project-translation',
  { section: 'authoring', order: 260, icon: 'languages', labelKey: 'project-translation' },
  'authoring',
  'write',
  () => import('./ui/module-runtimes/ProjectTranslationModuleRuntime'),
)
export const devResourceBrowserRegistration = registration(
  'dev-resource-browser',
  { section: 'development', order: 900, icon: 'beaker', labelKey: 'dev-resource-browser' },
  'standalone',
  'none',
  () => import('./ui/module-runtimes/DevResourceBrowserModuleRuntime'),
)
