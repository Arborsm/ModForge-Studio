export { ModWorkspaceDecisionDialogs, WorkspaceDecisionDialog } from './mods/content-patcher/content-view/ModWorkspaceDecisionDialogs'
export { ModBrowserPanel } from './mods/content-patcher/content-view/ModBrowserPanel'
export { ModDiagnosticsPanel } from './mods/content-patcher/content-view/ModDiagnosticsPanel'
export { useModCatalog, type ModCatalogState } from './state/useModCatalog'
export { useModProjectInspection } from './state/useModProjectInspection'
export { useModTranslationWorkspace } from './state/useModTranslationWorkspace'

/* ── Mod browser types & helpers (re-exported from state/browser) ── */
export type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup, ModSourceEntry } from './state/browser'
export { buildModBrowserGroups, buildModEntryLookup, findModBrowserEntry, findModSources, getModBrowserSelectionId } from './state/browser'

/* ── Mod asset index ── */
export { useModAssetIndex } from './state/useModAssetIndex'

/* ── Mod result asset loaders ── */
export { findPreferredModTarget, loadModResultImageState, loadModResultMapDocument, loadModResultJsonValue } from './state/modResultAssets'
export type { ModResultImageState } from './state/modResultAssets'

/* ── Scale-up editor ── */
export type { ScaleUpImageDimensions } from './state/scaleup/types'
export { getScaleUpFrameCount, getScaleUpFramePreviewMetrics } from './state/scaleup/scaleup'
