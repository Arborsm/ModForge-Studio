// 编辑器路由页：根据 Patch 类型分发对应编辑器

import type { DraftPatch, CpMakerDraft } from '@shared/contracts'
import type { WorkspaceId } from '@shared/contracts'
import type { GameDirectoryInfo } from '../model/cpMakerPort'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { getWorkspacePlugin } from '@platform/plugins/workspaceRegistry'
import { PreviewModeShell } from './PreviewModeShell'

interface EditorPageProps {
  workspaceId: WorkspaceId
  patch: DraftPatch | null
  draft: CpMakerDraft | null
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  selectedEventKey?: string | null
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  viewMode: 'editor' | 'reference'
}

export function EditorPage({
  workspaceId,
  patch,
  draft,
  onPatchChange,
  onAddVirtualAsset,
  onRemoveVirtualAsset,
  locale,
  theme,
  accentColor,
  viewportLabels,
  selectedEventKey,
  gameRootPath,
  directoryInfo,
  viewMode,
}: EditorPageProps) {
  const showReferenceTab = Boolean(gameRootPath && directoryInfo && locale && theme)

  if (!patch || !draft) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">
        Patch not found.
      </div>
    )
  }

  const plugin = getWorkspacePlugin(workspaceId)
  const Editor = plugin?.editMode.editor
  const shouldShowReference = viewMode === 'reference' && showReferenceTab

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {shouldShowReference ? (
          <PreviewModeShell
            workspaceMode={workspaceId}
            gameRootPath={gameRootPath}
            directoryInfo={directoryInfo}
            locale={locale!}
            theme={theme!}
            accentColor={accentColor ?? '#6366f1'}
            viewportLabels={viewportLabels ?? {} as ViewportLabels}
          />
        ) : Editor ? (
          <Editor
            patch={patch}
            draft={draft}
            onPatchChange={onPatchChange}
            onAddVirtualAsset={onAddVirtualAsset}
            onRemoveVirtualAsset={onRemoveVirtualAsset}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            viewportLabels={viewportLabels}
            selectedEventKey={selectedEventKey}
            gameRootPath={gameRootPath}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">
            No editor registered for {workspaceId} workspace.
          </div>
        )}
      </div>
    </div>
  )
}
