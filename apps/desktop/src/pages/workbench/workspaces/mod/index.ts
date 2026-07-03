export { ContentPatcherDiagnosticsPanel } from './mods/content-patcher/content-view/ContentPatcherDiagnosticsPanel'
export { ContentPatcherExportPanel } from './mods/content-patcher/content-view/ContentPatcherExportPanel'
export { ContentPatcherNavigator } from './mods/content-patcher/content-view/ContentPatcherNavigator'
export { ContentPatcherTracePanel } from './mods/content-patcher/content-view/ContentPatcherTracePanel'
export { ContentPatcherWorkspace } from './mods/content-patcher/content-view/ContentPatcherWorkspace'
export { ModWorkspaceDecisionDialogs, WorkspaceDecisionDialog } from './mods/content-patcher/content-view/ModWorkspaceDecisionDialogs'
export { ModBrowserPanel } from './mods/content-patcher/content-view/ModBrowserPanel'
export type { ContentPatcherBackendSimulationContext } from './mods/content-patcher/content-model/contentPatcher'
export { createDefaultContentPatcherSimulationContext } from './mods/content-patcher/content-model/contentPatcher'
export type { WorkspacePluginDefinition } from './mods/content-patcher/content-model/types'
export { default as useModWorkspace } from './state/useModWorkspace'

/* ── Mod browser types & helpers (re-exported from state/browser) ── */
export type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup, ModSourceEntry } from './state/browser'
export { buildModBrowserGroups, buildModEntryLookup, findModBrowserEntry, findModSources, getModBrowserSelectionId } from './state/browser'

/* ── Mod asset index ── */
export { useModAssetIndex } from './state/useModAssetIndex'

/* ── Mod result asset loaders ── */
export { findPreferredModTarget, loadModResultImageState, loadModResultMapDocument, loadModResultJsonValue } from './state/modResultAssets'
export type { ModResultImageState } from './state/modResultAssets'

/* ── Scale-up editor ── */
export type { ScaleUpBreathType, ScaleUpDraft, ScaleUpEditorState, ScaleUpImageDimensions, ScaleUpSpriteDraft } from './state/scaleup/types'
export {
  getScaleUpEditorState,
  upsertScaleUpEntry,
  getScaleUpFrameBounds,
  getScaleUpFrameCount,
  getScaleUpFramePreviewScale,
  getScaleUpFramePreviewMetrics,
} from './state/scaleup/scaleup'
export { buildScaleUpPreviewModel, withBreathTypeDefaults } from './state/scaleup/preview'
