import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

const SOURCE_ROOT = sourcePath('src')
const PRODUCTION_SOURCE_SEGMENT = /(?:^|\/)(?:tests|dev)(?:\/|$)/

function relativeSourcePath(filePath: string) {
  return relative(process.cwd(), filePath).replaceAll('\\', '/')
}

function isProductionSource(filePath: string) {
  return !PRODUCTION_SOURCE_SEGMENT.test(relativeSourcePath(filePath))
}

// Phase 1 migration targets: all seven high-risk files have been migrated to
// Task Runtime primitives; the set stays empty so any new scattered async
// ownership is rejected outright.
const MIGRATION_TARGETS = new Set<string>([])

// Remaining inventory is legacy and untriaged; each file awaits Phase 1
// classification, migration, or an explicit legal-cleanup decision.
const LEGACY_UNTRIAGED = new Set([
  'src/app/app-shell/AppShell.tsx',
  'src/entities/asset-schema/ui/GameTextLibraryDialog.tsx',
  'src/entities/map/ui/MapLayerThumbnail.tsx',
  'src/features/compat-plugins/runtime/CompatEntryImage.tsx',
  'src/features/compat-plugins/runtime/CompatModuleRuntime.tsx',
  'src/features/cp-maker/state/useCpMaker.ts',
  'src/features/launcher/ui/shared/DiagnosticsPanel.tsx',
  'src/features/launcher/ui/shared/LauncherNexusApiStatusCard.tsx',
  'src/features/resource-browser/ui/ResourcePicker.tsx',
  'src/pages/launcher/library/hooks/useLauncherLibraryController.ts',
  'src/pages/launcher/ui/LauncherConfigurationPage.tsx',
  'src/pages/workbench/model/useDeferredWorkbenchModule.ts',
  'src/pages/workbench/model/useWorkbenchProjectController.ts',
  'src/pages/workbench/ui/PlayerAppearanceWindow.tsx',
  'src/pages/workbench/ui/workspace-panels/audio/AudioPreviewPanel.tsx',
  'src/pages/workbench/workspaces/asset-library/editors/LoadBindingEditor.tsx',
  'src/pages/workbench/workspaces/asset-library/ui/AssetImageThumbnail.tsx',
  'src/pages/workbench/workspaces/asset-library/ui/AssetMapThumbnail.tsx',
  'src/pages/workbench/workspaces/asset-library/ui/PixelEditorDialog.tsx',
  'src/pages/workbench/workspaces/audio/state/useAudioWorkspace.ts',
  'src/pages/workbench/workspaces/building-data/state/useBuildingAuthoringResources.ts',
  'src/pages/workbench/workspaces/building-data/state/useBuildingAuthoringSources.ts',
  'src/pages/workbench/workspaces/building-data/state/useBuildingTexture.ts',
  'src/pages/workbench/workspaces/building-data/ui/BuildingCatalogPage.tsx',
  'src/pages/workbench/workspaces/building-data/ui/BuildingFootprintMapDialog.tsx',
  'src/pages/workbench/workspaces/building/state/useBuildingWorkspace.ts',
  'src/pages/workbench/workspaces/character-data/editors/CharacterDataPatchEditor.tsx',
  'src/pages/workbench/workspaces/character-data/state/useCharacterAuthoringResources.ts',
  'src/pages/workbench/workspaces/character-data/state/useCharacterAuthoringSources.ts',
  'src/pages/workbench/workspaces/character-data/state/useCharacterThumbnail.ts',
  'src/pages/workbench/workspaces/character-data/ui/CharacterCatalogPage.tsx',
  'src/pages/workbench/workspaces/character-data/ui/CharacterPreviewPane.tsx',
  'src/pages/workbench/workspaces/character/state/useCharacterWorkspace.ts',
  'src/pages/workbench/workspaces/debugger/state/useGameDebuggerWorkspace.ts',
  'src/pages/workbench/workspaces/debugger/view/sections/SimpleSections.tsx',
  'src/pages/workbench/workspaces/dialogue/state/useDialogueWorkspace.ts',
  'src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventPatchEditor.tsx',
  'src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventsEditor.tsx',
  'src/pages/workbench/workspaces/event-stage/state/useEventStageWorkspace.ts',
  'src/pages/workbench/workspaces/event-stage/state/useEventWorkspace.ts',
  'src/pages/workbench/workspaces/image-patch/editors/ImagePatchEditor.tsx',
  'src/pages/workbench/workspaces/item-data/state/useItemAuthoringResources.ts',
  'src/pages/workbench/workspaces/item-data/state/useItemAuthoringSources.ts',
  'src/pages/workbench/workspaces/item-data/state/useItemTexture.ts',
  'src/pages/workbench/workspaces/item-data/ui/AddObjectDialog.tsx',
  'src/pages/workbench/workspaces/item-data/ui/ItemCatalogPage.tsx',
  'src/pages/workbench/workspaces/item/state/useItemWorkspace.ts',
  'src/pages/workbench/workspaces/mail/state/useMailWorkspace.ts',
  'src/pages/workbench/workspaces/map/editors/core/AnimatedTilePreview.tsx',
  'src/pages/workbench/workspaces/map/editors/core/MapAnimationDialog.tsx',
  'src/pages/workbench/workspaces/map/editors/core/tileIndexPreview.tsx',
  'src/pages/workbench/workspaces/map/state/useMapAuthoringCatalog.ts',
  'src/pages/workbench/workspaces/map/state/useObjectLightItemIndex.ts',
  'src/pages/workbench/workspaces/map/ui/MapCatalog.tsx',
  'src/pages/workbench/workspaces/map/ui/MapPatchRowThumbnail.tsx',
  'src/pages/workbench/workspaces/mod/state/useModAssetIndex.ts',
  'src/pages/workbench/workspaces/schedule/state/useScheduleWorkspace.ts',
  'src/pages/workbench/workspaces/schedule/view/ScheduleMapPanel.tsx',
  // 合法局部 cleanup：deferred.ts、useDeferredWorkbenchModule.ts、AnimatedTilePreview.tsx。
  'src/shared/lib/react/deferred.ts',
])

// Phase 3 removed every modforge: CustomEvent bridge (settings / compat-plugin
// reload / guide tour / launcher overlay all moved to the appCommands singleton
// or zustand stores). The whitelist is empty: any new bridge is rejected.
const CUSTOM_EVENT_BRIDGES = new Set<string>([])

// 状态四分类登记表（口径见 docs/frontend-architecture.md "State Stores" 节）：
// 全局偏好 / 工作区持久 / 模块 session / domain runtime；
// 跨模块 handoff、一次性信号与运行时注册表为登记的补充机制。
const ZUSTAND_REGISTRY = new Set([
  'src/app/workbenchRegistryStore.ts', // 运行时注册表（补充机制）
  'src/entities/building/model/authoringHandoff.ts', // 跨模块 handoff（补充机制）
  'src/entities/character/model/authoringHandoff.ts', // 跨模块 handoff（补充机制）
  'src/entities/content-patcher/model/pluginConditionSyntaxStore.ts', // domain runtime
  'src/entities/item/model/authoringHandoff.ts', // 跨模块 handoff（补充机制），两阶段为例外保留
  'src/features/compat-plugins/model/compatPluginStore.ts', // domain runtime
  'src/features/compat-plugins/model/pageDescriptorStore.ts', // domain runtime
  'src/features/compat-plugins/model/pluginLocaleStore.ts', // domain runtime
  'src/features/cp-maker/model/undoStack.ts', // 模块 session
  'src/features/guide/model/guideEngine.ts', // domain runtime + 持久化进度
  'src/pages/launcher/ui/mobile/mobilePageStore.ts', // 移动端工具页面栈（Android 宿主返回键联动）
  'src/pages/workbench/model/editModeStore.ts', // 模块 session（工作区交互）
  'src/pages/workbench/model/playerAppearanceStore.ts', // 工作区持久
  'src/pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/editorStore.ts', // 模块 session
  'src/pages/workbench/workspaces/map/model/mapEditorSessions.ts', // 模块 session（地图编辑器会话，跨模块切换存活）
  'src/shared/lib/app-state/assetLibraryFocusStore.ts', // 跨模块 handoff（补充机制）
  'src/shared/lib/app-state/launcherOverlayDismissStore.ts', // 跨模块一次性信号（补充机制，epoch）
  'src/shared/lib/app-state/launcherMobileChromeStore.ts', // 跨模块 handoff（补充机制）：launcher 页面向顶栏注入搜索/标题槽
  'src/shared/lib/app-state/preferencesStore.ts', // 全局偏好主 store
])

async function collectProductionSources() {
  return (await collectRequiredFiles(SOURCE_ROOT, { extensions: ['.ts', '.tsx'], excludePath: /(?:^|\/)(?:tests|dev)(?:\/|$)/ })).filter(
    isProductionSource,
  )
}

async function readSources() {
  const files = await collectProductionSources()
  return Promise.all(
    files.map(async (filePath) => ({ filePath, relativePath: relativeSourcePath(filePath), source: await readFile(filePath, 'utf8') })),
  )
}

describe('async ownership architecture', () => {
  it('rejects unregistered scattered async ownership and enforces the migration inventory', async () => {
    const violations: string[] = []
    const matched = new Set<string>()
    for (const { relativePath, source } of await readSources()) {
      if (!/^\s*(?:let\s+(?:cancelled|isCancelled)\b|(?:let|const)\s+\w*[vV]ersionRef\b)/m.test(source)) continue
      if (!MIGRATION_TARGETS.has(relativePath) && !LEGACY_UNTRIAGED.has(relativePath)) violations.push(relativePath)
      else matched.add(relativePath)
    }
    // A whitelist entry that suppresses nothing is stale and must be removed.
    for (const entry of [...MIGRATION_TARGETS, ...LEGACY_UNTRIAGED]) {
      if (!matched.has(entry)) violations.push(`${entry} (stale whitelist entry)`)
    }
    expect(violations).toEqual([])
  })

  it('keeps modforge CustomEvent bridges on the registered boundary', async () => {
    const violations: string[] = []
    const matched = new Set<string>()
    for (const { relativePath, source } of await readSources()) {
      const isBridge = /modforge:/.test(source) && /window\.(?:dispatchEvent|addEventListener)\s*\(/.test(source)
      if (!isBridge) continue
      if (!CUSTOM_EVENT_BRIDGES.has(relativePath)) violations.push(relativePath)
      else matched.add(relativePath)
    }
    for (const entry of CUSTOM_EVENT_BRIDGES) {
      if (!matched.has(entry)) violations.push(`${entry} (stale whitelist entry)`)
    }
    expect(violations).toEqual([])
  })

  it('keeps direct zustand imports in the registration table', async () => {
    const violations: string[] = []
    const matched = new Set<string>()
    for (const { relativePath, source } of await readSources()) {
      if (!/from\s+['"]zustand['"]/.test(source)) continue
      if (!ZUSTAND_REGISTRY.has(relativePath)) violations.push(relativePath)
      else matched.add(relativePath)
    }
    for (const entry of ZUSTAND_REGISTRY) {
      if (!matched.has(entry)) violations.push(`${entry} (stale whitelist entry)`)
    }
    expect(violations).toEqual([])
  })
})
