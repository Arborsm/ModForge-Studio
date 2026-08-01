import type { LauncherCopy } from '../launcher'
import type { WorkbenchShellCopy } from './shell'
import type { ViewportLabels, BuildAssetDialogCopy, MapAuthoringCopy, MapPanelCopy } from './map'
import type { StudioDeskCopy } from './studio-desk'
import type { EventStageCopy } from './event-stage'
import type { CharactersPanelCopy } from './characters'
import type { CharacterDataEditorCopy } from './character-data'
import type { BuildingDataEditorCopy } from './building-data'
import type { ItemDataEditorCopy } from './item-data'
import type { AssetAuthoringCopy } from './asset-authoring'
import type { BuildingsPanelCopy } from './buildings'
import type { ItemsPanelCopy } from './items'
import type { I18nGeneratorCopy } from './i18n-generator'
import type { AiLocalizationCopy } from './ai-localization'
import type { DialogueEditorCopy } from './dialogue'
import type { DialogueScriptFieldCopy } from './dialogue-script'
import type { ScheduleEditorCopy } from './schedule'
import type { MailEditorCopy } from './mail'
import type { GameDebuggerCopy } from './debugger'
import type { AuthoringShellCopy } from './authoring-shell'
import type { AssetLibraryCopy } from './asset-library'
import type { ResourceBrowserCopy } from './resource-browser'

export type { ModWorkspaceCopy } from './mods'
export type { TranslationEditorCopy } from './translation-editor'
export type { ViewMenuCopy } from './view-menu'
export type { WorldAtlasViewId } from './world-atlas'

export type EditorCopy = WorkbenchShellCopy & {
  launcher: LauncherCopy
  studioDesk: StudioDeskCopy
  eventStage: EventStageCopy
  charactersPanel: CharactersPanelCopy
  characterDataEditor: CharacterDataEditorCopy
  buildingDataEditor: BuildingDataEditorCopy
  itemDataEditor: ItemDataEditorCopy
  assetAuthoring: AssetAuthoringCopy
  buildingsPanel: BuildingsPanelCopy
  itemsPanel: ItemsPanelCopy
  i18nGenerator: I18nGeneratorCopy
  aiLocalization: AiLocalizationCopy
  dialogueEditor: DialogueEditorCopy
  dialogueScriptField: DialogueScriptFieldCopy
  scheduleEditor: ScheduleEditorCopy
  mailEditor: MailEditorCopy
  gameDebugger: GameDebuggerCopy
  viewportLabels: ViewportLabels
  buildAssetDialog: BuildAssetDialogCopy
  mapPanel: MapPanelCopy
  mapAuthoring: MapAuthoringCopy
  authoringShell: AuthoringShellCopy
  assetLibrary: AssetLibraryCopy
  resourceBrowser: ResourceBrowserCopy
}

// Re-export all sub-types for consumer convenience
export type { WorkbenchShellCopy } from './shell'
export type { ViewportLabels, BuildAssetDialogCopy, MapAuthoringCopy, MapPanelCopy } from './map'
export type { StudioDeskCopy } from './studio-desk'
export type { EventStageCopy, EventWorkflowCopy, EventWorkflowCommandKey, EventScenarioPresetId, ScriptEditorCopy } from './event-stage'
export type { CharactersPanelCopy } from './characters'
export type { CharacterDataEditorCopy } from './character-data'
export type { BuildingDataEditorCopy } from './building-data'
export type { ItemDataEditorCopy } from './item-data'
export type {
  AssetAuthoringCopy,
  AssetEnumLabelKey,
  AssetFieldLabel,
  AssetFieldLabelKey,
  AssetGroupLabelKey,
  AssetIssueMessageKey,
  AssetIssueParams,
  AssetPickerKindKey,
  AssetTextCategoryKey,
} from './asset-authoring'
export type { BuildingsPanelCopy } from './buildings'
export type { ItemsPanelCopy } from './items'
export type { I18nGeneratorCopy } from './i18n-generator'
export type { AiLocalizationCopy } from './ai-localization'
export type { DialogueEditorCopy } from './dialogue'
export type { DialogueCommandCopy, DialogueScriptFieldCopy } from './dialogue-script'
export type { ScheduleEditorCopy } from './schedule'
export type { MailEditorCopy } from './mail'
export type { GameDebuggerCopy } from './debugger'
export type { AuthoringShellCopy } from './authoring-shell'
export type { AssetLibraryCopy, MapLoadBindingCopy, AssetLibraryCreateMapCopy, AssetLibraryMapCategory } from './asset-library'
export type { ResourceBrowserCopy, ResourceBrowserKindKey } from './resource-browser'
