// components/generated-project/EditorPage.tsx
// 编辑器路由页：根据 Patch 类型分发对应编辑器

import { useState } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { GameDirectoryInfo } from '../../lib/desktop'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { getWorkspacePlugin } from '../../lib/plugins/workspaceRegistry'
import { PreviewModeShell } from './PreviewModeShell'

interface EditorPageProps {
  workspaceId: WorkspaceId
  patch: DraftPatch | null
  draft: GeneratedProjectDraft | null
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
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
  gameRootPath,
  directoryInfo,
}: EditorPageProps) {
  const [activeTab, setActiveTab] = useState<'editor' | 'reference'>('editor')

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

  return (
    <div className="flex h-full flex-col">
      {/* Editor/Reference Tab */}
      {showReferenceTab ? (
        <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3"
        >
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              activeTab === 'editor'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setActiveTab('editor')}
          >
            Editor
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              activeTab === 'reference'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setActiveTab('reference')}
          >
            Reference
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'reference' && showReferenceTab ? (
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
