export { buildContentJson, buildManifestJson, useCpMaker, type ContentBuildResult, type UseCpMakerReturn } from './state/useCpMaker'
export { getEditModeRoute, type EditModeRoute } from './routing/editModeRoute'
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
export { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from './model/studioDeskFormatting'
export { getWorkspacePlugin, getWorkspacePluginIds, listWorkspacePlugins, registerWorkspacePlugin } from './model/workspaceRegistry'
export type { WorkspacePlugin } from './model/workspaceRegistry'
export { AddPatchDialog } from './ui/AddPatchDialog'
export { ConfigSchemaDialog } from './ui/ConfigSchemaDialog'
export { CreateDraftDialog } from './ui/CreateDraftDialog'
export { DeleteConfirmDialog } from './ui/DeleteConfirmDialog'
export { EditWorkspaceContent } from './ui/EditWorkspaceContent'
export { EditModeShell } from './ui/EditModeShell'
export { EditModeToolbar } from './ui/EditModeToolbar'
export { EditorPage } from './ui/EditorPage'
export { ExportDialog } from './ui/ExportDialog'
export { PatchActionIcon } from './ui/PatchActionIcon'
export { PatchListPage } from './ui/PatchListPage'
export { PatchQuickMenu } from './ui/PatchQuickMenu'
export { PatchSummaryCard } from './ui/PatchSummaryCard'
export { StudioDesk, type StudioDeskProps } from './ui/StudioDesk'
export { StudioDeskMainStage } from './ui/StudioDeskMainStage'
export { StudioDeskProjectGallery } from './ui/StudioDeskProjectGallery'
export { StudioDeskStoryboard } from './ui/StudioDeskStoryboard'
export { StudioDeskWorldBible } from './ui/StudioDeskWorldBible'

export type { CpMakerDraftSummary } from './model/cpMakerPort'
export type { CpMakerProviderProps } from './model/cpMakerProvider'
export { CpMakerProvider } from './model/cpMakerProvider'
export { useCpMakerPort } from './model/useCpMakerPort'
export type { CpMakerPort } from './model/cpMakerPort'
export type * from './model/types'
