/**
 * @file Static app registry composition point: gathers all workbench module registrations.
 */
import {
  assetLibraryRegistration,
  audioBrowserRegistration,
  buildingAuthoringRegistration,
  buildingBrowserRegistration,
  characterAuthoringRegistration,
  characterBrowserRegistration,
  devResourceBrowserRegistration,
  dialogueEditorRegistration,
  eventAuthoringRegistration,
  eventBrowserRegistration,
  gameDebuggerRegistration,
  i18nGeneratorRegistration,
  aiLocalizationRegistration,
  itemAuthoringRegistration,
  itemBrowserRegistration,
  mailEditorRegistration,
  mapAuthoringRegistration,
  mapBrowserRegistration,
  modBrowserRegistration,
  modTranslationRegistration,
  projectContentRegistration,
  projectDashboardRegistration,
  projectSettingsRegistration,
  projectTranslationRegistration,
  scheduleEditorRegistration,
} from '@pages/workbench/module-registrations'
import { createAppRegistry } from './registry'

/** Static workbench modules; in DEV mode additionally includes the dev resource browser module. */
export const staticWorkbenchModules = [
  mapBrowserRegistration,
  eventBrowserRegistration,
  characterBrowserRegistration,
  buildingBrowserRegistration,
  itemBrowserRegistration,
  audioBrowserRegistration,
  modBrowserRegistration,
  modTranslationRegistration,
  i18nGeneratorRegistration,
  aiLocalizationRegistration,
  gameDebuggerRegistration,
  projectDashboardRegistration,
  projectContentRegistration,
  assetLibraryRegistration,
  projectSettingsRegistration,
  mapAuthoringRegistration,
  eventAuthoringRegistration,
  characterAuthoringRegistration,
  dialogueEditorRegistration,
  scheduleEditorRegistration,
  mailEditorRegistration,
  buildingAuthoringRegistration,
  itemAuthoringRegistration,
  projectTranslationRegistration,
  ...(import.meta.env.DEV ? [devResourceBrowserRegistration] : []),
] as const

/** Static app registry built from `staticWorkbenchModules`; used as the no-plugin fallback. */
export const appRegistry = createAppRegistry({
  workbenchModules: staticWorkbenchModules,
})
