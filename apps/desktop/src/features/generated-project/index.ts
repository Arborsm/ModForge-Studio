export {
  buildContentJson,
  buildManifestJson,
  useGeneratedProject,
  type ContentBuildResult,
  type UseGeneratedProjectReturn,
} from './state/useGeneratedProject'
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
  type StudioDeskProjectFilter,
  type StudioDeskProjectStatus,
  type StudioDeskWorkspaceEntrypoint,
  type StudioDeskWorldBible as StudioDeskWorldBibleModel,
  type StudioDeskWorldBibleEntry,
} from './model/studioDeskModel'
export { buildEventPatchHubPatches, type EventPatchHubPatch } from '@entities/event'
export { getPatchActionColor } from './model/patchActionColor'
export { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from './model/studioDeskFormatting'
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
export { PreviewModeShell } from './ui/PreviewModeShell'
export { StudioDesk, type StudioDeskProps } from './ui/StudioDesk'
export { StudioDeskMainStage } from './ui/StudioDeskMainStage'
export { StudioDeskProjectGallery } from './ui/StudioDeskProjectGallery'
export { StudioDeskStoryboard } from './ui/StudioDeskStoryboard'
export { StudioDeskWorldBible } from './ui/StudioDeskWorldBible'
