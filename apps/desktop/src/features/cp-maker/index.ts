export { buildContentJson, buildManifestJson, useCpMaker, type ContentBuildResult, type UseCpMakerReturn } from './state/useCpMaker'
export {
  buildStudioDeskModel,
  type StudioDeskGallery,
  type StudioDeskGalleryProject,
  type StudioDeskInspiration,
  type StudioDeskInspirationKind,
  type StudioDeskInspirationStatus,
  type StudioDeskModel,
  type StudioDeskProjectCoverTone,
  type StudioDeskProjectStatus,
  type StudioDeskWorkspaceEntrypoint,
  type StudioDeskWorldBible as StudioDeskWorldBibleModel,
  type StudioDeskWorldBibleEntry,
} from './model/studioDeskModel'
export { buildEventPatchHubPatches, type EventPatchHubPatch } from '@entities/event'
export { getPatchActionColor } from './model/patchActionColor'
export { listPatchTargetSuggestions, type PatchTargetAction } from './model/patchTargets'
export { getPackTemplate, PACK_TEMPLATES, type PackTemplate, type PackTemplateId, type PackTemplateSeedPatch } from './model/packTemplates'
export { collectManifestIssues } from './model/manifestValidation'
export { collectTopLevelIssues } from './model/topLevelValidation'
export { buildI18nExtraction, type I18nExtraction } from './model/i18nExtract'
export { collectDraftIssues, collectProjectIssues } from './model/projectValidation'
export {
  deriveUniqueId,
  emptyManifestFormValue,
  formValueToMetadata,
  formValueToMetadataLive,
  metadataToFormValue,
  type ManifestMetadataFormValue,
} from './model/manifestFormState'
export { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from './model/studioDeskFormatting'
export { getWorkspacePlugin, getWorkspacePluginIds, listWorkspacePlugins, registerWorkspacePlugin } from './model/workspaceRegistry'
export type { EditorComponent, EditorProps, EditorResources, WorkspacePlugin } from './model/workspaceRegistry'
export { createAssetDraftPort, EDITOR_ONLY_STATE_KEYS, readDisabledEntryKeys } from './model/draftPort'
export type { AssetDraftPort, AssetDraftPortOptions, AssetEntryMeta } from './model/draftPort'
export { duplicatePatchInArray, groupPatchesByTarget, movePatchWithin } from './model/patchOrder'
export type { PatchTargetGroup } from './model/patchOrder'
export { useAutoSaveDraft } from './model/autoSaveDraft'
export { mapPatchDraftToContentFields, readMapPatchDraft, type MapPatchDraft } from './model/mapPatchDraft'
export { nextDraftEditMergeKey, tagNextDraftEdit, useDraftUndoStore, type DraftUndoEntry } from './model/undoStack'
export { useDraftUndoShortcuts, useDraftUndoState } from './model/useDraftUndoShortcuts'
export { WhenConditionEditor } from './ui/WhenConditionEditor'
export { TokenValueInput } from './ui/TokenValueInput'
export { EditDataAdvancedOps } from './ui/EditDataAdvancedOps'
export {
  readAdvancedFields,
  readMoveEntries,
  readReplacedEntryKeys,
  readTextOperations,
  writeAdvancedFields,
  writeMoveEntries,
  writeTextOperations,
  TEXT_OPERATION_KINDS,
  TEXT_OPERATION_REPLACE_MODES,
  type AdvancedFieldMap,
  type MoveEntryDraft,
  type TextOperationDraft,
} from './model/editDataAdvancedOps'
export { CreateDraftDialog, type CreateDraftInput } from './ui/CreateDraftDialog'
export { ManifestMetadataForm } from './ui/ManifestMetadataForm'
export { DraftUndoButtons } from './ui/DraftUndoButtons'
export { DeleteConfirmDialog } from './ui/DeleteConfirmDialog'
export { GenericPatchEditor } from './ui/GenericPatchEditor'
export { EditorPage } from './ui/EditorPage'
export { ExportDialog } from './ui/ExportDialog'
export { PatchActionIcon } from './ui/PatchActionIcon'
export { PatchListPage } from './ui/PatchListPage'
export { ProjectPropertiesDialog } from './ui/ProjectPropertiesDialog'
export { ProjectSettingsPage } from './ui/ProjectSettingsPage'
export { ConfigSchemaEditor } from './ui/ConfigSchemaEditor'
export { StudioDeskProjectGallery } from './ui/StudioDeskProjectGallery'
export { ExpertModeButton } from './ui/ExpertModeButton'
export { ExpertPanel } from './ui/ExpertPanel'
export { resolveWorkspaceLanding, type WorkspaceLanding } from './model/workspaceLanding'

export type { CpMakerDraftSummary, CpMakerSession } from './model/cpMakerPort'
export type { CpMakerProviderProps } from './model/cpMakerProvider'
export { CpMakerProvider } from './model/cpMakerProvider'
export { useCpMakerPort } from './model/useCpMakerPort'
export type { CpMakerPort } from './model/cpMakerPort'
export type * from './model/types'
