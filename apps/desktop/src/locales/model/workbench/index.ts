import type { LauncherCopy } from '../launcher'
import type { WorkbenchShellCopy } from './shell'
import type { ViewportLabels, BuildAssetDialogCopy, MapPanelCopy } from './map'
import type { StudioDeskCopy } from './studio-desk'
import type { EventStageCopy } from './event-stage'
import type { CharactersPanelCopy } from './characters'
import type { BuildingsPanelCopy } from './buildings'
import type { ItemsPanelCopy } from './items'
import type { ModuleBlueprintsCopy } from './module-blueprints'
import type { I18nGeneratorCopy } from './i18n-generator'

export type { ModWorkspaceCopy } from './mods'
export type { ModI18nWorkspaceCopy } from './mod-i18n'
export type { ViewMenuCopy } from './view-menu'
export type { WorldAtlasViewId } from './world-atlas'

export type EditorCopy = WorkbenchShellCopy & {
  launcher: LauncherCopy
  studioDesk: StudioDeskCopy
  eventStage: EventStageCopy
  charactersPanel: CharactersPanelCopy
  buildingsPanel: BuildingsPanelCopy
  itemsPanel: ItemsPanelCopy
  moduleBlueprints: ModuleBlueprintsCopy
  i18nGenerator: I18nGeneratorCopy
  viewportLabels: ViewportLabels
  buildAssetDialog: BuildAssetDialogCopy
  mapPanel: MapPanelCopy
}

// Re-export all sub-types for consumer convenience
export type { WorkbenchShellCopy } from './shell'
export type { ViewportLabels, BuildAssetDialogCopy, MapPanelCopy } from './map'
export type { StudioDeskCopy } from './studio-desk'
export type { EventStageCopy, EventWorkflowCopy, EventWorkflowCommandKey, EventScenarioPresetId, ScriptEditorCopy } from './event-stage'
export type { CharactersPanelCopy } from './characters'
export type { BuildingsPanelCopy } from './buildings'
export type { ItemsPanelCopy } from './items'
export type { ModuleBlueprintsCopy } from './module-blueprints'
export type { I18nGeneratorCopy } from './i18n-generator'
