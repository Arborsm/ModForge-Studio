import type { LauncherCopy } from '../launcher'
import type { WorkbenchShellCopy } from './shell'
import type { ViewportLabels, BuildAssetDialogCopy, MapPanelCopy } from './map'
import type { StudioDeskCopy } from './studio-desk'
import type { EventStageCopy } from './event-stage'
import type { CharactersPanelCopy } from './characters'
import type { BuildingsPanelCopy } from './buildings'
import type { ItemsPanelCopy } from './items'
import type { I18nGeneratorCopy } from './i18n-generator'
import type { AiLocalizationCopy } from './ai-localization'

export type { ModWorkspaceCopy } from './mods'
export type { TranslationEditorCopy } from './translation-editor'
export type { ViewMenuCopy } from './view-menu'
export type { WorldAtlasViewId } from './world-atlas'

export type EditorCopy = WorkbenchShellCopy & {
  launcher: LauncherCopy
  studioDesk: StudioDeskCopy
  eventStage: EventStageCopy
  charactersPanel: CharactersPanelCopy
  buildingsPanel: BuildingsPanelCopy
  itemsPanel: ItemsPanelCopy
  i18nGenerator: I18nGeneratorCopy
  aiLocalization: AiLocalizationCopy
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
export type { I18nGeneratorCopy } from './i18n-generator'
export type { AiLocalizationCopy } from './ai-localization'
